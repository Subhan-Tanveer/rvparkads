// GET /api/account — seller's profile + live subscription status + their
// listing (if any). POST /api/account — { action: 'cancel-subscription' }.
// Subscription status is always fetched live from Stripe rather than a
// cached DB column, so it can never drift from reality (e.g. a payment
// failure or a cancellation made directly in Stripe's dashboard).
import Stripe from 'stripe';
import { requireSession } from './_lib/auth.js';
import { getSellerById, getSellerListing } from './_lib/sellers-store.js';
import { PLANS } from './_lib/plans.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Level 1 has a real 3-month minimum commitment (see PLANS.level1.minMonths)
// — computed from the subscription's actual first-payment date
// (Stripe's start_date), not something the client can spoof.
async function getSubscription(seller) {
  if (!seller.stripeSubscriptionId) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(seller.stripeSubscriptionId);
    const plan = seller.planKey ? PLANS[seller.planKey] : null;
    const minMonths = plan?.minMonths || 0;
    const cancelEligibleAt = minMonths > 0 && sub.start_date
      ? addMonths(sub.start_date * 1000, minMonths)
      : null;
    return {
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      canCancel: !cancelEligibleAt || Date.now() >= cancelEligibleAt.getTime(),
      cancelEligibleAt: cancelEligibleAt ? cancelEligibleAt.toISOString() : null,
    };
  } catch (err) {
    console.error('Could not fetch subscription:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const seller = await getSellerById(session.sellerId);
  if (!seller) return res.status(401).json({ error: 'Account not found' });

  if (req.method === 'GET') {
    const subscription = await getSubscription(seller);
    const listing = await getSellerListing(seller.id);
    const plan = seller.planKey ? PLANS[seller.planKey] : null;
    return res.status(200).json({
      seller: { firstName: seller.firstName, lastName: seller.lastName, email: seller.email, phone: seller.phone, isAdmin: seller.isAdmin },
      plan: plan ? { key: seller.planKey, name: plan.name, monthly: plan.monthly, maxPhotos: plan.maxPhotos, maxVideos: plan.maxVideos, minMonths: plan.minMonths } : null,
      subscription,
      listing: listing ? {
        id: listing.id,
        category: listing.category,
        listingName: listing.listing_name,
        listingAddress: listing.listing_address,
        createdAt: listing.created_at,
      } : null,
    });
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};
    if (action === 'cancel-subscription') {
      if (!seller.stripeSubscriptionId) return res.status(400).json({ error: 'No active subscription to cancel' });
      try {
        // Re-check the commitment lock here too, server-side, right before
        // acting — the GET response's canCancel is only ever a UI hint,
        // never trusted as the actual gate.
        const current = await getSubscription(seller);
        if (current && !current.canCancel) {
          const until = new Date(current.cancelEligibleAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          return res.status(400).json({ error: `This plan has a ${PLANS[seller.planKey]?.minMonths}-month minimum commitment. You can cancel starting ${until}.` });
        }

        const sub = await stripe.subscriptions.update(seller.stripeSubscriptionId, { cancel_at_period_end: true });
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
    return res.status(400).json({ error: 'Unknown action' });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
