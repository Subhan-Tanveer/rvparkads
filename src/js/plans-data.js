// Three advertising tiers for sellers listing their RV park for sale by
// owner. Keep in sync with api/create-checkout-session.js — that runs in a
// separate Node runtime and can't import this browser-side module.
export const PLANS = [
  {
    key: 'level1',
    name: 'Level 1',
    tagline: 'Basic listing on RVParkSales.com',
    monthly: 9900,
    minMonths: 3,
    features: [
      'Basic listing on RVParkSales.com',
      'Featured in buyer search results',
      'Email inquiry forwarding',
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
    features: [
      'Social media promotion',
      'Facebook & Instagram push',
      'Enhanced listing with more photos',
      'Priority placement in search results',
    ],
  },
  {
    key: 'level3',
    name: 'Level 3',
    tagline: 'Listing + social + video content, 30-day dedicated campaign',
    monthly: 49900,
    includesPrior: 'Everything in Level 2',
    features: [
      'Professional video content',
      '30-day dedicated marketing campaign',
      'Direct buyer outreach',
      'Weekly performance report',
    ],
  },
];

export function formatUsd(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
