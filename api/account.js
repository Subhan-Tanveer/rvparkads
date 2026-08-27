// GET /api/account — seller's profile + every listing they own, each with
// its own live subscription status (fetched from Stripe, never a cached
// DB column, so it can't drift from reality). POST /api/account handles
// per-listing actions: cancel-subscription, change-plan (upgrade or
// downgrade), confirm-downgrade (after trimming media to fit the new
// plan's limits). Billing is per-listing, not per-account — a seller can
// own several listings, each independently paid for and managed.
import Stripe from 'stripe';
import { requireSession } from './_lib/auth.js';
import { getSellerById, getSellerListings, getListingById, setListingPlan, setListingMedia } from './_lib/sellers-store.js';
import { PLANS } from './_lib/plans.js';
import { sendEmail } from './_lib/mailer.js';
import { renderEmail } from './_lib/email-template.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function planLabel(key) {
  return (PLANS[key]?.name || key || '').replace('RVParkAds.com — ', '');
}

// Subscription ITEM updates only accept a real Price id — unlike Checkout
// Sessions, `price_data` there doesn't take an inline `product_data`
// (Stripe: "unknown parameter items[0][price_data][product_data]"). So a
// fresh Price (and product) gets created on the fly for every plan
// change — cheap, and normal Stripe practice; no need to dedupe/cache.
async function createPlanPrice(plan) {
  return stripe.prices.create({
    currency: 'usd',
    unit_amount: plan.monthly,
    recurring: { interval: 'month' },
    product_data: { name: plan.name },
  });
}

// Level 1 has a real 3-month minimum commitment (see PLANS.level1.minMonths)
// — computed from the subscription's actual first-payment date (Stripe's
// start_date), not something the client can spoof.
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

