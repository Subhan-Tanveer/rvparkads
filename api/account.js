// GET /api/account — seller's profile + every listing they own, each with
// its own live subscription status (fetched from Stripe, never a cached
// DB column, so it can't drift from reality). POST /api/account handles
// per-listing actions: cancel-subscription, confirm-downgrade (trimming
// media after a downgrade Checkout that dropped below the seller's current
// media count), update-media. Billing is per-listing, not per-account — a
// seller can own several listings, each independently paid for and
// managed. Actually CHANGING plans is a real Stripe Checkout redirect
// (see api/create-checkout-session.js + api/verify-session.js), not
// something this endpoint does directly — a plan only changes once the
// seller has re-confirmed payment on Stripe's own page, never silently in
// the background.
import Stripe from 'stripe';
import { requireSession } from './_lib/auth.js';
import { getSellerById, getSellerListings, getListingById, setListingMedia, enforceMediaLimits } from './_lib/sellers-store.js';
import { PLANS } from './_lib/plans.js';
import { notifyPlanChange } from './_lib/plan-notify.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Level 1 has a real 3-month minimum commitment (see PLANS.level1.minMonths)
// — computed from the subscription's actual first-payment date (Stripe's
// start_date), not something the client can spoof. This lock only ever
// blocks cancellation; upgrading or downgrading a plan is allowed anytime.
async function getListingSubscription(listing) {
  if (!listing.stripe_subscription_id) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(listing.stripe_subscription_id);
    const plan = PLANS[listing.plan_key];
    const minMonths = plan?.minMonths || 0;
    const cancelEligibleAt = minMonths > 0 && sub.start_date ? addMonths(sub.start_date * 1000, minMonths) : null;
    return {
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      canCancel: !cancelEligibleAt || Date.now() >= cancelEligibleAt.getTime(),
      cancelEligibleAt: cancelEligibleAt ? cancelEligibleAt.toISOString() : null,
      itemId: sub.items.data[0]?.id,
    };
  } catch (err) {
    console.error('Could not fetch subscription:', err.message);
    return null;
  }
}

function mapListingSummary(listing, subscription) {
  const plan = PLANS[listing.plan_key];
  return {
    id: listing.id,
    category: listing.category,
    listingName: listing.listing_name,
    listingAddress: listing.listing_address,
    createdAt: listing.created_at,
    plan: plan ? { key: listing.plan_key, name: plan.name, monthly: plan.monthly, maxPhotos: plan.maxPhotos, maxVideos: plan.maxVideos, minMonths: plan.minMonths } : null,
    subscription,
    photoCount: (listing.photo_urls || []).length,
    videoCount: (listing.video_urls || []).length,
  };
}

