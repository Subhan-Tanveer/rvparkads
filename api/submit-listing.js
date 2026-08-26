// Vercel serverless function — POST /api/submit-listing
// Final step of complete-listing.html: saves the seller's listing details
// (whole park or single lot — and uploaded photo URLs) against their
// account, then emails a notification to Marie and a confirmation to the
// seller, both using the site's branded email layout. Requires a
// logged-in seller — identity (name/email/phone) comes from their
// account, not the form, since that was already collected at signup.
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

function formatUsd(v) {
  return v ? `$${Number(v).toLocaleString('en-US')}` : null;
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
  const category = b.category === 'lot' ? 'lot' : 'park';
  if (!b.listingName || !String(b.listingName).trim() || !b.listingAddress || !String(b.listingAddress).trim()) {
    return res.status(400).json({ error: `${category === 'lot' ? 'Lot' : 'Park'} name and address are required` });
  }

  try {
    const sessionId = b.sessionId || null;
    let planKey;
    if (sessionId) {
      const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
      if (checkoutSession.client_reference_id !== String(seller.id)) {
        return res.status(403).json({ error: 'This checkout session does not belong to your account' });
      }
      if (checkoutSession.payment_status !== 'paid' && checkoutSession.status !== 'complete') {
        return res.status(400).json({ error: 'This checkout session has not been paid' });
      }
      planKey = checkoutSession.metadata?.plan || 'level1';
    } else {
      if (!seller.planKey) return res.status(400).json({ error: 'Choose a plan first' });
      planKey = seller.planKey;
    }

    await ensureSchema();
    const existing = await query('SELECT id FROM ads_listings WHERE seller_id = $1', [seller.id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A listing has already been submitted for your account' });
    }

    const plan = PLANS[planKey] || PLANS.level1;
    const photoUrls = Array.isArray(b.photoUrls) ? b.photoUrls.slice(0, plan.maxPhotos) : [];
    const videoUrls = Array.isArray(b.videoUrls) ? b.videoUrls.slice(0, plan.maxVideos) : [];
    const rentalTypes = Array.isArray(b.rentalTypes) ? b.rentalTypes : [];
    const ownerFinancing = !!b.ownerFinancing;
    const expansionLand = category === 'park' && !!b.expansionLand;

    const inserted = await query(
      `INSERT INTO ads_listings (
        seller_id, order_id, plan_key, category, listing_name, listing_address, num_sites, rv_spaces,
        full_hookup_spaces, tent_spaces, cabins, yurts, rental_types, reservation_system, annual_revenue_cents,
        occupancy_rate, expansion_land, lot_size, hoa_fees_cents, community_activities, amenities, features,
        asking_price_cents, owner_financing, description, photo_urls, video_urls
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING id`,
      [
        seller.id, sessionId, planKey, category, b.listingName, b.listingAddress,
        category === 'park' ? (b.numSites || null) : null,
        category === 'park' ? (b.rvSpaces || null) : null,
        category === 'park' ? (b.fullHookupSpaces || null) : null,
        category === 'park' ? (b.tentSpaces || null) : null,
        category === 'park' ? (b.cabins || null) : null,
        category === 'park' ? (b.yurts || null) : null,
        category === 'park' ? rentalTypes : [],
        category === 'park' ? (b.reservationSystem || null) : null,
        category === 'park' ? toCentsOrNull(b.annualRevenue) : null,
        category === 'park' ? (b.occupancyRate ? Number(b.occupancyRate) : null) : null,
        expansionLand,
        category === 'lot' ? (b.lotSize || null) : null,
        category === 'lot' ? toCentsOrNull(b.hoaFees) : null,
        category === 'lot' ? (b.communityActivities || null) : null,
        Array.isArray(b.amenities) ? b.amenities : [],
        category === 'park' ? (Array.isArray(b.features) ? b.features : []) : [],
        toCentsOrNull(b.askingPrice), ownerFinancing, b.description || null, photoUrls, videoUrls,
      ]
    );
    const listingId = inserted.rows[0].id;

    const sellerName = `${seller.firstName} ${seller.lastName}`;
    const amenitiesList = Array.isArray(b.amenities) && b.amenities.length ? b.amenities.join(', ') : null;
    const featuresList = Array.isArray(b.features) && b.features.length ? b.features.join(', ') : null;
    const rentalTypesList = rentalTypes.length ? rentalTypes.join(', ') : null;
    const askingPriceFmt = formatUsd(b.askingPrice);

    const detailRows = category === 'lot'
      ? [
          ['Lot Name', b.listingName],
          ['Address', b.listingAddress],
          ['Lot Size', b.lotSize],
          ['HOA Fees', b.hoaFees ? `${formatUsd(b.hoaFees)}/month` : null],
          ['Community Activities', b.communityActivities],
        ]
      : [
          ['Park Name', b.listingName],
          ['Address', b.listingAddress],
          ['Number of Sites', b.numSites],
          ['RV Spaces', b.rvSpaces],
          ['Full Hook Up Spaces', b.fullHookupSpaces],
          ['Tent Sites', b.tentSpaces],
          ['Cabins', b.cabins],
          ['Yurts', b.yurts],
          ['Rental Type', rentalTypesList],
          ['Reservation System', b.reservationSystem],
          ['Annual Revenue', formatUsd(b.annualRevenue)],
          ['Occupancy Rate', b.occupancyRate ? `${b.occupancyRate}%` : null],
          ['Extra Land for Expansion', expansionLand ? 'Yes' : 'No'],
        ];

    const financialRows = [
      ['Asking Price', askingPriceFmt],
      ['Owner Financing Considered', ownerFinancing ? 'Yes' : 'No'],
    ];

    const videoRows = videoUrls.map((url, i) => [`Video ${i + 1}`, url]);
    const categoryLabel = category === 'lot' ? 'RV Lot' : 'RV Park';

    // Marie gets the full listing — every field the seller entered,
    // grouped into sections so it's scannable at a glance instead of one
    // long undifferentiated table.
    await sendEmail({
      to: 'marie@rvparksales.com',
      subject: `New listing submitted: ${b.listingName} (${plan.name})`,
      html: renderEmail({
        eyebrow: `New Paid ${categoryLabel} Listing`,
        title: `${b.listingName} — ${plan.name}`,
        intro: `${sellerName} just completed their ${categoryLabel} listing after paying for ${plan.name} ($${(plan.monthly / 100).toFixed(0)}/month).`,
        sections: [
          {
            heading: 'Seller',
            rows: [
              ['Name', sellerName],
              ['Email', seller.email],
              ['Phone', seller.phone],
              ['Plan', plan.name],
            ],
          },
          { heading: categoryLabel, rows: detailRows },
          { heading: 'Financials', rows: financialRows },
          {
            heading: 'Amenities & Features',
            rows: [
              ['Amenities', amenitiesList],
              ['Features', featuresList],
            ],
          },
          ...(videoRows.length ? [{ heading: 'Videos', rows: videoRows }] : []),
        ],
        closing: b.description ? `Description: ${b.description}` : null,
        photos: photoUrls,
        cta: { label: 'View Full Listing', href: `https://rvparkads.vercel.app/listing-detail.html?id=${listingId}` },
      }),
    });

    // Seller gets a matching copy of everything they submitted — a record
    // of exactly what's going live, not just a bare confirmation.
    await sendEmail({
      to: seller.email,
      subject: `You're listed! ${b.listingName} is now advertising on RVParkAds.com`,
      html: renderEmail({
        eyebrow: 'Listing Submitted',
        title: `Thanks, ${seller.firstName}!`,
        intro: `We've received your ${plan.name} listing for ${b.listingName}. Our team will review it and it'll be live shortly. Buyer inquiries will be forwarded straight to ${seller.email} and ${seller.phone}.`,
        sections: [
          { heading: 'Your Listing', rows: [['Plan', plan.name], ...detailRows] },
          { heading: 'Financials', rows: financialRows },
          {
            heading: 'Amenities & Features',
            rows: [
              ['Amenities', amenitiesList],
              ['Features', featuresList],
            ],
          },
          ...(videoRows.length ? [{ heading: 'Videos', rows: videoRows }] : []),
        ],
        photos: photoUrls,
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