async function notifyPlanChange({ listing, seller, fromKey, toKey, direction, trimmedPhotos = 0, trimmedVideos = 0 }) {
  const sellerName = `${seller.firstName} ${seller.lastName}`;
  const verb = direction === 'upgrade' ? 'upgraded' : 'downgraded';
  const trimNote = trimmedPhotos || trimmedVideos
    ? `To fit the new limits, ${[trimmedPhotos && `${trimmedPhotos} photo${trimmedPhotos === 1 ? '' : 's'}`, trimmedVideos && `${trimmedVideos} video${trimmedVideos === 1 ? '' : 's'}`].filter(Boolean).join(' and ')} were removed from the listing.`
    : null;

  await sendEmail({
    to: 'marie@rvparksales.com',
    subject: `Plan ${verb}: ${listing.listing_name} (${planLabel(fromKey)} → ${planLabel(toKey)})`,
    html: renderEmail({
      eyebrow: `Listing ${verb}`,
      title: `${listing.listing_name} — ${planLabel(fromKey)} → ${planLabel(toKey)}`,
      intro: `${sellerName} just ${verb} "${listing.listing_name}" from ${planLabel(fromKey)} to ${planLabel(toKey)}.`,
      sections: [{
        heading: 'Details',
        rows: [
          ['Seller', sellerName],
          ['Email', seller.email],
          ['Listing', listing.listing_name],
          ['From', planLabel(fromKey)],
          ['To', planLabel(toKey)],
        ],
      }],
      closing: trimNote,
      cta: { label: 'View Full Listing', href: `https://rvparkads.com/listing-detail.html?id=${listing.id}` },
    }),
  });

  if (direction === 'downgrade') {
    // Sellers get the upgrade confirmation implicitly (they're the one who
    // triggered it and land straight on the edit page), but a downgrade —
    // especially one that removed their own photos/videos — gets an
    // explicit email so there's a record of exactly what happened.
    await sendEmail({
      to: seller.email,
      subject: `Your plan for ${listing.listing_name} was changed to ${planLabel(toKey)}`,
      html: renderEmail({
        eyebrow: 'Plan Changed',
        title: `${listing.listing_name} is now on ${planLabel(toKey)}`,
        intro: `Your listing "${listing.listing_name}" has been moved from ${planLabel(fromKey)} to ${planLabel(toKey)}.`,
        sections: [{ heading: 'Details', rows: [['From', planLabel(fromKey)], ['To', planLabel(toKey)]] }],
        closing: trimNote || 'Questions about this change? Just reply to this email or call us at (850) 832-0022.',
        cta: { label: 'View Your Account', href: 'https://rvparkads.com/dashboard.html' },
      }),
    });
  }
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const seller = await getSellerById(session.sellerId);
  if (!seller) return res.status(401).json({ error: 'Account not found' });

  if (req.method === 'GET') {
    const listings = await getSellerListings(seller.id);
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

    if (action === 'change-plan') {
      const listing = await requireOwnedListing(req, res, seller);
      if (!listing) return;
      const newPlanKey = req.body?.newPlanKey;
      const newPlan = PLANS[newPlanKey];
      if (!newPlan) return res.status(400).json({ error: 'Unknown plan' });
      if (newPlanKey === listing.plan_key) return res.status(400).json({ error: 'Already on this plan' });
      if (!listing.stripe_subscription_id) return res.status(400).json({ error: 'No active subscription on this listing' });

      const currentPlan = PLANS[listing.plan_key];
      const isUpgrade = newPlan.monthly > currentPlan.monthly;

      if (!isUpgrade) {
        const photoCount = (listing.photo_urls || []).length;
        const videoCount = (listing.video_urls || []).length;
        if (photoCount > newPlan.maxPhotos || videoCount > newPlan.maxVideos) {
          // Can't downgrade yet — the seller has more media than the new
          // plan allows. Send back what they have so the frontend can show
          // a picker instead of just failing.
          return res.status(200).json({
            needsTrim: true,
            maxPhotos: newPlan.maxPhotos,
            maxVideos: newPlan.maxVideos,
            photoUrls: listing.photo_urls || [],
            videoUrls: listing.video_urls || [],
          });
        }
      }

      try {
        const currentSub = await getListingSubscription(listing);
        if (!currentSub?.itemId) return res.status(400).json({ error: 'Could not read current subscription' });
        const newPrice = await createPlanPrice(newPlan);
        // always_invoice + error_if_incomplete charges the prorated amount
        // immediately and rejects the whole update (throws here) if payment
        // fails — the plan only actually changes once they've paid for it.
        await stripe.subscriptions.update(listing.stripe_subscription_id, {
          items: [{ id: currentSub.itemId, price: newPrice.id }],
          proration_behavior: 'always_invoice',
          payment_behavior: 'error_if_incomplete',
        });
        await setListingPlan(listing.id, { planKey: newPlanKey, subscriptionId: listing.stripe_subscription_id });
        await notifyPlanChange({ listing, seller, fromKey: listing.plan_key, toKey: newPlanKey, direction: isUpgrade ? 'upgrade' : 'downgrade' });
        return res.status(200).json({
          ok: true,
          redirectTo: isUpgrade ? `edit-listing.html?id=${listing.id}` : null,
        });
      } catch (err) {
        console.error('Change plan error:', err.message);
        const message = err.code === 'card_declined' || err.type === 'StripeCardError'
          ? 'Your payment method was declined. Please update your card and try again.'
          : 'Could not change your plan. Please try again or contact us.';
        return res.status(400).json({ error: message });
      }
    }

    if (action === 'confirm-downgrade') {
      const listing = await requireOwnedListing(req, res, seller);
      if (!listing) return;
      const newPlanKey = req.body?.newPlanKey;
      const newPlan = PLANS[newPlanKey];
      if (!newPlan) return res.status(400).json({ error: 'Unknown plan' });
      const keepPhotoUrls = Array.isArray(req.body?.keepPhotoUrls) ? req.body.keepPhotoUrls : [];
      const keepVideoUrls = Array.isArray(req.body?.keepVideoUrls) ? req.body.keepVideoUrls : [];

      // Trust nothing from the client except which of the listing's OWN
      // existing media to keep — validate every url is actually theirs,
      // and that the trimmed counts genuinely fit the new plan.
      const ownedPhotos = new Set(listing.photo_urls || []);
      const ownedVideos = new Set(listing.video_urls || []);
      const validPhotos = keepPhotoUrls.filter((u) => ownedPhotos.has(u));
      const validVideos = keepVideoUrls.filter((u) => ownedVideos.has(u));
      if (validPhotos.length > newPlan.maxPhotos || validVideos.length > newPlan.maxVideos) {
        return res.status(400).json({ error: `Select at most ${newPlan.maxPhotos} photos and ${newPlan.maxVideos} videos` });
      }
      if (!listing.stripe_subscription_id) return res.status(400).json({ error: 'No active subscription on this listing' });

      try {
        const currentSub = await getListingSubscription(listing);
        if (!currentSub?.itemId) return res.status(400).json({ error: 'Could not read current subscription' });
        const newPrice = await createPlanPrice(newPlan);
        // Same immediate-payment guarantee as the upgrade path above — if
        // the prorated charge fails, this throws before any media is
        // trimmed or the plan is recorded as changed.
        await stripe.subscriptions.update(listing.stripe_subscription_id, {
          items: [{ id: currentSub.itemId, price: newPrice.id }],
          proration_behavior: 'always_invoice',
          payment_behavior: 'error_if_incomplete',
        });
        await setListingPlan(listing.id, { planKey: newPlanKey, subscriptionId: listing.stripe_subscription_id });
        await setListingMedia(listing.id, { photoUrls: validPhotos, videoUrls: validVideos });
        await notifyPlanChange({
          listing, seller, fromKey: listing.plan_key, toKey: newPlanKey, direction: 'downgrade',
          trimmedPhotos: (listing.photo_urls || []).length - validPhotos.length,
          trimmedVideos: (listing.video_urls || []).length - validVideos.length,
        });
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('Confirm downgrade error:', err.message);
        const message = err.code === 'card_declined' || err.type === 'StripeCardError'
          ? 'Your payment method was declined. Please update your card and try again.'
          : 'Could not change your plan. Please try again or contact us.';
        return res.status(400).json({ error: message });
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
