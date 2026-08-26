// Seller session handling — signed JWT in an httpOnly cookie (never
// readable by page JavaScript). Requires ADS_SESSION_SECRET to be set as
// an env var. Mirrors the pattern already proven on rvparksuccess.com's
// api/_lib/auth.js.
import jwt from 'jsonwebtoken';

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

export function getSession(req) {
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
