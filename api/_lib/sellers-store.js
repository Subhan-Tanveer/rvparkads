// Seller account CRUD — signup, login verification, profile lookup, plus
// per-listing reads/writes. Billing lives on each listing (its own
// stripe_subscription_id/plan_key), not the seller account, so one account
// can own several listings/parks, each independently paid for, upgraded,
// downgraded, or canceled. The seller keeps one stripe_customer_id, reused
// across every listing's subscription so Stripe doesn't create a
// duplicate customer per listing.
import bcrypt from 'bcryptjs';
import { query, ensureSchema } from './db.js';
import { PLANS } from './plans.js';

function mapSeller(row) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    stripeCustomerId: row.stripe_customer_id,
    isAdmin: row.is_admin,
  };
}

export async function signupSeller({ firstName, lastName, email, phone, password }) {
  await ensureSchema();
  if (!firstName || !lastName || !email || !phone || !password) {
    throw new Error('All fields are required');
  }
  if (password.length < 8) throw new Error('Password must be at least 8 characters');

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await query('SELECT id FROM ads_sellers WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) throw new Error('An account with this email already exists');

  const passwordHash = bcrypt.hashSync(password, 10);
  const res = await query(
    `INSERT INTO ads_sellers (email, password_hash, first_name, last_name, phone)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [normalizedEmail, passwordHash, firstName.trim(), lastName.trim(), phone.trim()]
  );
  return mapSeller(res.rows[0]);
}

export async function verifySellerLogin(email, password) {
  await ensureSchema();
  const res = await query('SELECT * FROM ads_sellers WHERE email = $1', [String(email || '').trim().toLowerCase()]);
  const row = res.rows[0];
  if (!row || !bcrypt.compareSync(password || '', row.password_hash)) return null;
  return mapSeller(row);
}

export async function getSellerById(id) {
  await ensureSchema();
  const res = await query('SELECT * FROM ads_sellers WHERE id = $1', [id]);
  const row = res.rows[0];
  return row ? mapSeller(row) : null;
}

export async function setSellerCustomerId(id, customerId) {
  const res = await query('UPDATE ads_sellers SET stripe_customer_id = $2 WHERE id = $1 RETURNING *', [id, customerId]);
  return mapSeller(res.rows[0]);
}

// A seller's own listings (dashboard "Your Listings" list) — every one
// they own, not just the most recent.
export async function getSellerListings(sellerId) {
  await ensureSchema();
  const res = await query('SELECT * FROM ads_listings WHERE seller_id = $1 ORDER BY created_at DESC', [sellerId]);
  return res.rows;
}

// Admin-only reads — every listing across every seller, or one in full
// detail. Callers are responsible for checking seller.isAdmin first.
export async function getAllListings() {
  await ensureSchema();
  const res = await query(`
    SELECT l.*, s.first_name, s.last_name, s.email AS seller_email, s.phone AS seller_phone
    FROM ads_listings l JOIN ads_sellers s ON s.id = l.seller_id
    ORDER BY l.created_at DESC
  `);
  return res.rows;
}

export async function getListingById(id) {
  await ensureSchema();
  const res = await query(`
    SELECT l.*, s.first_name, s.last_name, s.email AS seller_email, s.phone AS seller_phone
    FROM ads_listings l JOIN ads_sellers s ON s.id = l.seller_id
    WHERE l.id = $1
  `, [id]);
  return res.rows[0] || null;
}

// Full-detail edit — everything the seller filled in at submission time,
// editable afterward by either the seller (their own listing) or Marie
// (any listing, on the seller's behalf). Deliberately excludes plan/
// billing/media fields (those go through setListingPlan/setListingMedia,
// which have their own Stripe/upload-limit rules) so this can't be used
// to bypass them.
export async function updateListingDetails(id, {
  category, listingName, listingAddress, numSites, rvSpaces, fullHookupSpaces, tentSpaces,
  cabins, yurts, rentalTypes, reservationSystem, annualRevenueCents, occupancyRate, expansionLand,
  lotSize, hoaFeesCents, communityActivities, amenities, features, askingPriceCents, ownerFinancing, description,
}) {
  const res = await query(
    `UPDATE ads_listings SET
      category = $2, listing_name = $3, listing_address = $4, num_sites = $5, rv_spaces = $6,
      full_hookup_spaces = $7, tent_spaces = $8, cabins = $9, yurts = $10, rental_types = $11,
      reservation_system = $12, annual_revenue_cents = $13, occupancy_rate = $14, expansion_land = $15,
      lot_size = $16, hoa_fees_cents = $17, community_activities = $18, amenities = $19, features = $20,
      asking_price_cents = $21, owner_financing = $22, description = $23
     WHERE id = $1 RETURNING *`,
    [
      id, category, listingName, listingAddress,
      category === 'park' ? (numSites || null) : null,
      category === 'park' ? (rvSpaces || null) : null,
      category === 'park' ? (fullHookupSpaces || null) : null,
      category === 'park' ? (tentSpaces || null) : null,
      category === 'park' ? (cabins || null) : null,
      category === 'park' ? (yurts || null) : null,
      category === 'park' ? (rentalTypes || []) : [],
      category === 'park' ? (reservationSystem || null) : null,
      category === 'park' ? (annualRevenueCents ?? null) : null,
      category === 'park' ? (occupancyRate ?? null) : null,
      category === 'park' ? !!expansionLand : false,
      category === 'lot' ? (lotSize || null) : null,
      category === 'lot' ? (hoaFeesCents ?? null) : null,
      category === 'lot' ? (communityActivities || null) : null,
      amenities || [],
      category === 'park' ? (features || []) : [],
      askingPriceCents ?? null, !!ownerFinancing, description || null,
    ]
  );
  return res.rows[0] || null;
}

export async function setListingPlan(id, { planKey, subscriptionId }) {
  const res = await query(
    'UPDATE ads_listings SET plan_key = $2, stripe_subscription_id = $3 WHERE id = $1 RETURNING *',
    [id, planKey, subscriptionId]
  );
  return res.rows[0];
}

export async function setListingMedia(id, { photoUrls, videoUrls }) {
  const res = await query(
    'UPDATE ads_listings SET photo_urls = $2, video_urls = $3 WHERE id = $1 RETURNING *',
    [id, photoUrls, videoUrls]
  );
  return res.rows[0];
}

// Safety net for a downgrade that never got explicitly trimmed — e.g. the
// seller closed the tab on the "pick what to remove" screen instead of
// finishing it. Called every time a listing is read back (dashboard load,
// listing detail, edit page) so the mismatch can't linger indefinitely:
// if what's stored exceeds the CURRENT plan's limits, silently keep just
// the first N (oldest-added) photos/videos and drop the rest. Mutates and
// returns the same row object so callers don't need to re-fetch.
export async function enforceMediaLimits(listing) {
  const plan = PLANS[listing.plan_key];
  if (!plan) return listing;
  const photoUrls = listing.photo_urls || [];
  const videoUrls = listing.video_urls || [];
  if (photoUrls.length <= plan.maxPhotos && videoUrls.length <= plan.maxVideos) return listing;

  const trimmedPhotos = photoUrls.slice(0, plan.maxPhotos);
  const trimmedVideos = videoUrls.slice(0, plan.maxVideos);
  await setListingMedia(listing.id, { photoUrls: trimmedPhotos, videoUrls: trimmedVideos });
  listing.photo_urls = trimmedPhotos;
  listing.video_urls = trimmedVideos;
  return listing;
}
