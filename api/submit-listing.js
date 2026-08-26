// Vercel serverless function — POST /api/submit-listing
// Final step of complete-listing.html: saves the seller's park details
// (and uploaded photo URLs) against their account, then emails a
// notification to Marie and a confirmation to the seller, both using the
// site's branded email layout. Requires a logged-in seller — identity
// (name/email/phone) comes from their account, not the form, since that
// was already collected at signup.
import Stripe from 'stripe';
import { ensureSchema, query } from './_lib/db.js';
import { sendEmail } from './_lib/mailer.js';
import { renderEmail } from './_lib/email-template.js';
import { PLANS } from './_lib/plans.js';
import { requireSession } from './_lib/auth.js';
import { getSellerById } from './_lib/sellers-store.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function toCentsOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireSession(req, res);
  if (!session) return;
  const seller = await getSellerById(session.sellerId);
  if (!seller) return res.status(401).json({ error: 'Account not found' });

  const b = req.body || {};
  const sessionId = b.sessionId;
  if (!sessionId) return res.status(400).json({ error: 'Missing checkout session' });
  if (!b.parkName || !String(b.parkName).trim() || !b.parkAddress || !String(b.parkAddress).trim()) {
    return res.status(400).json({ error: 'Park name and address are required' });
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
    if (checkoutSession.client_reference_id !== String(seller.id)) {
      return res.status(403).json({ error: 'This checkout session does not belong to your account' });
    }
    if (checkoutSession.payment_status !== 'paid' && checkoutSession.status !== 'complete') {
      return res.status(400).json({ error: 'This checkout session has not been paid' });
    }

    await ensureSchema();
    const existing = await query('SELECT id FROM ads_listings WHERE order_id = $1', [sessionId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A listing has already been submitted for this checkout session' });
    }

    const planKey = checkoutSession.metadata?.plan || 'level1';
    const plan = PLANS[planKey] || PLANS.level1;
    const photoUrls = Array.isArray(b.photoUrls) ? b.photoUrls.slice(0, 15) : [];

    await query(
      `INSERT INTO ads_listings (
        seller_id, order_id, plan_key, park_name, park_address, num_sites, rv_spaces, tent_spaces, cabins, yurts,
        rental_type, amenities, features, reservation_system, asking_price_cents, annual_revenue_cents,
        occupancy_rate, description, photo_urls
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        seller.id, sessionId, planKey, b.parkName, b.parkAddress, b.numSites || null, b.rvSpaces || null,
        b.tentSpaces || null, b.cabins || null, b.yurts || null, b.rentalType || null,
        Array.isArray(b.amenities) ? b.amenities : [], Array.isArray(b.features) ? b.features : [],
        b.reservationSystem || null, toCentsOrNull(b.askingPrice), toCentsOrNull(b.annualRevenue),
        b.occupancyRate ? Number(b.occupancyRate) : null, b.description || null, photoUrls,
      ]
    );

    const sellerName = `${seller.firstName} ${seller.lastName}`;

    await sendEmail({
      to: 'marie@rvparksales.com',
      subject: `New listing submitted: ${b.parkName} (${plan.name})`,
      html: renderEmail({
        eyebrow: 'New Paid Listing',
        title: `${b.parkName} — ${plan.name}`,
        intro: `${sellerName} just completed their listing after paying for ${plan.name} ($${(plan.monthly / 100).toFixed(0)}/month).`,
        details: [
          ['Seller', sellerName],
          ['Email', seller.email],
          ['Phone', seller.phone],
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
      to: seller.email,
      subject: `You're listed! ${b.parkName} is now advertising on RVParkAds.com`,
      html: renderEmail({
        eyebrow: 'Listing Submitted',
        title: `Thanks, ${seller.firstName}!`,
        intro: `We've received your ${plan.name} listing for ${b.parkName}. Our team will review it and it'll be live shortly. Buyer inquiries will be forwarded straight to ${seller.email} and ${seller.phone}.`,
        details: [
          ['Plan', plan.name],
          ['Park Name', b.parkName],
          ['Park Address', b.parkAddress],
        ],
        cta: { label: 'View Your Account', href: 'https://rvparkads.vercel.app/dashboard.html' },
        closing: "Questions in the meantime? Just reply to this email or call us at (850) 832-0022.",
      }),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('submit-listing error:', err.message);
    return res.status(500).json({ error: 'Could not save your listing. Please try again or contact us directly.' });
  }
}
