// Server-side plan pricing, media limits, and minimum commitment — single
// source of truth for create-checkout-session.js, submit-listing.js,
// upload-token.js, and account.js. Keep in sync with the browser-side
// src/js/plans-data.js. minMonths enforces the actual cancellation lock —
// api/account.js blocks the "Cancel Plan" action until that many months
// have passed since the subscription's first payment.
export const PLANS = {
  level1: { name: 'RVParkAds.com — Level 1', monthly: 9900, maxPhotos: 6, maxVideos: 0, minMonths: 3 },
  level2: { name: 'RVParkAds.com — Level 2', monthly: 29900, maxPhotos: 10, maxVideos: 1, minMonths: 0 },
  level3: { name: 'RVParkAds.com — Level 3', monthly: 49900, maxPhotos: 15, maxVideos: 2, minMonths: 0 },
};
