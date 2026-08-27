// Shared by api/account.js (media-trim confirmation after a downgrade) and
// api/verify-session.js (the point a plan-change Checkout actually
// completes) — a plan change only has one place it's "final," but that
// place differs depending on whether a downgrade needs the seller to trim
// media first, so both call sites need the same notification logic.
import { sendEmail } from './mailer.js';
import { renderEmail } from './email-template.js';
import { PLANS } from './plans.js';

export function planLabel(key) {
  return (PLANS[key]?.name || key || '').replace('RVParkAds.com — ', '');
}

export async function notifyPlanChange({ listing, seller, fromKey, toKey, direction, trimmedPhotos = 0, trimmedVideos = 0 }) {
  const sellerName = `${seller.firstName} ${seller.lastName}`;
  const verb = direction === 'upgrade' ? 'upgraded' : 'downgraded';
  const trimNote = trimmedPhotos || trimmedVideos
    ? `To fit the new limits, ${[trimmedPhotos && `${trimmedPhotos} photo${trimmedPhotos === 1 ? '' : 's'}`, trimmedVideos && `${trimmedVideos} video${trimmedVideos === 1 ? '' : 's'}`].filter(Boolean).join(' and ')} were removed from the listing.`
    : null;

  await sendEmail({
    to: 'marie@rvparksales.com',
    subject: `Plan ${verb}: ${listing.listing_name} (${planLabel(fromKey)} → ${planLabel(toKey)})`,
    html: renderEmail({
      eyebrow: `Listing ${verb}`,
      title: `${listing.listing_name} — ${planLabel(fromKey)} → ${planLabel(toKey)}`,
      intro: `${sellerName} just ${verb} "${listing.listing_name}" from ${planLabel(fromKey)} to ${planLabel(toKey)}.`,
      sections: [{
        heading: 'Details',
        rows: [
          ['Seller', sellerName],
          ['Email', seller.email],
          ['Listing', listing.listing_name],
          ['From', planLabel(fromKey)],
          ['To', planLabel(toKey)],
        ],
      }],
      closing: trimNote,
      cta: { label: 'View Full Listing', href: `https://rvparkads.com/listing-detail.html?id=${listing.id}` },
    }),
  });

  if (direction === 'downgrade') {
    // Sellers get the upgrade confirmation implicitly (Stripe's own receipt
    // email plus landing straight on the edit page), but a downgrade —
    // especially one that removed their own photos/videos — gets an
    // explicit email so there's a record of exactly what happened.
    await sendEmail({
      to: seller.email,
      subject: `Your plan for ${listing.listing_name} was changed to ${planLabel(toKey)}`,
      html: renderEmail({
        eyebrow: 'Plan Changed',
        title: `${listing.listing_name} is now on ${planLabel(toKey)}`,
        intro: `Your listing "${listing.listing_name}" has been moved from ${planLabel(fromKey)} to ${planLabel(toKey)}.`,
        sections: [{ heading: 'Details', rows: [['From', planLabel(fromKey)], ['To', planLabel(toKey)]] }],
        closing: trimNote || 'Questions about this change? Just reply to this email or call us at (850) 832-0022.',
        cta: { label: 'View Your Account', href: 'https://rvparkads.com/dashboard.html' },
      }),
    });
  }
}
