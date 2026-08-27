// Vercel serverless function — POST /api/create-checkout-session
// Requires a logged-in seller account. Each checkout pays for one NEW
// listing's subscription — a seller can call this any number of times to
// add more parks/lots under the same account, each billed and managed
// independently. Reuses the seller's Stripe customer (one per account)
// across every listing's subscription instead of creating a duplicate
// customer each time.
import Stripe from 'stripe';
import { PLANS } from './_lib/plans.js';
import { requireSession } from './_lib/auth.js';
import { getSellerById, setSellerCustomerId } from './_lib/sellers-store.js';

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

  const origin = req.headers.origin || `https://${req.headers.host}`;
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
    metadata: { plan: planKey, sellerId: String(seller.id) },
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
