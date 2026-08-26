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

async function getSubscription(seller) {
  if (!seller.stripeSubscriptionId) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(seller.stripeSubscriptionId);
    return {
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
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
      seller: { firstName: seller.firstName, lastName: seller.lastName, email: seller.email, phone: seller.phone },
      plan: plan ? { key: seller.planKey, name: plan.name, monthly: plan.monthly } : null,
      subscription,
      listing: listing ? {
        parkName: listing.park_name,
        parkAddress: listing.park_address,
        createdAt: listing.created_at,
      } : null,
    });
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};
    if (action === 'cancel-subscription') {
      if (!seller.stripeSubscriptionId) return res.status(400).json({ error: 'No active subscription to cancel' });
      try {
        const sub = await stripe.subscriptions.update(seller.stripeSubscriptionId, { cancel_at_period_end: true });
        return res.status(200).json({
          ok: true,
          subscription: {
            status: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
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
