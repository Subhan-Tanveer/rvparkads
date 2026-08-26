// Server-side plan pricing — single source of truth for both
// create-checkout-session.js and submit-listing.js. Keep in sync with the
// browser-side src/js/plans-data.js.
export const PLANS = {
  level1: { name: 'RVParkSelect.com — Level 1', monthly: 9900 },
  level2: { name: 'RVParkSelect.com — Level 2', monthly: 29900 },
  level3: { name: 'RVParkSelect.com — Level 3', monthly: 49900 },
};
