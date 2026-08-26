// Vercel serverless function — POST /api/submit-listing
// Final step of complete-listing.html: saves the seller's park details
// (and uploaded photo URLs) against their paid Stripe session, then emails
// a notification to Marie and a confirmation to the seller, both using the
// site's branded email layout.
import Stripe from 'stripe';
import { ensureSchema, query } from './_lib/db.js';
import { sendEmail } from './_lib/mailer.js';
import { renderEmail } from './_lib/email-template.js';
import { PLANS } from './_lib/plans.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function toIntOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function toCentsOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const b = req.body || {};
  const sessionId = b.sessionId;
  if (!sessionId) return res.status(400).json({ error: 'Missing checkout session' });

  const required = ['firstName', 'lastName', 'email', 'phone', 'parkName', 'parkAddress'];
  for (const field of required) {
    if (!b[field] || !String(b[field]).trim()) {
      return res.status(400).json({ error: `${field} is required` });
    }
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(400).json({ error: 'This checkout session has not been paid' });
    }

    await ensureSchema();
    const existing = await query('SELECT id FROM ads_listings WHERE order_id = $1', [sessionId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A listing has already been submitted for this checkout session' });
    }

    const planKey = session.metadata?.plan || 'level1';
    const plan = PLANS[planKey] || PLANS.level1;
    const photoUrls = Array.isArray(b.photoUrls) ? b.photoUrls.slice(0, 15) : [];

    await query(
      `INSERT INTO ads_listings (
        order_id, plan_key, seller_first_name, seller_last_name, seller_email, seller_phone,
        park_name, park_address, num_sites, rv_spaces, tent_spaces, cabins, yurts, rental_type,
        amenities, features, reservation_system, asking_price_cents, annual_revenue_cents,
        occupancy_rate, description, photo_urls
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        sessionId, planKey, b.firstName, b.lastName, b.email, b.phone,
        b.parkName, b.parkAddress, b.numSites || null, b.rvSpaces || null, b.tentSpaces || null,
        b.cabins || null, b.yurts || null, b.rentalType || null,
        Array.isArray(b.amenities) ? b.amenities : [], Array.isArray(b.features) ? b.features : [],
        b.reservationSystem || null, toCentsOrNull(b.askingPrice), toCentsOrNull(b.annualRevenue),
        b.occupancyRate ? Number(b.occupancyRate) : null, b.description || null, photoUrls,
      ]
    );

    const sellerName = `${b.firstName} ${b.lastName}`;

    await sendEmail({
      to: 'marie@rvparksales.com',
      subject: `New listing submitted: ${b.parkName} (${plan.name})`,
      html: renderEmail({
        eyebrow: 'New Paid Listing',
        title: `${b.parkName} — ${plan.name}`,
        intro: `${sellerName} just completed their listing after paying for ${plan.name} ($${(plan.monthly / 100).toFixed(0)}/month).`,
        details: [
          ['Seller', sellerName],
          ['Email', b.email],
          ['Phone', b.phone],
          ['Park Name', b.parkName],
          ['Park Address', b.parkAddress],
          ['Plan', plan.name],
          ['Number of Sites', b.numSites],
          ['Rental Type', b.rentalType],
          ['Asking Price', b.askingPrice ? `$${Number(b.askingPrice).toLocaleString('en-US')}` : null],
          ['Annual Revenue', b.annualRevenue ? `$${Number(b.annualRevenue).toLocaleString('en-US')}` : null],
          ['Occupancy Rate', b.occupancyRate ? `${b.occupancyRate}%` : null],
          ['Photos Uploaded', String(photoUrls.length)],
        ],
      }),
    });

    await sendEmail({
      to: b.email,
      subject: `You're listed! ${b.parkName} is now advertising on RVParkAds.com`,
      html: renderEmail({
        eyebrow: 'Listing Submitted',
        title: `Thanks, ${b.firstName}!`,
        intro: `We've received your ${plan.name} listing for ${b.parkName}. Our team will review it and it'll be live shortly. Buyer inquiries will be forwarded straight to ${b.email} and ${b.phone}.`,
        details: [
          ['Plan', plan.name],
          ['Park Name', b.parkName],
          ['Park Address', b.parkAddress],
        ],
        closing: "Questions in the meantime? Just reply to this email or call us at (850) 832-0022.",
      }),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('submit-listing error:', err.message);
    return res.status(500).json({ error: 'Could not save your listing. Please try again or contact us directly.' });
  }
}
