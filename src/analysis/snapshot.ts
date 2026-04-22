// ─────────────────────────────────────────────────────────────────────────────
// Snapshot normalization
//
// All analysis operates on AccountSnapshot — a stable, validated internal
// contract — rather than raw Stripe API responses or fixture JSON.
// This insulates business logic from API churn and enables fixture-based demos.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'
import type { AccountSnapshot, CapabilityStatus } from '../types.js'

const CapabilityStatusSchema = z.enum(['active', 'inactive', 'pending', 'unrequested'])

const SnapshotSchema = z.object({
  payouts_enabled: z.boolean(),
  details_submitted: z.boolean().default(false),
  disabled_reason: z.string().nullable().default(null),
  requirements: z
    .object({
      currently_due: z.array(z.string()).default([]),
      eventually_due: z.array(z.string()).default([]),
      past_due: z.array(z.string()).default([]),
      pending_verification: z.array(z.string()).default([]),
    })
    .default({}),
  capabilities: z.record(CapabilityStatusSchema).default({}),
})

/**
 * Normalize and validate raw input (fixture JSON or Stripe API response)
 * into a typed AccountSnapshot.
 *
 * Throws a descriptive error if required fields are missing or malformed.
 */
export function buildSnapshot(raw: unknown): AccountSnapshot {
  const result = SnapshotSchema.safeParse(raw)
  if (!result.success) {
    const errors = result.error.errors.map(e => `  ${e.path.join('.')}: ${e.message}`).join('\n')
    throw new Error(`Invalid account data:\n${errors}`)
  }
  return result.data as AccountSnapshot
}
