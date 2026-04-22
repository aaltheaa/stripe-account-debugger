// ─────────────────────────────────────────────────────────────────────────────
// Account state mapping
//
// Derives a deterministic AccountState from an AccountSnapshot.
// All Stripe Connect interpretation logic lives here — no magic, no scattered
// conditionals, no strings that might be wrong in six months.
//
// Multiple issues can coexist. The most severe becomes the primary status.
// ─────────────────────────────────────────────────────────────────────────────

import type { AccountSnapshot, AccountState, AccountIssue, Severity } from '../types.js'

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 }

function rank(issue: AccountIssue): number {
  return SEVERITY_RANK[issue.severity]
}

function detectIssues(s: AccountSnapshot): AccountIssue[] {
  const issues: AccountIssue[] = []

  // ── 1. Onboarding never completed ─────────────────────────────────────────
  if (!s.details_submitted) {
    issues.push({
      code: 'setup_incomplete',
      severity: 'high',
      title: 'Onboarding not completed',
      message:
        'The account has not submitted required business details. No capabilities will be ' +
        'enabled and no payouts are possible until onboarding is complete.',
      actionable: true,
    })
  }

  // ── 2. Requirements past due (deadline missed, account blocked) ───────────
  const isPastDue =
    s.disabled_reason === 'requirements.past_due' || s.requirements.past_due.length > 0

  if (isPastDue) {
    const fields =
      s.requirements.past_due.length > 0
        ? s.requirements.past_due
        : s.requirements.currently_due

    issues.push({
      code: 'past_due',
      severity: 'high',
      title: 'Requirements past due',
      message:
        'A required document deadline has passed. Payouts are disabled until all ' +
        'missing requirements are resolved. This requires immediate action.',
      actionable: true,
      fields,
    })
  }

  // ── 3. Account under review ───────────────────────────────────────────────
  if (s.disabled_reason === 'under_review') {
    issues.push({
      code: 'under_review',
      severity: 'medium',
      title: 'Account under review',
      message:
        'Stripe is conducting a review of this account. No action is required from the ' +
        'seller at this time. Capabilities may be limited until the review is complete.',
      actionable: false,
    })
  }

  // ── 4. Account rejected ───────────────────────────────────────────────────
  if (s.disabled_reason?.startsWith('rejected.')) {
    issues.push({
      code: 'rejected',
      severity: 'high',
      title: 'Account rejected',
      message:
        `Stripe has reviewed the account and determined it cannot be supported ` +
        `(reason: ${s.disabled_reason}). Contact Stripe support for more information.`,
      actionable: false,
    })
  }

  // ── 5. Currently due requirements (not already covered by past_due) ───────
  if (!isPastDue && s.requirements.currently_due.length > 0) {
    issues.push({
      code: 'requirements_due',
      severity: 'medium',
      title: 'Information required',
      message:
        'The following fields must be provided to maintain active capabilities. ' +
        'Payouts or charges may be restricted if not resolved.',
      actionable: true,
      fields: s.requirements.currently_due,
    })
  }

  // ── 6. Eventually due (deadline in the future, not yet urgent) ───────────
  const onlyEventuallyDue = s.requirements.eventually_due.filter(
    f => !s.requirements.currently_due.includes(f),
  )
  if (onlyEventuallyDue.length > 0) {
    issues.push({
      code: 'requirements_eventually_due',
      severity: 'low',
      title: 'Upcoming requirements',
      message:
        'The following fields will be required in the future. No capabilities are ' +
        'currently affected, but failure to provide them will eventually cause restrictions.',
      actionable: true,
      fields: onlyEventuallyDue,
    })
  }

  // ── 7. Payouts disabled without a more specific explanation ───────────────
  const alreadyExplainsDisabled = issues.some(
    i => ['past_due', 'setup_incomplete', 'under_review', 'rejected'].includes(i.code),
  )
  if (!s.payouts_enabled && !alreadyExplainsDisabled) {
    issues.push({
      code: 'payouts_disabled',
      severity: 'high',
      title: 'Payouts disabled',
      message:
        `Payouts are disabled on this account.` +
        (s.disabled_reason ? ` Stripe-reported reason: ${s.disabled_reason}.` : '') +
        ` Check the Stripe dashboard for additional context.`,
      actionable: false,
    })
  }

  // ── 8. Capability analysis ────────────────────────────────────────────────
  const capEntries = Object.entries(s.capabilities)
  if (capEntries.length > 0) {
    const active = capEntries.filter(([, v]) => v === 'active').map(([k]) => k)
    const inactive = capEntries.filter(([, v]) => v === 'inactive').map(([k]) => k)
    const pending = capEntries.filter(([, v]) => v === 'pending').map(([k]) => k)

    if (inactive.length > 0 && active.length > 0) {
      // Some active, some not — partial state
      issues.push({
        code: 'partial_capabilities',
        severity: 'medium',
        title: 'Some capabilities inactive',
        message:
          `Active: ${active.join(', ')}. ` +
          `Inactive: ${inactive.join(', ')}.` +
          (pending.length ? ` Pending: ${pending.join(', ')}.` : ''),
        actionable: false,
      })
    } else if (inactive.length > 0 && active.length === 0 && !issues.some(i => i.code === 'setup_incomplete')) {
      // Nothing active at all (and not already explained by setup_incomplete)
      issues.push({
        code: 'all_capabilities_inactive',
        severity: 'high',
        title: 'All capabilities inactive',
        message:
          `No capabilities are active. This account cannot process payments or transfers. ` +
          `Inactive: ${inactive.join(', ')}.` +
          (pending.length ? ` Pending: ${pending.join(', ')}.` : ''),
        actionable: false,
      })
    }
  }

  return issues
}

/**
 * Derive a complete AccountState from a normalized snapshot.
 *
 * All issues are detected and surfaced. The primary status is the
 * most severe issue. If no issues exist, the account is operational.
 */
export function analyzeAccount(snapshot: AccountSnapshot): AccountState {
  const issues = detectIssues(snapshot).sort((a, b) => rank(b) - rank(a))

  const primaryStatus = issues.length > 0 ? issues[0].code : 'operational'

  return { primaryStatus, issues }
}
