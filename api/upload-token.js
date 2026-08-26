// Vercel serverless function — POST /api/upload-token
// Issues short-lived Vercel Blob upload tokens for listing photos. Upload
// happens directly browser -> Blob; this server never receives the file
// bytes. Authorization is the paid Stripe session_id the client already
// has from complete-listing.html — anyone without a real paid session_id
// gets rejected, same as a login-gated upload would be on the main site.
import { handleUpload } from '@vercel/blob/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const MAX_PHOTOS = 15;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const jsonResponse = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { sessionId, count } = JSON.parse(clientPayload || '{}');
        if (!sessionId) throw new Error('A valid checkout session is required to upload photos');
        if (count > MAX_PHOTOS) throw new Error(`You can upload up to ${MAX_PHOTOS} photos`);

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid' && session.status !== 'complete') {
          throw new Error('This checkout session has not been paid');
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
