// POST /api/auth — signup, login, logout for seller accounts.
import { createSessionCookie, clearSessionCookie } from './_lib/auth.js';
import { signupSeller, verifySellerLogin } from './_lib/sellers-store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body || {};

  if (action === 'signup') {
    const { firstName, lastName, email, phone, password } = req.body;
    try {
      const seller = await signupSeller({ firstName, lastName, email, phone, password });
      res.setHeader('Set-Cookie', createSessionCookie({ sellerId: seller.id }));
      return res.status(200).json({ ok: true, seller });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  if (action === 'login') {
    const { email, password } = req.body;
    const seller = await verifySellerLogin(email, password);
    if (!seller) return res.status(401).json({ error: 'Incorrect email or password' });
    res.setHeader('Set-Cookie', createSessionCookie({ sellerId: seller.id }));
    return res.status(200).json({ ok: true, seller });
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ ok: true });
  }

  res.status(400).json({ error: 'Unknown action' });
}
