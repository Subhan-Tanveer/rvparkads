// Vercel serverless function — POST /api/create-checkout-session
// Requires a logged-in seller account. Two distinct things happen here,
// both returning a { url } to redirect the browser to:
//   - No listingId: pay for a brand NEW listing — a real Stripe Checkout
//     Session (mode: subscription), same as before. A seller can call this
//     any number of times to add more parks/lots under the same account,
//     each billed and managed independently.
//   - listingId present: change an EXISTING listing's plan. This is NOT a
//     Checkout Session — it deep-links into Stripe's Billing Portal
//     "confirm this subscription update" flow, which updates the SAME
//     subscription in place with correct proration (never a duplicate
//     subscription charging the full new price on top of what's already
//     been paid this period) while still showing the seller a real
//     Stripe-hosted page to confirm the exact charge.
// Reuses the seller's Stripe customer (one per account) across every
// listing's subscription instead of creating a duplicate customer each time.
import Stripe from 'stripe';
import { PLANS } from './_lib/plans.js';
import { requireSession } from './_lib/auth.js';
import { getSellerById, getListingById, setSellerCustomerId } from './_lib/sellers-store.js';
import { getOrCreateCanonicalPrices, createPlanChangePortalSession } from './_lib/billing-portal.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireSession(req, res);
  if (!session) return;
  let seller = await getSellerById(session.sellerId);
  if (!seller) return res.status(401).json({ error: 'Account not found' });

  const planKey = req.body?.plan;
  const plan = PLANS[planKey];
  if (!plan) return res.status(400).json({ error: 'Unknown plan' });

  const listingId = req.body?.listingId;
  const origin = req.headers.origin || `https://${req.headers.host}`;

  if (listingId) {
    const listing = await getListingById(listingId);
    if (!listing || listing.seller_id !== seller.id) return res.status(404).json({ error: 'Listing not found' });
    if (!listing.stripe_subscription_id) return res.status(400).json({ error: 'No active subscription on this listing' });
    if (planKey === listing.plan_key) return res.status(400).json({ error: 'Already on this plan' });
    if (!seller.stripeCustomerId) return res.status(400).json({ error: 'No billing account on file for this listing' });

    try {
      const [currentSub, canonicalPrices] = await Promise.all([
        stripe.subscriptions.retrieve(listing.stripe_subscription_id),
        getOrCreateCanonicalPrices(),
      ]);
      const itemId = currentSub.items.data[0]?.id;
      if (!itemId) return res.status(400).json({ error: 'Could not read current subscription' });

      const url = await createPlanChangePortalSession({
        customerId: seller.stripeCustomerId,
        subscriptionId: listing.stripe_subscription_id,
        subscriptionItemId: itemId,
        newPriceId: canonicalPrices[planKey].id,
        returnUrl: `${origin}/dashboard.html`,
        afterCompletionUrl: `${origin}/edit-listing.html?id=${listing.id}&portalDone=1`,
      });
      return res.status(200).json({ url });
    } catch (err) {
      console.error('Billing portal session error:', err.message);
      return res.status(500).json({ error: 'Unable to start plan change. Please try again shortly.' });
    }
  }

  const buildParams = (customerId) => ({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: customerId ? undefined : seller.email,
    customer: customerId || undefined,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: plan.name },
        unit_amount: plan.monthly,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    client_reference_id: String(seller.id),
    metadata: { type: 'new-listing', plan: planKey, sellerId: String(seller.id) },
    success_url: `${origin}/complete-listing.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#plans`,
  });

  try {
    const checkoutSession = await stripe.checkout.sessions.create(buildParams(seller.stripeCustomerId));
    res.status(200).json({ url: checkoutSession.url });
  } catch (err) {
    // A stored customer ID can go stale (e.g. it was created against a
    // different Stripe mode/key than the one currently configured, or the
    // customer was deleted directly in Stripe's dashboard) — Stripe
    // reports that as "No such customer". Rather than hard-failing,
    // clear it and retry once by email, which creates a fresh customer.
    if (err.code === 'resource_missing' && seller.stripeCustomerId) {
      console.error('Stale Stripe customer id, retrying by email:', err.message);
      try {
        await setSellerCustomerId(seller.id, null);
        const checkoutSession = await stripe.checkout.sessions.create(buildParams(null));
        return res.status(200).json({ url: checkoutSession.url });
      } catch (retryErr) {
        console.error('Stripe checkout retry error:', retryErr.message);
      }
    } else {
      console.error('Stripe checkout session error:', err.message);
    }
    res.status(500).json({ error: 'Unable to start checkout. Please try again shortly.' });
  }
}
