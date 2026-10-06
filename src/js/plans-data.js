// Three advertising tiers for sellers listing their RV park for sale by
// owner. Keep in sync with api/_lib/plans.js — that runs in a separate
// Node runtime and can't import this browser-side module.
export const PLANS = [
  {
    key: 'level1',
    name: 'Professional Listing',
    level: 'Level 1',
    tagline: 'Get listed in front of serious RV park buyers',
    monthly: 9900,
    minMonths: 3,
    maxPhotos: 6,
    maxVideos: 0,
    features: [
      'Professional listing on RVParkSales.com',
      'Sent first to RVParkSelect early-access buyers',
      'Property details, financial highlights & map',
      'Google-optimized listing page',
      'Buyer inquiries sent straight to you',
      'Up to 6 photos',
      'Views & inquiries report in your dashboard',
    ],
  },
  {
    key: 'level2',
    name: 'Buyer Exposure',
    level: 'Level 2',
    tagline: 'Get buyers: social media + our buyer network',
    monthly: 29900,
    featured: true,
    badgeLabel: 'Most Popular',
    includesPrior: 'Everything in Professional Listing',
    maxPhotos: 10,
    maxVideos: 1,
    features: [
      'Featured badge & top placement in search results',
      'Marketed to our buyer database',
      'Facebook & Instagram promotion',
      'Up to 10 photos + 1 video',
      'Monthly marketing report',
    ],
  },
  {
    key: 'level3',
    name: 'Full Marketing Campaign',
    level: 'Level 3',
    tagline: 'Maximum exposure: a dedicated 30-day campaign',
    monthly: 49900,
    includesPrior: 'Everything in Buyer Exposure',
    maxPhotos: 15,
    maxVideos: 2,
    features: [
      'Professional video content creation',
      'Dedicated 30-day marketing campaign',
      'Spotlight on the RVParkSales.com home page',
      'Regular social media posting',
      'Direct buyer outreach',
      'Up to 15 photos + 2 videos',
      'Weekly performance report',
    ],
  },
];

export function formatUsd(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
