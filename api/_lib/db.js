// Postgres connection — reuses the same Neon database as rvparksuccess.com
// (DATABASE_URL env var, same value copied into this Vercel project) rather
// than provisioning a separate database. Tables here are prefixed `ads_` so
// they never collide with rvparksuccess's own tables.
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
    CREATE TABLE IF NOT EXISTS ads_listings (
      id SERIAL PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL,
      plan_key TEXT NOT NULL,
      seller_first_name TEXT NOT NULL,
      seller_last_name TEXT NOT NULL,
      seller_email TEXT NOT NULL,
      seller_phone TEXT NOT NULL,
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
