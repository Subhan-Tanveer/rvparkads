// Vercel serverless function — GET /api/verify-session?session_id=...
// complete-listing.html calls this on load to confirm the visitor actually
// paid before showing the listing-details form, and to prefill the email
// Stripe collected at checkout.
import Stripe from 'stripe';
import { ensureSchema, query } from './_lib/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = req.query.session_id;
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id is required' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(200).json({ paid: false });
    }

    await ensureSchema();
    const existing = await query('SELECT id FROM ads_listings WHERE order_id = $1', [sessionId]);

    return res.status(200).json({
      paid: true,
      planKey: session.metadata?.plan || null,
      email: session.customer_details?.email || '',
      alreadyListed: existing.rows.length > 0,
    });
  } catch (err) {
    console.error('verify-session error:', err.message);
    return res.status(400).json({ error: 'Could not verify checkout session' });
  }
}
