// GET /api/admin-listings — every listing across every seller (list view).
// Admin-only (ads_sellers.is_admin).
// GET /api/admin-listings?id=X — one listing in full detail, including
// seller identity and every field they submitted. Allowed for an admin, OR
// for the seller who owns that listing (so a seller can see their own
// listing's full detail page too) — anyone else gets 403, so nobody can
// browse other sellers' listings by guessing an id.
import { requireSession } from './_lib/auth.js';
import { getSellerById, getAllListings, getListingById } from './_lib/sellers-store.js';
import { PLANS } from './_lib/plans.js';

function mapListing(row) {
  return {
    id: row.id,
    sellerName: `${row.first_name} ${row.last_name}`,
    sellerEmail: row.seller_email,
    sellerPhone: row.seller_phone,
    planKey: row.plan_key,
    planName: (PLANS[row.plan_key] || {}).name || row.plan_key,
    parkName: row.park_name,
    parkAddress: row.park_address,
    numSites: row.num_sites,
    rvSpaces: row.rv_spaces,
    tentSpaces: row.tent_spaces,
    cabins: row.cabins,
    yurts: row.yurts,
    rentalType: row.rental_type,
    reservationSystem: row.reservation_system,
    amenities: row.amenities || [],
    features: row.features || [],
    askingPriceCents: row.asking_price_cents,
    annualRevenueCents: row.annual_revenue_cents,
    occupancyRate: row.occupancy_rate,
    description: row.description,
    photoUrls: row.photo_urls || [],
    createdAt: row.created_at,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireSession(req, res);
  if (!session) return;
  const seller = await getSellerById(session.sellerId);
  if (!seller) return res.status(401).json({ error: 'Account not found' });

  const { id } = req.query;
  if (id) {
    const listing = await getListingById(id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (!seller.isAdmin && listing.seller_id !== seller.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    return res.status(200).json({ listing: mapListing(listing) });
  }

  if (!seller.isAdmin) return res.status(403).json({ error: 'Not authorized' });
  const listings = await getAllListings();
  return res.status(200).json({ listings: listings.map(mapListing) });
}
