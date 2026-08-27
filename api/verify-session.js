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
import { getSellerById, setSellerCustomerId } from './_lib/sellers-store.js';
import { PLANS } from './_lib/plans.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

    const planKey = checkoutSession.metadata?.plan || null;
    if (checkoutSession.customer && !seller.stripeCustomerId) {
      await setSellerCustomerId(seller.id, checkoutSession.customer);
    }

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
