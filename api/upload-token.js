// Vercel serverless function — POST /api/upload-token
// Issues short-lived Vercel Blob upload tokens for listing photos and
// videos. Upload happens directly browser -> Blob; this server never
// receives the file bytes. Requires a logged-in seller, plus one of:
//   - sessionId: a paid checkout session belonging to that account, fresh
//     from Stripe redirect (new listing not yet created)
//   - listingId: an existing listing the seller owns, uploading more media
//     against that listing's own current plan (e.g. after an upgrade)
// Photo/video counts are capped per plan (see api/_lib/plans.js) —
// enforced here server-side since the client-side cap is just UX, not
// security.
import { handleUpload } from '@vercel/blob/client';
import Stripe from 'stripe';
import { requireSession } from './_lib/auth.js';
import { getSellerById, getListingById } from './_lib/sellers-store.js';
import { PLANS } from './_lib/plans.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireSession(req, res);
  if (!session) return;
  const seller = await getSellerById(session.sellerId);
  if (!seller) return res.status(401).json({ error: 'Account not found' });

  try {
    const jsonResponse = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { sessionId, listingId, mediaType, count } = JSON.parse(clientPayload || '{}');

        let planKey;
        if (listingId) {
          const listing = await getListingById(listingId);
          if (!listing || listing.seller_id !== seller.id) throw new Error('Listing not found');
          planKey = listing.plan_key;
        } else if (sessionId) {
          const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
          if (checkoutSession.client_reference_id !== String(seller.id)) {
            throw new Error('This checkout session does not belong to your account');
          }
          if (checkoutSession.payment_status !== 'paid' && checkoutSession.status !== 'complete') {
            throw new Error('This checkout session has not been paid');
          }
          planKey = checkoutSession.metadata?.plan || 'level1';
        } else {
          throw new Error('A checkout session or listing is required to upload media');
        }

        const plan = PLANS[planKey] || PLANS.level1;
        if (mediaType === 'video') {
          if (plan.maxVideos < 1) throw new Error(`${plan.name.replace('RVParkAds.com — ', '')} does not include video uploads`);
          if (count > plan.maxVideos) throw new Error(`Your plan allows up to ${plan.maxVideos} video${plan.maxVideos === 1 ? '' : 's'}`);
          return {
            allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
            maximumSizeInBytes: 200 * 1024 * 1024,
            addRandomSuffix: true,
          };
        }

        if (count > plan.maxPhotos) throw new Error(`Your plan allows up to ${plan.maxPhotos} photos`);
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          maximumSizeInBytes: 8 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('upload-token error:', err.message);
    return res.status(400).json({ error: err.message });
  }
}
