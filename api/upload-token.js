// Vercel serverless function — POST /api/upload-token
// Issues short-lived Vercel Blob upload tokens for listing photos. Upload
// happens directly browser -> Blob; this server never receives the file
// bytes. Requires a logged-in seller, plus either a paid checkout session
// belonging to that account (fresh from Stripe redirect) or an account
// that already has a plan on file (returning later to finish/resume a
// listing — no session_id in that case).
import { handleUpload } from '@vercel/blob/client';
import Stripe from 'stripe';
import { requireSession } from './_lib/auth.js';
import { getSellerById } from './_lib/sellers-store.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const MAX_PHOTOS = 15;

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
        const { sessionId, count } = JSON.parse(clientPayload || '{}');
        if (count > MAX_PHOTOS) throw new Error(`You can upload up to ${MAX_PHOTOS} photos`);

        if (sessionId) {
          const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
          if (checkoutSession.client_reference_id !== String(seller.id)) {
            throw new Error('This checkout session does not belong to your account');
          }
          if (checkoutSession.payment_status !== 'paid' && checkoutSession.status !== 'complete') {
            throw new Error('This checkout session has not been paid');
          }
        } else if (!seller.planKey) {
          throw new Error('Choose a plan first to upload photos');
        }

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
