# Stripe Account Debugger

A **developer-facing diagnostic CLI** that translates Stripe Connect account API data
into **clear, human-readable explanations**.

This project is intentionally designed to feel like *internal tooling at a payments or marketplace platform*.

---

## Why this Exists

Stripe Connect does not expose a single "account status". Instead, account health is
implied through many independent signals:

- `requirements.currently_due`
- `requirements.eventually_due`
- `capabilities`
- `payouts_enabled`
- `disabled_reason`

Individually these fields are accurate. **Together, they are hard to reason about**.

Most platforms end up:
- Re-implementing fragile conditional logic
- Escalating simple support questions to engineers
- Sending confusing instructions to sellers

Stripe Account Debugger provides a deterministic interpretation layer.

---

## Key Features

- ✅ Deterministic Stripe Connect state mapping
- ✅ Multiple simultaneous issues surfaced
- ✅ Primary blocking issue identified
- ✅ Plain-English explanations
- ✅ Fixture-based demo mode (no Stripe key required)
- ✅ Verbose explainability mode
- ✅ JSON output for automation

---

## Demoing the Tool (Most Important)

This project is intentionally **easy to demo**.

### Demo WITHOUT a Stripe API Key (Recommended)

Use fixture mode. This loads realistic, Stripe-shaped example accounts from disk.

```bash
npx tsx src/index.ts --list-fixtures
npx tsx src/index.ts --fixture past_due_blocked
npx tsx src/index.ts --fixture past_due_blocked --explain
```

This mode:
- Requires **no Stripe API key**
- Uses the exact same logic as live Stripe mode
- Is ideal for demos, tests, and reviews

---

### Demo WITH a Stripe API Key (Live Mode)

```bash
export STRIPE_SECRET_KEY=sk_test_...
npx tsx src/index.ts acct_123
```

Live mode:
- Fetches the account via Stripe API
- Normalizes the response
- Runs the same state analysis pipeline

---

## CLI Flags

| Flag | Description |
|-----|------------|
| `--fixture <name>` | Run using a local fixture instead of Stripe |
| `--list-fixtures` | List available demo scenarios |
| `--explain` | Show raw snapshot used for analysis |
| `--json` | Output machine-readable JSON |

---

## Real Account Scenarios

Fixtures mirror real Stripe Connect states:

| Fixture | Meaning |
|--------|--------|
| `operational` | Fully operational account |
| `needs_information` | Info missing, not blocked |
| `past_due_blocked` | Hard-blocked after missed deadline |
| `under_review` | Stripe review in progress |
| `partial_capabilities` | Payments enabled, payouts disabled |

---

This repository focuses on **explainability, determinism, and developer experience**.
