// GET /api/admin-listings — every listing across every seller (list view).
// Admin-only (ads_sellers.is_admin).
// GET /api/admin-listings?id=X — one listing in full detail, including
// seller identity and every field they submitted. Allowed for an admin, OR
// for the seller who owns that listing (so a seller can see their own
// listing's full detail page too) — anyone else gets 403, so nobody can
// browse other sellers' listings by guessing an id.
import { requireSession } from './_lib/auth.js';
import { getSellerById, getAllListings, getListingById, updateListingDetails } from './_lib/sellers-store.js';
import { PLANS } from './_lib/plans.js';
import { syncListingToSelect } from './_lib/select-sync.js';

function mapListing(row) {
  return {
    id: row.id,
    sellerName: `${row.first_name} ${row.last_name}`,
    sellerEmail: row.seller_email,
    sellerPhone: row.seller_phone,
    planKey: row.plan_key,
    planName: (PLANS[row.plan_key] || {}).name || row.plan_key,
    category: row.category,
    listingName: row.listing_name,
    listingAddress: row.listing_address,
    numSites: row.num_sites,
    rvSpaces: row.rv_spaces,
    fullHookupSpaces: row.full_hookup_spaces,
    tentSpaces: row.tent_spaces,
    cabins: row.cabins,
    yurts: row.yurts,
    rentalTypes: row.rental_types || [],
    reservationSystem: row.reservation_system,
    amenities: row.amenities || [],
    features: row.features || [],
    askingPriceCents: row.asking_price_cents,
    annualRevenueCents: row.annual_revenue_cents,
    occupancyRate: row.occupancy_rate,
    ownerFinancing: row.owner_financing,
    expansionLand: row.expansion_land,
    lotSize: row.lot_size,
    hoaFeesCents: row.hoa_fees_cents,
    communityActivities: row.community_activities,
    description: row.description,
    photoUrls: row.photo_urls || [],
    videoUrls: row.video_urls || [],
    createdAt: row.created_at,
  };
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;
  const seller = await getSellerById(session.sellerId);
  if (!seller) return res.status(401).json({ error: 'Account not found' });

  if (req.method === 'GET') {
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

  if (req.method === 'PUT') {
    // Full-detail edit — the seller can edit their own listing, Marie can
    // edit any listing on the seller's behalf. Every edit is immediately
    // re-synced to RVParkSelect.com so a buyer there never sees stale
    // info after Marie or the seller fixes something here.
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing listing id' });
    const listing = await getListingById(id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (!seller.isAdmin && listing.seller_id !== seller.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const category = req.body?.category === 'lot' ? 'lot' : 'park';
    const { listingName, listingAddress } = req.body || {};
    if (!listingName || !String(listingName).trim() || !listingAddress || !String(listingAddress).trim()) {
      return res.status(400).json({ error: `${category === 'lot' ? 'Lot' : 'Park'} name and address are required` });
    }

    try {
      const updated = await updateListingDetails(id, {
        category,
        listingName,
        listingAddress,
        numSites: req.body.numSites || null,
        rvSpaces: req.body.rvSpaces || null,
        fullHookupSpaces: req.body.fullHookupSpaces || null,
        tentSpaces: req.body.tentSpaces || null,
        cabins: req.body.cabins || null,
        yurts: req.body.yurts || null,
        rentalTypes: Array.isArray(req.body.rentalTypes) ? req.body.rentalTypes : [],
        reservationSystem: req.body.reservationSystem || null,
        annualRevenueCents: Number.isFinite(req.body.annualRevenueCents) ? Math.max(0, Math.round(req.body.annualRevenueCents)) : null,
        occupancyRate: Number.isFinite(req.body.occupancyRate) ? req.body.occupancyRate : null,
        expansionLand: !!req.body.expansionLand,
        lotSize: req.body.lotSize || null,
        hoaFeesCents: Number.isFinite(req.body.hoaFeesCents) ? Math.max(0, Math.round(req.body.hoaFeesCents)) : null,
        communityActivities: req.body.communityActivities || null,
        amenities: Array.isArray(req.body.amenities) ? req.body.amenities : [],
        features: Array.isArray(req.body.features) ? req.body.features : [],
        askingPriceCents: Number.isFinite(req.body.askingPriceCents) ? Math.max(0, Math.round(req.body.askingPriceCents)) : null,
        ownerFinancing: !!req.body.ownerFinancing,
        description: typeof req.body.description === 'string' ? req.body.description.slice(0, 3000) : null,
      });
      const updatedWithSeller = { ...updated, first_name: listing.first_name, last_name: listing.last_name, seller_email: listing.seller_email, seller_phone: listing.seller_phone };
      await syncListingToSelect(updatedWithSeller);
      return res.status(200).json({ ok: true, listing: mapListing(updatedWithSeller) });
    } catch (err) {
      console.error('Update listing details error:', err.message);
      return res.status(400).json({ error: 'Could not save changes' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
