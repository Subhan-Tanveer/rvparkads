// Two ways to advertise (Nov 2026; Levels 2 and 3 retired):
//   level1      $99/month, the owner sells it themselves, no commission
//   withbroker  $49/month, Marie Hansen is the listing broker, commission only on a sale
// Keep in sync with api/_lib/plans.js — that runs in a separate Node
// runtime and can't import this browser-side module.
export const PLANS = [
  {
    key: 'level1',
    name: 'Sell It Yourself',
    level: 'No commission',
    tagline: 'We market your park; you handle the buyers',
    monthly: 9900,
    minMonths: 3,
    maxPhotos: 6,
    maxVideos: 0,
    features: [
      'Professional listing on RVParkSales.com',
      'Marketed to our buyer database',
      'Sent first to RVParkSelect early-access buyers',
      'Property details, financial highlights & map',
      'Google-optimized listing page',
      'Buyer inquiries sent straight to you',
      'Up to 6 photos',
      'Views & inquiries report in your dashboard',
    ],
  },
  {
    key: 'withbroker',
    name: 'Sell With Marie',
    level: 'Marie as your broker',
    tagline: 'Lower monthly price, and a broker works the sale for you',
    monthly: 4900,
    minMonths: 3,
    maxPhotos: 6,
    maxVideos: 0,
    featured: true,
    badgeLabel: 'Lowest monthly price',
    features: [
      'Everything in Sell It Yourself',
      'Marie Hansen of RVParkSales as your listing broker',
      'Help pricing your park',
      'Buyer screening, negotiation & closing support',
      'Commission paid only if your park sells',
    ],
  },
];

// Retired levels: no longer sold, but sellers already on them keep their
// plan, limits and dashboard labels until they change or cancel.
export const LEGACY_PLANS = [
  { key: 'level2', name: 'Buyer Exposure', level: 'Level 2', monthly: 29900, maxPhotos: 10, maxVideos: 1, features: [] },
  { key: 'level3', name: 'Full Marketing Campaign', level: 'Level 3', monthly: 49900, maxPhotos: 15, maxVideos: 2, features: [] },
];
export const ALL_PLANS = [...PLANS, ...LEGACY_PLANS];

export function formatUsd(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
