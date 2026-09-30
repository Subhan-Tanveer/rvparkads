// Best-effort hand-off to RVParkSelect.com. A NEW listing arrives there as
// a DRAFT (hidden from members) that Marie reviews and publishes; edits
// made here afterwards update that same row without changing whether it's
// a draft or published (see RVParkSelect's api/import-listing.js). Never throws —
// callers should never let this block or fail their own request just
// because RVParkSelect is unreachable or misconfigured.
//
// `row` must carry the seller-joined fields (first_name, last_name,
// seller_email, seller_phone) alongside the plain ads_listings columns —
// a bare `INSERT ... RETURNING *`/`UPDATE ... RETURNING *` row doesn't
// have these, since seller identity lives on ads_sellers, not
// ads_listings. Callers must attach them (see sellers-store.js's
// getListingById(), or a manual `{...row, first_name, last_name,
// seller_email, seller_phone}` spread right after their own insert).
// RVParkSelect gates this behind an NDA the buyer signs (see its
// nda-store.js) before showing it to anyone — never shown raw.
export async function syncListingToSelect(row, { mediaOnly = false } = {}) {
  if (!process.env.SELECT_SITE_URL || !process.env.ADS_IMPORT_SECRET) return;
  try {
    await fetch(`${process.env.SELECT_SITE_URL}/api/import-listing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Import-Secret': process.env.ADS_IMPORT_SECRET },
      body: JSON.stringify({
        sourceAdsListingId: row.id,
        // When true and the listing already exists over there, only its
        // photos/videos are updated — Marie's own edits to the other fields
        // on RVParkSelect are left alone.
        mediaOnly,
        category: row.category,
        listingName: row.listing_name,
        listingAddress: row.listing_address,
        askingPriceCents: row.asking_price_cents,
        description: row.description,
        photoUrls: row.photo_urls || [],
        videoUrls: row.video_urls || [],
        numSites: row.num_sites,
        rvSpaces: row.rv_spaces,
        fullHookupSpaces: row.full_hookup_spaces,
        tentSpaces: row.tent_spaces,
        cabins: row.cabins,
        yurts: row.yurts,
        rentalTypes: row.rental_types || [],
        reservationSystem: row.reservation_system,
        annualRevenueCents: row.annual_revenue_cents,
        // Postgres returns NUMERIC columns as strings, not numbers —
        // coerce so it survives RVParkSelect's Number.isFinite() check.
        occupancyRate: row.occupancy_rate != null ? Number(row.occupancy_rate) : null,
        expansionLand: row.expansion_land,
        lotSize: row.lot_size,
        hoaFeesCents: row.hoa_fees_cents,
        communityActivities: row.community_activities,
        amenities: row.amenities || [],
        features: row.features || [],
        ownerFinancing: row.owner_financing,
        // Only used when the listing is first created over there (a By Owner
        // seller's listing arrives pre-marked); later syncs never overwrite
        // what Marie has set on RVParkSelect.
        byOwner: row.seller_role === 'owner',
        sellerName: row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : null,
        sellerEmail: row.seller_email || null,
        sellerPhone: row.seller_phone || null,
      }),
    });
  } catch (err) {
    console.error('RVParkSelect sync failed (non-fatal):', err.message);
  }
}
