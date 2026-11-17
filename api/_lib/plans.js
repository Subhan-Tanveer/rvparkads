// Server-side plan pricing, media limits, and minimum commitment — single
// source of truth for create-checkout-session.js, submit-listing.js,
// upload-token.js, and account.js. Keep in sync with the browser-side
// src/js/plans-data.js. minMonths enforces the actual cancellation lock —
// api/account.js blocks the "Cancel Plan" action until that many months
// have passed since the subscription's first payment.
export const PLANS = {
  level1: { name: 'RVParkAds.com — Sell It Yourself', monthly: 9900, maxPhotos: 6, maxVideos: 0, minMonths: 3 },
  // Marie Hansen is the listing broker (commission set in her listing agreement, paid only on a sale).
  withbroker: { name: 'RVParkAds.com — Sell With Marie (broker)', monthly: 4900, maxPhotos: 6, maxVideos: 0, minMonths: 3, broker: true },
  // Retired Nov 2026: kept so sellers already on them keep working; never sold again.
  level2: { name: 'RVParkAds.com — Buyer Exposure (Level 2)', monthly: 29900, maxPhotos: 10, maxVideos: 1, minMonths: 0, retired: true },
  level3: { name: 'RVParkAds.com — Full Marketing Campaign (Level 3)', monthly: 49900, maxPhotos: 15, maxVideos: 2, minMonths: 0, retired: true },
};
