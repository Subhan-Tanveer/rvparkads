// Seller account CRUD — signup, login verification, profile/plan lookup.
// Mirrors the bcrypt + Postgres pattern already proven in rvparksuccess.com's
// api/_lib/reservations-store.js (signupOwnerAccount/verifyParkLogin).
import bcrypt from 'bcryptjs';
import { query, ensureSchema } from './db.js';

function mapSeller(row) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    planKey: row.plan_key,
  };
}

export async function signupSeller({ firstName, lastName, email, phone, password }) {
  await ensureSchema();
  if (!firstName || !lastName || !email || !phone || !password) {
    throw new Error('All fields are required');
  }
  if (password.length < 8) throw new Error('Password must be at least 8 characters');

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await query('SELECT id FROM ads_sellers WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) throw new Error('An account with this email already exists');

  const passwordHash = bcrypt.hashSync(password, 10);
  const res = await query(
    `INSERT INTO ads_sellers (email, password_hash, first_name, last_name, phone)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [normalizedEmail, passwordHash, firstName.trim(), lastName.trim(), phone.trim()]
  );
  return mapSeller(res.rows[0]);
}

export async function verifySellerLogin(email, password) {
  await ensureSchema();
  const res = await query('SELECT * FROM ads_sellers WHERE email = $1', [String(email || '').trim().toLowerCase()]);
  const row = res.rows[0];
  if (!row || !bcrypt.compareSync(password || '', row.password_hash)) return null;
  return mapSeller(row);
}

export async function getSellerById(id) {
  await ensureSchema();
  const res = await query('SELECT * FROM ads_sellers WHERE id = $1', [id]);
  const row = res.rows[0];
  return row ? mapSeller(row) : null;
}

export async function setSellerStripeInfo(id, { customerId, subscriptionId, planKey }) {
  const res = await query(
    `UPDATE ads_sellers SET stripe_customer_id = $2, stripe_subscription_id = $3, plan_key = $4 WHERE id = $1 RETURNING *`,
    [id, customerId, subscriptionId, planKey]
  );
  return mapSeller(res.rows[0]);
}

export async function getSellerListing(sellerId) {
  await ensureSchema();
  const res = await query('SELECT * FROM ads_listings WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 1', [sellerId]);
  return res.rows[0] || null;
}
