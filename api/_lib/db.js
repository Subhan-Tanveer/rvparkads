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
    -- One Stripe customer per seller account (reused across every listing's
    -- own subscription) — but no plan_key/subscription here, since billing
    -- is per-listing now, not per-account. A seller can own any number of
    -- listings, each independently paid for, upgraded, downgraded, or
    -- canceled.
    CREATE TABLE IF NOT EXISTS ads_sellers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      stripe_customer_id TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ads_sellers ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE ads_sellers DROP COLUMN IF EXISTS plan_key;
    ALTER TABLE ads_sellers DROP COLUMN IF EXISTS stripe_subscription_id;

    -- category: 'park' (a whole RV park for sale) or 'lot' (a single lot
    -- for sale inside an exclusive RV lot community) — two genuinely
    -- different listing types sharing the same seller/plan/payment flow,
    -- distinguished here rather than as separate tables since they share
    -- most columns (name, address, price, financing, description, photos).
    -- Each row is its own paid listing with its own subscription — seller_id
    -- is NOT unique, so one account can own several listings/parks.
    CREATE TABLE IF NOT EXISTS ads_listings (
      id SERIAL PRIMARY KEY,
      seller_id INTEGER NOT NULL REFERENCES ads_sellers(id),
      order_id TEXT,
      stripe_subscription_id TEXT,
      plan_key TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'park',
      listing_name TEXT NOT NULL,
      listing_address TEXT NOT NULL,
      -- park-only fields
      num_sites TEXT,
      rv_spaces TEXT,
      full_hookup_spaces TEXT,
      tent_spaces TEXT,
      cabins TEXT,
      yurts TEXT,
      rental_types TEXT[],
      reservation_system TEXT,
      annual_revenue_cents INTEGER,
      occupancy_rate NUMERIC,
      expansion_land BOOLEAN NOT NULL DEFAULT false,
      -- lot-only fields
      lot_size TEXT,
      hoa_fees_cents INTEGER,
      community_activities TEXT,
      -- shared fields
      amenities TEXT[],
      features TEXT[],
      asking_price_cents INTEGER,
      owner_financing BOOLEAN NOT NULL DEFAULT false,
      description TEXT,
      photo_urls TEXT[],
      video_urls TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ads_listings ADD COLUMN IF NOT EXISTS video_urls TEXT[];
    ALTER TABLE ads_listings ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
    ALTER TABLE ads_listings DROP CONSTRAINT IF EXISTS ads_listings_seller_id_key;
  `);
  return schemaReady;
}
