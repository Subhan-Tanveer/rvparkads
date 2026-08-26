// Server-side plan pricing and media limits — single source of truth for
// create-checkout-session.js, submit-listing.js, and upload-token.js. Keep
// in sync with the browser-side src/js/plans-data.js.
export const PLANS = {
  level1: { name: 'RVParkAds.com — Level 1', monthly: 9900, maxPhotos: 6, maxVideos: 0 },
  level2: { name: 'RVParkAds.com — Level 2', monthly: 29900, maxPhotos: 10, maxVideos: 1 },
  level3: { name: 'RVParkAds.com — Level 3', monthly: 49900, maxPhotos: 15, maxVideos: 2 },
};
