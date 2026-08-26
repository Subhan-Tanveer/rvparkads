// Three advertising tiers for sellers listing their RV park for sale by
// owner. Keep in sync with api/_lib/plans.js — that runs in a separate
// Node runtime and can't import this browser-side module.
export const PLANS = [
  {
    key: 'level1',
    name: 'Level 1',
    tagline: 'Basic listing on RVParkSales.com',
    monthly: 9900,
    minMonths: 3,
    maxPhotos: 6,
    maxVideos: 0,
    features: [
      'Basic listing on RVParkSales.com',
      'Featured in buyer search results',
      'Email inquiry forwarding',
      'Up to 6 photos',
    ],
  },
  {
    key: 'level2',
    name: 'Level 2',
    tagline: 'Listing + social media promotion (Facebook/Instagram push)',
    monthly: 29900,
    featured: true,
    badgeLabel: 'Most Popular',
    includesPrior: 'Everything in Level 1',
    maxPhotos: 10,
    maxVideos: 1,
    features: [
      'Social media promotion',
      'Facebook & Instagram push',
      'Up to 10 photos + 1 video',
      'Priority placement in search results',
    ],
  },
  {
    key: 'level3',
    name: 'Level 3',
    tagline: 'Listing + social + video content, 30-day dedicated campaign',
    monthly: 49900,
    includesPrior: 'Everything in Level 2',
    maxPhotos: 15,
    maxVideos: 2,
    features: [
      'Up to 15 photos + 2 videos',
      '30-day dedicated marketing campaign',
      'Direct buyer outreach',
      'Weekly performance report',
    ],
  },
];

export function formatUsd(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
