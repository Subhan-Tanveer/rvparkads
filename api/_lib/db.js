// Postgres connection — RVParkAds' own dedicated Neon database (separate
// from rvparksuccess.com's), provisioned via Vercel's Storage tab.
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString && !/sslmode=/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

let schemaReady = null;
export async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = query(`
    CREATE TABLE IF NOT EXISTS ads_sellers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan_key TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ads_sellers ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS ads_listings (
      id SERIAL PRIMARY KEY,
      seller_id INTEGER NOT NULL UNIQUE REFERENCES ads_sellers(id),
      order_id TEXT,
      plan_key TEXT NOT NULL,
      park_name TEXT NOT NULL,
      park_address TEXT NOT NULL,
      num_sites TEXT,
      rv_spaces TEXT,
      tent_spaces TEXT,
      cabins TEXT,
      yurts TEXT,
      rental_type TEXT,
      amenities TEXT[],
      features TEXT[],
      reservation_system TEXT,
      asking_price_cents INTEGER,
      annual_revenue_cents INTEGER,
      occupancy_rate NUMERIC,
      description TEXT,
      photo_urls TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  return schemaReady;
}
