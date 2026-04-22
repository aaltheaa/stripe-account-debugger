// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the Stripe Account Debugger
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = 'high' | 'medium' | 'low'

export type CapabilityStatus = 'active' | 'inactive' | 'pending' | 'unrequested'

/** A single detected problem with the account. */
export interface AccountIssue {
  code: string
  severity: Severity
  title: string
  message: string
  /** Whether the seller or platform can take action to resolve this. */
  actionable: boolean
  /** Relevant Stripe requirement field names, if applicable. */
  fields?: string[]
}

/** Result of analyzing a snapshot. */
export interface AccountState {
  /** The most severe issue code, or 'operational' if none. */
  primaryStatus: string
  issues: AccountIssue[]
}

/**
 * Normalized, stable representation of a Stripe account.
 * This is the internal contract — all analysis operates on this type,
 * not the raw Stripe API response.
 */
export interface AccountSnapshot {
  payouts_enabled: boolean
  details_submitted: boolean
  disabled_reason: string | null
  requirements: {
    currently_due: string[]
    eventually_due: string[]
    past_due: string[]
    pending_verification: string[]
  }
  capabilities: Record<string, CapabilityStatus>
}
