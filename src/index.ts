// ─────────────────────────────────────────────────────────────────────────────
// Stripe Account Debugger — CLI entry point
//
// Usage:
//   npx tsx src/index.ts --fixture past_due_blocked
//   npx tsx src/index.ts --fixture past_due_blocked --explain
//   npx tsx src/index.ts --fixture past_due_blocked --json
//   npx tsx src/index.ts --list-fixtures
//   npx tsx src/index.ts acct_123                    # requires STRIPE_SECRET_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { buildSnapshot } from './analysis/snapshot.js'
import { analyzeAccount } from './analysis/stateMapping.js'
import { listFixtures, loadFixture } from './fixtures/loadFixture.js'
import { printCli, printJson } from './output/cli.js'

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function flag(name: string): boolean {
  return args.includes(name)
}

function flagValue(name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}

function positional(): string | undefined {
  return args.find(a => !a.startsWith('--'))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // --list-fixtures
  if (flag('--list-fixtures')) {
    const fixtures = listFixtures()
    if (fixtures.length === 0) {
      console.log('No fixtures found in src/fixtures/accounts/')
    } else {
      console.log('\nAvailable fixtures:\n')
      for (const name of fixtures) {
        console.log(`  npx tsx src/index.ts --fixture ${name}`)
      }
      console.log()
    }
    return
  }

  const explain = flag('--explain')
  const json = flag('--json')
  const fixtureName = flagValue('--fixture')
  const accountId = positional()

  // ── Load raw account data ────────────────────────────────────────────────
  let raw: unknown
  let source: string

  if (fixtureName) {
    raw = loadFixture(fixtureName)
    source = `fixture: ${fixtureName}`
  } else if (accountId) {
    // Dynamic import so the tool works without a Stripe key in fixture mode
    const { fetchAccount, adaptStripeAccount } = await import('./stripe/fetchAccount.js')
    const account = await fetchAccount(accountId)
    raw = adaptStripeAccount(account)
    source = `live: ${accountId}`
  } else {
    console.error(
      '\nUsage:\n' +
        '  npx tsx src/index.ts --fixture <name>   # demo mode, no Stripe key needed\n' +
        '  npx tsx src/index.ts --list-fixtures    # see all demo scenarios\n' +
        '  npx tsx src/index.ts acct_123           # live mode (requires STRIPE_SECRET_KEY)\n',
    )
    process.exit(1)
  }

  // ── Analyze ──────────────────────────────────────────────────────────────
  const snapshot = buildSnapshot(raw)
  const state = analyzeAccount(snapshot)

  // ── Output ───────────────────────────────────────────────────────────────
  if (json) {
    printJson(state, snapshot)
  } else {
    printCli(state, snapshot, { source, explain })
  }
}

main().catch(err => {
  console.error(`\n  error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