async function requireOwnedListing(req, res, seller) {
  const { listingId } = req.body || {};
  if (!listingId) { res.status(400).json({ error: 'listingId is required' }); return null; }
  const listing = await getListingById(listingId);
  if (!listing || listing.seller_id !== seller.id) { res.status(404).json({ error: 'Listing not found' }); return null; }
  return listing;
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const seller = await getSellerById(session.sellerId);
  if (!seller) return res.status(401).json({ error: 'Account not found' });

  if (req.method === 'GET') {
    // Safety net: if a downgrade's media never got explicitly trimmed (the
    // seller closed the tab on the "pick what to remove" screen instead of
    // finishing it), this is the point that self-heals it — every listing
    // gets checked against its CURRENT plan's limits on every dashboard
    // load, so the mismatch can't linger indefinitely even if they never
    // go back to that screen.
    const rawListings = await getSellerListings(seller.id);
    const listings = await Promise.all(rawListings.map((l) => enforceMediaLimits(l)));
    const withSubs = await Promise.all(listings.map(async (l) => mapListingSummary(l, await getListingSubscription(l))));
    return res.status(200).json({
      seller: { firstName: seller.firstName, lastName: seller.lastName, email: seller.email, phone: seller.phone, isAdmin: seller.isAdmin },
      listings: withSubs,
    });
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};

    if (action === 'cancel-subscription') {
      const listing = await requireOwnedListing(req, res, seller);
      if (!listing) return;
      if (!listing.stripe_subscription_id) return res.status(400).json({ error: 'No active subscription to cancel' });
      try {
        const current = await getListingSubscription(listing);
        if (current && !current.canCancel) {
          const until = new Date(current.cancelEligibleAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          return res.status(400).json({ error: `This plan has a ${PLANS[listing.plan_key]?.minMonths}-month minimum commitment. You can cancel starting ${until}.` });
        }
        const sub = await stripe.subscriptions.update(listing.stripe_subscription_id, { cancel_at_period_end: true });
        return res.status(200).json({
          ok: true,
          subscription: {
            status: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            canCancel: true,
            cancelEligibleAt: current?.cancelEligibleAt || null,
          },
        });
      } catch (err) {
        console.error('Cancel subscription error:', err.message);
        return res.status(400).json({ error: 'Could not cancel subscription. Please try again or contact us.' });
      }
    }

    // Reached from edit-listing.html's forced-trim screen after a downgrade
    // Checkout has ALREADY completed (verify-session.js applied the new
    // plan_key the moment payment cleared) — this step only picks which
    // existing photos/videos survive the new plan's limits. No Stripe call
    // here; the money already moved.
    if (action === 'confirm-downgrade') {
      const listing = await requireOwnedListing(req, res, seller);
      if (!listing) return;
      const plan = PLANS[listing.plan_key];
      if (!plan) return res.status(400).json({ error: 'Unknown plan' });
      const keepPhotoUrls = Array.isArray(req.body?.keepPhotoUrls) ? req.body.keepPhotoUrls : [];
      const keepVideoUrls = Array.isArray(req.body?.keepVideoUrls) ? req.body.keepVideoUrls : [];

      // Trust nothing from the client except which of the listing's OWN
      // existing media to keep — validate every url is actually theirs,
      // and that the trimmed counts genuinely fit the current plan.
      const ownedPhotos = new Set(listing.photo_urls || []);
      const ownedVideos = new Set(listing.video_urls || []);
      const validPhotos = keepPhotoUrls.filter((u) => ownedPhotos.has(u));
      const validVideos = keepVideoUrls.filter((u) => ownedVideos.has(u));
      if (validPhotos.length > plan.maxPhotos || validVideos.length > plan.maxVideos) {
        return res.status(400).json({ error: `Select at most ${plan.maxPhotos} photos and ${plan.maxVideos} videos` });
      }

      try {
        await setListingMedia(listing.id, { photoUrls: validPhotos, videoUrls: validVideos });
        const fromPlanKey = typeof req.body?.fromPlanKey === 'string' ? req.body.fromPlanKey : listing.plan_key;
        await notifyPlanChange({
          listing, seller, fromKey: fromPlanKey, toKey: listing.plan_key, direction: 'downgrade',
          trimmedPhotos: (listing.photo_urls || []).length - validPhotos.length,
          trimmedVideos: (listing.video_urls || []).length - validVideos.length,
        });
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('Confirm downgrade error:', err.message);
        return res.status(400).json({ error: 'Could not save your changes. Please try again or contact us.' });
      }
    }

    if (action === 'update-media') {
      const listing = await requireOwnedListing(req, res, seller);
      if (!listing) return;
      const plan = PLANS[listing.plan_key];
      const photoUrls = Array.isArray(req.body?.photoUrls) ? req.body.photoUrls.slice(0, plan.maxPhotos) : [];
      const videoUrls = Array.isArray(req.body?.videoUrls) ? req.body.videoUrls.slice(0, plan.maxVideos) : [];
      await setListingMedia(listing.id, { photoUrls, videoUrls });
      return res.status(200).json({ ok: true, photoUrls, videoUrls });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
