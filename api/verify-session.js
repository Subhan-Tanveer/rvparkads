// Vercel serverless function — GET /api/verify-session
// Two distinct things this handles, both keyed by whichever query param is
// present:
//   - ?session_id=... : complete-listing.html calls this on load to confirm
//     the logged-in seller actually paid before showing the listing-details
//     form (a brand new listing's Checkout Session). Also the point where
//     the seller's Stripe customer id gets saved for reuse on future
//     listings. Idempotent — safe on every page load/refresh.
//   - ?listingId=... : edit-listing.html calls this after returning from a
//     Billing Portal plan-change confirm flow (see api/_lib/billing-portal.js
//     and api/create-checkout-session.js) — there's no session id to check a
//     payment status against there, since Stripe already changed the
//     subscription's price directly. Instead this reads the subscription's
//     CURRENT price back from Stripe and syncs our DB to match.
// No webhook endpoint in this project — both paths are "sync on return"
// instead.
import Stripe from 'stripe';
import { ensureSchema, query } from './_lib/db.js';
import { requireSession } from './_lib/auth.js';
import { getSellerById, getListingById, setSellerCustomerId, setListingPlan } from './_lib/sellers-store.js';
import { PLANS } from './_lib/plans.js';
import { notifyPlanChange } from './_lib/plan-notify.js';
import { getCurrentPlanKeyFromSubscription } from './_lib/billing-portal.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Figures out where the seller needs to go next after their listing's
// plan_key changes: add media on an upgrade, pick what to trim on a
// downgrade that no longer fits, or straight back to the dashboard.
// Idempotent: re-deriving this for a plan that's already applied just
// recomputes the same redirect without emailing Marie twice.
async function applyNewPlan(listing, seller, { fromKey, toKey, alreadyApplied }) {
  const newPlan = PLANS[toKey];
  const isUpgrade = newPlan.monthly > (PLANS[fromKey]?.monthly ?? 0);
  const photoCount = (listing.photo_urls || []).length;
  const videoCount = (listing.video_urls || []).length;
  const needsTrim = !isUpgrade && (photoCount > newPlan.maxPhotos || videoCount > newPlan.maxVideos);

  if (!alreadyApplied && !needsTrim) {
    // Upgrades and downgrades that already fit the new limits are fully
    // final the moment payment clears — notify now. A downgrade that still
    // needs trimming is deliberately NOT notified yet; that email goes out
    // once the seller actually finishes picking what to remove (see
    // api/account.js's confirm-downgrade), so it can report what was kept.
    await notifyPlanChange({ listing, seller, fromKey, toKey, direction: isUpgrade ? 'upgrade' : 'downgrade' });
  }

  const redirectTo = needsTrim
    ? `edit-listing.html?id=${listing.id}&downgradeTo=1&fromPlan=${encodeURIComponent(fromKey)}`
    : isUpgrade
      ? `edit-listing.html?id=${listing.id}`
      : 'dashboard.html';

  return { ok: true, paid: true, planChange: true, redirectTo, needsTrim };
}

async function handlePlanChangeSync(listingId, seller) {
  const listing = await getListingById(listingId);
  if (!listing || listing.seller_id !== seller.id) {
    return { status: 404, body: { error: 'Listing not found' } };
  }
  if (!listing.stripe_subscription_id) {
    return { status: 400, body: { error: 'No active subscription on this listing' } };
  }

  const sub = await stripe.subscriptions.retrieve(listing.stripe_subscription_id);
  const newPlanKey = await getCurrentPlanKeyFromSubscription(sub);
  if (!newPlanKey) {
    // Nothing changed (they backed out of the portal, or it's already on a
    // one-off price from before this canonical-price setup existed) —
    // nothing to sync, just send them back.
    return { status: 200, body: { ok: true, paid: true, planChange: false, redirectTo: 'dashboard.html', needsTrim: false } };
  }

  const fromKey = listing.plan_key;
  const alreadyApplied = newPlanKey === fromKey;
  if (!alreadyApplied) {
    await setListingPlan(listing.id, { planKey: newPlanKey, subscriptionId: listing.stripe_subscription_id });
    listing.plan_key = newPlanKey;
  }

  const body = await applyNewPlan(listing, seller, { fromKey, toKey: newPlanKey, alreadyApplied });
  return { status: 200, body };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireSession(req, res);
  if (!session) return;
  const seller = await getSellerById(session.sellerId);
  if (!seller) return res.status(401).json({ error: 'Account not found' });

  const listingId = req.query.listingId;
  if (listingId && typeof listingId === 'string') {
    try {
      const result = await handlePlanChangeSync(listingId, seller);
      return res.status(result.status).json(result.body);
    } catch (err) {
      console.error('Plan change sync error:', err.message);
      return res.status(400).json({ error: 'Could not confirm your plan change' });
    }
  }

  const sessionId = req.query.session_id;
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id is required' });
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
    if (checkoutSession.client_reference_id !== String(seller.id)) {
      return res.status(403).json({ error: 'This checkout session does not belong to your account' });
    }
    if (checkoutSession.payment_status !== 'paid' && checkoutSession.status !== 'complete') {
      return res.status(200).json({ paid: false });
    }

    if (checkoutSession.customer && !seller.stripeCustomerId) {
      await setSellerCustomerId(seller.id, checkoutSession.customer);
    }

    const planKey = checkoutSession.metadata?.plan || null;
    await ensureSchema();
    const existing = await query('SELECT id FROM ads_listings WHERE order_id = $1', [sessionId]);

    const plan = PLANS[planKey] || PLANS.level1;
    return res.status(200).json({
      paid: true,
      planKey,
      maxPhotos: plan.maxPhotos,
      maxVideos: plan.maxVideos,
      alreadyListed: existing.rows.length > 0,
    });
  } catch (err) {
    console.error('verify-session error:', err.message);
    return res.status(400).json({ error: 'Could not verify checkout session' });
  }
}
