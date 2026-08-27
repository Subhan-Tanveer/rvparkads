// Vercel serverless function — GET /api/verify-session?session_id=...
// complete-listing.html calls this on load to confirm the logged-in seller
// actually paid before showing the listing-details form. Also the point
// where the seller's Stripe customer id gets saved for reuse on future
// listings (idempotent — safe to call on every page load/refresh, not just
// once), since there's no webhook endpoint in this project. The
// subscription itself gets attached to the new listing row in
// submit-listing.js, not here — nothing to attach it to yet.
import Stripe from 'stripe';
import { ensureSchema, query } from './_lib/db.js';
import { requireSession } from './_lib/auth.js';
import { getSellerById, getListingById, setSellerCustomerId, setListingPlan } from './_lib/sellers-store.js';
import { PLANS } from './_lib/plans.js';
import { notifyPlanChange } from './_lib/plan-notify.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// A plan-change Checkout landed here paid — finish applying it: retire the
// old subscription, record the new one, and figure out where the seller
// needs to go next (add media on an upgrade, pick what to trim on a
// downgrade that no longer fits, or straight back to the dashboard).
// Idempotent: a page refresh or back-button revisit re-derives the same
// result instead of canceling an already-canceled subscription or emailing
// Marie twice.
export async function finalizePlanChange(checkoutSession, seller) {
  const { listingId, newPlanKey, fromPlanKey, oldSubscriptionId } = checkoutSession.metadata;
  const listing = await getListingById(listingId);
  if (!listing || listing.seller_id !== seller.id) {
    return { status: 404, body: { error: 'Listing not found' } };
  }

  const newPlan = PLANS[newPlanKey];
  const alreadyApplied = listing.stripe_subscription_id === checkoutSession.subscription;

  if (!alreadyApplied) {
    if (oldSubscriptionId && oldSubscriptionId !== checkoutSession.subscription) {
      try { await stripe.subscriptions.cancel(oldSubscriptionId); }
      catch (err) { console.error('Could not cancel prior subscription:', err.message); }
    }
    await setListingPlan(listing.id, { planKey: newPlanKey, subscriptionId: checkoutSession.subscription });
    listing.plan_key = newPlanKey;
    listing.stripe_subscription_id = checkoutSession.subscription;
  }

  const isUpgrade = newPlan.monthly > (PLANS[fromPlanKey]?.monthly ?? 0);
  const photoCount = (listing.photo_urls || []).length;
  const videoCount = (listing.video_urls || []).length;
  const needsTrim = !isUpgrade && (photoCount > newPlan.maxPhotos || videoCount > newPlan.maxVideos);

  if (!alreadyApplied && !needsTrim) {
    // Upgrades and downgrades that already fit the new limits are fully
    // final the moment payment clears — notify now. A downgrade that still
    // needs trimming is deliberately NOT notified yet; that email goes out
    // once the seller actually finishes picking what to remove (see
    // api/account.js's confirm-downgrade), so it can report what was kept.
    await notifyPlanChange({ listing, seller, fromKey: fromPlanKey, toKey: newPlanKey, direction: isUpgrade ? 'upgrade' : 'downgrade' });
  }

  const redirectTo = needsTrim
    ? `edit-listing.html?id=${listing.id}&downgradeTo=1&fromPlan=${encodeURIComponent(fromPlanKey)}`
    : isUpgrade
      ? `edit-listing.html?id=${listing.id}`
      : 'dashboard.html';

  return { status: 200, body: { ok: true, planChange: true, redirectTo, needsTrim } };
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

    if (checkoutSession.metadata?.type === 'plan-change') {
      const result = await finalizePlanChange(checkoutSession, seller);
      return res.status(result.status).json(result.body);
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
