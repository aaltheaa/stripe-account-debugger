// ─────────────────────────────────────────────────────────────────────────────
// CLI output formatter
//
// Produces human-readable terminal output for account diagnostics.
// Uses chalk for color. No external UI libraries.
// ─────────────────────────────────────────────────────────────────────────────

import chalk from 'chalk'
import type { AccountState, AccountSnapshot, AccountIssue, Severity } from '../types.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

const SEP = chalk.dim('─'.repeat(60))

function severityColor(s: Severity): chalk.ChalkFunction {
  return s === 'high' ? chalk.red : s === 'medium' ? chalk.yellow : chalk.cyan
}

function severityBadge(s: Severity): string {
  const color = severityColor(s)
  const label = s === 'high' ? 'HIGH  ' : s === 'medium' ? 'MEDIUM' : 'LOW   '
  return color.bold(`[${label}]`)
}

function statusLabel(code: string): string {
  const labels: Record<string, string> = {
    operational: 'OPERATIONAL',
    setup_incomplete: 'SETUP INCOMPLETE',
    past_due: 'PAST DUE — BLOCKED',
    under_review: 'UNDER REVIEW',
    rejected: 'REJECTED',
    requirements_due: 'INFORMATION REQUIRED',
    requirements_eventually_due: 'UPCOMING REQUIREMENTS',
    payouts_disabled: 'PAYOUTS DISABLED',
    partial_capabilities: 'PARTIAL CAPABILITIES',
    all_capabilities_inactive: 'ALL CAPABILITIES INACTIVE',
  }
  return labels[code] ?? code.toUpperCase().replace(/_/g, ' ')
}

function issueIcon(s: Severity): string {
  return s === 'high' ? chalk.red('✕') : s === 'medium' ? chalk.yellow('●') : chalk.cyan('○')
}

function row(label: string, value: string): string {
  return `  ${chalk.dim(label.padEnd(20))}${value}`
}

// ── Issue block ───────────────────────────────────────────────────────────────

function formatIssue(issue: AccountIssue): string {
  const badge = severityBadge(issue.severity)
  const icon = issueIcon(issue.severity)
  const color = severityColor(issue.severity)

  const lines: string[] = [
    `  ${icon}  ${color.bold(issue.code.padEnd(40))}${badge}`,
    `     ${chalk.dim(issue.title)}`,
    `     ${issue.message}`,
  ]

  if (issue.fields && issue.fields.length > 0) {
    lines.push(`     ${chalk.dim('fields →')} ${issue.fields.join(', ')}`)
  }

  if (!issue.actionable) {
    lines.push(`     ${chalk.dim('→ no seller action required')}`)
  }

  return lines.join('\n')
}

// ── Snapshot summary ──────────────────────────────────────────────────────────

function formatSnapshot(s: AccountSnapshot): string {
  const lines: string[] = [SEP]

  lines.push(row('payouts_enabled', s.payouts_enabled ? chalk.green('true') : chalk.red('false')))
  lines.push(row('details_submitted', s.details_submitted ? chalk.green('true') : chalk.dim('false')))

  if (s.disabled_reason) {
    lines.push(row('disabled_reason', chalk.yellow(s.disabled_reason)))
  }

  if (s.requirements.currently_due.length > 0) {
    lines.push(row('currently_due', s.requirements.currently_due.join(', ')))
  }
  if (s.requirements.past_due.length > 0) {
    lines.push(row('past_due', chalk.red(s.requirements.past_due.join(', '))))
  }
  if (s.requirements.eventually_due.length > 0) {
    const onlyEventual = s.requirements.eventually_due.filter(
      f => !s.requirements.currently_due.includes(f),
    )
    if (onlyEventual.length > 0) {
      lines.push(row('eventually_due', chalk.dim(onlyEventual.join(', '))))
    }
  }
  if (s.requirements.pending_verification.length > 0) {
    lines.push(row('pending_verification', chalk.dim(s.requirements.pending_verification.join(', '))))
  }

  const capEntries = Object.entries(s.capabilities)
  if (capEntries.length > 0) {
    const formatted = capEntries
      .map(([k, v]) => {
        const c = v === 'active' ? chalk.green(v) : v === 'pending' ? chalk.yellow(v) : chalk.red(v)
        return `${k}: ${c}`
      })
      .join('  ')
    lines.push(row('capabilities', formatted))
  }

  return lines.join('\n')
}

// ── Main exports ──────────────────────────────────────────────────────────────

export function printCli(
  state: AccountState,
  snapshot: AccountSnapshot,
  opts: { source: string; explain: boolean },
): void {
  console.log()
  console.log(`  ${chalk.bold('stripe account debugger')}`)
  console.log()
  console.log(`  ${chalk.dim('source')}  ${opts.source}`)
  console.log()

  // Snapshot section (always shown; more detail with --explain)
  if (opts.explain) {
    console.log(formatSnapshot(snapshot))
  } else {
    console.log(SEP)
    const payoutLine = snapshot.payouts_enabled
      ? chalk.green('✓ enabled')
      : chalk.red('✗ disabled')
    console.log(row('payouts', payoutLine))
    console.log(row('details', snapshot.details_submitted ? chalk.green('✓ submitted') : chalk.dim('✗ not submitted')))
    if (snapshot.disabled_reason) {
      console.log(row('disabled_reason', chalk.yellow(snapshot.disabled_reason)))
    }
  }

  // Status
  console.log(SEP)
  if (state.primaryStatus === 'operational') {
    console.log(`  ${chalk.green('✓')}  ${chalk.green.bold('OPERATIONAL')}`)
  } else {
    const top = state.issues[0]
    const label = statusLabel(state.primaryStatus)
    const badge = severityBadge(top.severity)
    console.log(`  ${chalk.bold(label.padEnd(48))}${badge}`)
  }

  // Issues
  console.log(SEP)
  if (state.issues.length === 0) {
    console.log(`  ${chalk.dim('No issues detected. Account is fully operational.')}`)
  } else {
    const count = state.issues.length
    console.log(`  ${chalk.bold(`${count} issue${count > 1 ? 's' : ''} detected`)}`)
    console.log()
    for (const issue of state.issues) {
      console.log(formatIssue(issue))
      console.log()
    }
  }

  console.log(SEP)
  console.log()
}

export function printJson(state: AccountState, snapshot: AccountSnapshot): void {
  console.log(JSON.stringify({ state, snapshot }, null, 2))
}
