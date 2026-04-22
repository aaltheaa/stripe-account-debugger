// ─────────────────────────────────────────────────────────────────────────────
// Live Stripe API integration
//
// Fetches a Connect account and returns the raw response for normalization.
// Requires STRIPE_SECRET_KEY to be set in the environment.
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from 'stripe'

/**
 * Fetch a Stripe Connect account by ID.
 * The caller is responsible for normalizing the response via buildSnapshot().
 */
export async function fetchAccount(accountId: string): Promise<Stripe.Account> {
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!apiKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set.\n' +
        'Set it in your environment, or use --fixture to run without a live key.\n\n' +
        'Example:\n' +
        '  export STRIPE_SECRET_KEY=sk_test_...\n' +
        '  npx tsx src/index.ts acct_123',
    )
  }

  const stripe = new Stripe(apiKey)

  try {
    return await stripe.accounts.retrieve(accountId)
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      throw new Error(`Stripe API error (${err.type}): ${err.message}`)
    }
    throw err
  }
}

/**
 * Adapt a raw Stripe Account response into the shape expected by buildSnapshot().
 * Stripe's API structure is not identical to the snapshot schema —
 * this is the translation layer.
 */
export function adaptStripeAccount(account: Stripe.Account): unknown {
  return {
    payouts_enabled: account.payouts_enabled ?? false,
    details_submitted: account.details_submitted ?? false,
    disabled_reason: account.requirements?.disabled_reason ?? null,
    requirements: {
      currently_due: account.requirements?.currently_due ?? [],
      eventually_due: account.requirements?.eventually_due ?? [],
      past_due: account.requirements?.past_due ?? [],
      pending_verification: account.requirements?.pending_verification ?? [],
    },
    capabilities: account.capabilities ?? {},
  }
}
