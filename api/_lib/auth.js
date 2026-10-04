// Seller session handling — signed JWT in an httpOnly cookie (never
// readable by page JavaScript). Requires ADS_SESSION_SECRET to be set as
// an env var. Mirrors the pattern already proven on rvparksuccess.com's
// api/_lib/auth.js.
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'rvpa_seller_session';
const SESSION_DAYS = 30;

function getSecret() {
  const secret = process.env.ADS_SESSION_SECRET;
  if (!secret) throw new Error('ADS_SESSION_SECRET is not set');
  return secret;
}

export function createSessionCookie({ sellerId }) {
  const token = jwt.sign({ sellerId }, getSecret(), { expiresIn: `${SESSION_DAYS}d` });
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

// RVParkSales.com's admin manages this site too: its server sends the
// shared ADMIN_BRIDGE_SECRET in an x-admin-bridge header and is treated as
// Marie's own admin account (ADMIN_BRIDGE_SELLER_ID). Server-to-server only;
// the secret never reaches a browser.
function bridgeSession(req) {
  const secret = process.env.ADMIN_BRIDGE_SECRET;
  const sent = req.headers['x-admin-bridge'];
  const id = Number(process.env.ADMIN_BRIDGE_SELLER_ID);
  if (!secret || !sent || !id || typeof sent !== 'string') return null;
  const a = Buffer.from(sent);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { sellerId: id, bridge: true };
}

export function getSession(req) {
  const bridged = bridgeSession(req);
  if (bridged) return bridged;
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null; // expired or tampered — treat as logged out
  }
}

// Call at the top of any protected route. Sends the 401 itself so callers
// just need one line: `const session = requireSession(req, res); if
// (!session) return;`
export function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'Not signed in' });
    return null;
  }
  return session;
}
