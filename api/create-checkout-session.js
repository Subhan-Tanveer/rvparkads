// Vercel serverless function — POST /api/create-checkout-session
// Requires a logged-in seller account — picking a plan happens after
// signup/login now, so the resulting subscription is tied to a real
// account (client_reference_id) instead of an anonymous Stripe session.
// Requires STRIPE_SECRET_KEY as an env var.
import Stripe from 'stripe';
import { PLANS } from './_lib/plans.js';
import { requireSession } from './_lib/auth.js';
import { getSellerById } from './_lib/sellers-store.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireSession(req, res);
  if (!session) return;
  const seller = await getSellerById(session.sellerId);
  if (!seller) return res.status(401).json({ error: 'Account not found' });

  const planKey = req.body?.plan;
  const plan = PLANS[planKey];
  if (!plan) return res.status(400).json({ error: 'Unknown plan' });

  try {
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: seller.stripeCustomerId ? undefined : seller.email,
      customer: seller.stripeCustomerId || undefined,
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
    res.status(200).json({ url: checkoutSession.url });
  } catch (err) {
    console.error('Stripe checkout session error:', err.message);
    res.status(500).json({ error: 'Unable to start checkout. Please try again shortly.' });
  }
}
