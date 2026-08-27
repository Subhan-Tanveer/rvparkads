// Plan changes are driven by Stripe's Billing Portal "subscription update
// confirm" deep link — NOT a fresh Checkout Session. That flow updates the
// SAME subscription in place (correct proration, never a duplicate
// subscription charging the full new price on top of what's already been
// paid this period) while still sending the seller through a real
// Stripe-hosted page to confirm the exact charge and re-authenticate their
// card if needed (3D Secure, a failed default payment method, etc).
// Reference: https://docs.stripe.com/customer-management/portal-deep-links
import Stripe from 'stripe';
import { PLANS } from './plans.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// One persistent Price per plan (not a fresh one per change, the way the
// old direct-charge approach worked) — the portal needs a stable, known
// Price id to hand the customer a confirm screen for, and lookup_key makes
// this idempotent: safe to call on every request without creating
// duplicate Prices in the Stripe dashboard.
const LOOKUP_KEYS = { level1: 'rvpa_level1', level2: 'rvpa_level2', level3: 'rvpa_level3' };

export async function getOrCreateCanonicalPrices() {
  const existing = await stripe.prices.list({ lookup_keys: Object.values(LOOKUP_KEYS), active: true, limit: 10 });
  const byLookup = Object.fromEntries(existing.data.map((p) => [p.lookup_key, p]));
  const result = {};
  for (const [planKey, lookupKey] of Object.entries(LOOKUP_KEYS)) {
    if (byLookup[lookupKey]) { result[planKey] = byLookup[lookupKey]; continue; }
    const plan = PLANS[planKey];
    result[planKey] = await stripe.prices.create({
      currency: 'usd',
      unit_amount: plan.monthly,
      recurring: { interval: 'month' },
      lookup_key: lookupKey,
      product_data: { name: plan.name },
    });
  }
  return result;
}

const PORTAL_CONFIG_TAG = 'rvpa-plan-change-v2'; // v2: always_invoice, not create_prorations

async function getOrCreatePortalConfiguration(canonicalPrices) {
  const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
  const found = existing.data.find((c) => c.metadata?.rvpa === PORTAL_CONFIG_TAG && c.active);
  if (found) return found.id;

  const created = await stripe.billingPortal.configurations.create({
    business_profile: { headline: 'Manage your RVParkAds.com listing plan' },
    metadata: { rvpa: PORTAL_CONFIG_TAG },
    features: {
      customer_update: { enabled: false, allowed_updates: [] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      // Cancellation has its own 3-month-minimum lock enforced by
      // api/account.js — the portal must never offer cancellation itself,
      // or a seller could bypass that check entirely.
      subscription_cancel: { enabled: false },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        // always_invoice — not the default create_prorations — is what
        // makes the confirm screen actually charge the prorated difference
        // right now instead of just switching the price for next cycle
        // and leaving this period's difference uncollected.
        proration_behavior: 'always_invoice',
        products: Object.values(canonicalPrices).map((price) => ({ product: price.product, prices: [price.id] })),
      },
    },
  });
  return created.id;
}

// Deep-links straight to the "confirm this specific price change" screen —
// no picker, no navigating the rest of the portal — for one listing's
// subscription. Stripe shows the seller the exact prorated amount, takes
// payment (retrying/3DS-ing as needed), and only then redirects to
// afterCompletionUrl. If they back out instead, nothing calls that URL at
// all — they just land back on returnUrl having changed nothing.
export async function createPlanChangePortalSession({ customerId, subscriptionId, subscriptionItemId, newPriceId, returnUrl, afterCompletionUrl }) {
  const canonicalPrices = await getOrCreateCanonicalPrices();
  const configurationId = await getOrCreatePortalConfiguration(canonicalPrices);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
    configuration: configurationId,
    flow_data: {
      type: 'subscription_update_confirm',
      subscription_update_confirm: {
        subscription: subscriptionId,
        items: [{ id: subscriptionItemId, price: newPriceId, quantity: 1 }],
      },
      after_completion: { type: 'redirect', redirect: { return_url: afterCompletionUrl } },
    },
  });
  return session.url;
}

// After a portal confirm completes, Stripe has already changed the price
// on the subscription itself — there's no session id to verify payment
// status against the way Checkout has. Instead, read the subscription's
// CURRENT price straight from Stripe and match it back to one of our
// plans by its canonical id.
export async function getCurrentPlanKeyFromSubscription(subscription) {
  const canonicalPrices = await getOrCreateCanonicalPrices();
  const currentPriceId = subscription.items.data[0]?.price?.id;
  const match = Object.entries(canonicalPrices).find(([, price]) => price.id === currentPriceId);
  return match?.[0] || null;
}
