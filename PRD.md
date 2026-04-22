# Product Requirements Document (PRD)
## Stripe Account Debugger

---

## 1. Overview

Stripe Account Debugger is a **developer‑facing diagnostic tool** that translates
Stripe Connect account API data into **clear, human‑readable explanations**.

Stripe does not expose a single “account status” field. Instead, account health
is inferred through many independent API signals, including:

- `requirements.currently_due`
- `requirements.eventually_due`
- `capabilities`
- `payouts_enabled`
- `disabled_reason`
- `details_submitted`


Individually, these fields are accurate. **Collectively, they are difficult to
interpret**, especially for non‑expert users.

This project introduces a **platform‑owned interpretation layer** that derives
account state deterministically and explains it in plain language.

---

## 2. Problem Statement

Teams building with Stripe Connect routinely encounter the following problems:

- Account status logic is scattered across multiple parts of the codebase
- Support teams escalate basic “why is this blocked?” questions to engineers
- Sellers receive vague or contradictory instructions
- It is unclear whether an issue is:
  - actionable by the seller,
  - temporary (e.g. review),
  - or a hard block caused by a missed deadline

These issues become more severe as Stripe evolves its API surface, including:
- new capability models,
- Accounts v2 changes,
- public preview features with evolving semantics.

Without a centralized interpretation layer, each team re‑implements fragile,
inconsistent logic.

---

## 3. Goals

### Primary Goals

- Allow an engineer or support agent to understand an account’s state in **under 10 seconds**
- Make Stripe Connect account status explainable without requiring knowledge of Stripe internals
- Centralize all Stripe Connect state interpretation logic into one deterministic module

### Secondary Goals

- Support **offline demos** without a Stripe API key
- Support **machine‑readable output** for automation
- Remain resilient to future Stripe API changes
- Feel like internal tooling at a marketplace or payments platform

---

## 4. Non‑Goals

This project explicitly does **not** aim to:

- Modify Stripe accounts
- Trigger onboarding, verification, or remediation flows
- Provide a seller‑facing UI
- Handle Stripe‑internal enforcement‑only states

The tool is **read‑only and diagnostic by design**.

---

## 5. Target Users

- Platform engineers working on Stripe Connect integrations
- Support and operations teams diagnosing seller issues
- Product managers analyzing onboarding and payout failures

---

## 6. Core Insight

> **Stripe exposes facts. Platforms need explanations.**

Account state must be **derived**, not read directly from any single Stripe field.

If interpretation logic is not explicit and centralized, it becomes:
- brittle,
- inconsistent,
- and difficult to change safely.

---

## 7. Core Architecture

### 7.1 Snapshot Normalization

All reasoning operates on a normalized **snapshot** rather than the raw Stripe
account object.

Reasons:
- Reduces cognitive load
- Defines a stable internal contract
- Insulates business logic from Stripe API churn
- Enables fixture‑based testing and demos

---

### 7.2 Multi‑Issue Analysis

Real Stripe accounts often have **multiple simultaneous issues**, for example:
- missing required information,
- partial capability enablement,
- and a past‑due deadline.

The system must:
- Detect all applicable issues
- Surface them together
- Assign each a severity level

---

### 7.3 Primary Blocking Issue

While multiple issues may exist, one issue must be selected as the
**primary blocking issue** for headline status.

Selection rules:
- Issues are ranked by severity (`high > medium > low`)
- The most severe issue becomes the primary status
- All other issues remain visible as secondary context

This avoids hiding important details behind a single enum while still giving a
clear “what’s wrong” signal.

---

## 8. Extensions & Add‑Ons (First‑Class Requirements)

The following features are **core requirements**, not optional extras.

---

### 8.1 Fixture‑Based Demo Mode (No Stripe API Key)

The tool must support execution using **local fixtures** instead of live Stripe data.

Fixtures:
- Are realistic, Stripe‑shaped JSON objects
- Represent real‑world Stripe Connect scenarios
- Live in `src/fixtures/accounts/`

### 8.2 CLI Flags

| Flag | Description |
|------|-------------|
| `--fixture <name>` | Run against a local fixture instead of a live Stripe account |
| `--list-fixtures` | Print all available fixture names and their one-line descriptions |
| `--explain` | Show the normalized snapshot used for analysis (useful for debugging) |
| `--json` | Output machine-readable JSON instead of formatted terminal output |

#### Example usage

```bash
# List all available demo scenarios
npx tsx src/index.ts --list-fixtures

# Run a specific fixture
npx tsx src/index.ts --fixture past_due_blocked

# Run with verbose snapshot output
npx tsx src/index.ts --fixture onboarding_incomplete --explain

# Machine-readable output (for CI / automation)
npx tsx src/index.ts --fixture under_review --json

# Live mode (requires STRIPE_SECRET_KEY)
export STRIPE_SECRET_KEY=sk_test_...
npx tsx src/index.ts acct_1ExampleXXX
```

---

### 8.3 Fixture Catalog

Fixtures live in `src/fixtures/accounts/` and represent distinct, realistic Stripe Connect states. Each is a minimal valid JSON object that matches the `AccountSnapshot` schema.

---

#### `operational`

**State:** Fully active account — all clear.

```json
{
  "payouts_enabled": true,
  "details_submitted": true,
  "disabled_reason": null,
  "requirements": { "currently_due": [], "eventually_due": [], "past_due": [], "pending_verification": [] },
  "capabilities": { "card_payments": "active", "transfers": "active" }
}
```

- **Primary status:** `operational`
- **Issues detected:** none
- **Use case:** baseline / happy path demo

---

#### `needs_information`

**State:** Account is live but has fields that will become required.

```json
{
  "payouts_enabled": true,
  "details_submitted": true,
  "disabled_reason": null,
  "requirements": {
    "currently_due": ["business_profile.url"],
    "eventually_due": ["business_profile.url", "individual.id_number"],
    "past_due": [],
    "pending_verification": []
  },
  "capabilities": { "card_payments": "active", "transfers": "active" }
}
```

- **Primary status:** `requirements_due` (medium severity)
- **Issues detected:** `requirements_due` + `requirements_eventually_due`
- **Key signals:** `currently_due` non-empty; `payouts_enabled: true` (not yet blocked)
- **Use case:** demonstrates non-blocking requirements — seller needs to act, but nothing is broken yet

---

#### `past_due_blocked`

**State:** Hard-blocked after a missed compliance deadline.

```json
{
  "payouts_enabled": false,
  "details_submitted": true,
  "disabled_reason": "requirements.past_due",
  "requirements": {
    "currently_due": ["individual.verification.document"],
    "eventually_due": ["individual.verification.document"],
    "past_due": ["individual.verification.document"],
    "pending_verification": []
  },
  "capabilities": { "card_payments": "active", "transfers": "inactive" }
}
```

- **Primary status:** `past_due` (high severity)
- **Issues detected:** `past_due` + `partial_capabilities`
- **Key signals:** `disabled_reason: "requirements.past_due"`, `past_due` non-empty, `payouts_enabled: false`
- **Use case:** most common urgent support escalation — seller missed a document deadline

---

#### `under_review`

**State:** Stripe has triggered a manual review; no seller action required.

```json
{
  "payouts_enabled": false,
  "details_submitted": true,
  "disabled_reason": "under_review",
  "requirements": {
    "currently_due": [],
    "eventually_due": [],
    "past_due": [],
    "pending_verification": ["individual.verification.document"]
  },
  "capabilities": { "card_payments": "active", "transfers": "inactive" }
}
```

- **Primary status:** `under_review` (medium severity)
- **Issues detected:** `under_review`
- **Key signals:** `disabled_reason: "under_review"`, `pending_verification` non-empty
- **Actionable:** `false` — seller cannot unblock this themselves
- **Use case:** demonstrates the difference between actionable vs. non-actionable states

---

#### `partial_capabilities`

**State:** Core payments active; additional capabilities inactive or pending.

```json
{
  "payouts_enabled": true,
  "details_submitted": true,
  "disabled_reason": null,
  "requirements": {
    "currently_due": [],
    "eventually_due": ["company.tax_id"],
    "past_due": [],
    "pending_verification": []
  },
  "capabilities": {
    "card_payments": "active",
    "transfers": "active",
    "us_bank_account_ach_payments": "inactive",
    "bank_transfer_payments": "pending"
  }
}
```

- **Primary status:** `partial_capabilities` (medium severity)
- **Issues detected:** `partial_capabilities` + `requirements_eventually_due`
- **Key signals:** mix of `active`, `inactive`, and `pending` capabilities
- **Use case:** marketplace with ACH or bank transfer enabled but not yet approved

---

#### `onboarding_incomplete`

**State:** Account never completed onboarding — no capabilities will be enabled.

```json
{
  "payouts_enabled": false,
  "details_submitted": false,
  "disabled_reason": null,
  "requirements": {
    "currently_due": [
      "business_type", "individual.first_name", "individual.last_name",
      "individual.dob.day", "individual.dob.month", "individual.dob.year",
      "individual.email", "tos_acceptance.date", "tos_acceptance.ip"
    ],
    "eventually_due": [
      "business_type", "individual.first_name", "individual.last_name", "individual.id_number"
    ],
    "past_due": [],
    "pending_verification": []
  },
  "capabilities": { "card_payments": "inactive", "transfers": "inactive" }
}
```

- **Primary status:** `setup_incomplete` (high severity)
- **Issues detected:** `setup_incomplete` + `requirements_due` + `requirements_eventually_due`
- **Key signals:** `details_submitted: false` is the root signal; all else follows from it
- **Use case:** new seller who started onboarding but never finished

---

## 9. Issue Code Reference

All possible `code` values returned in `AccountState.issues`:

| Code | Severity | Actionable | Description |
|------|----------|------------|-------------|
| `setup_incomplete` | high | yes | `details_submitted` is false — onboarding not finished |
| `past_due` | high | yes | Requirements past their deadline; account is blocked |
| `rejected` | high | no | Stripe rejected the account (`disabled_reason` starts with `rejected.`) |
| `payouts_disabled` | high | no | `payouts_enabled` is false with no more specific explanation |
| `all_capabilities_inactive` | high | no | No capabilities are active; account can't process anything |
| `requirements_due` | medium | yes | Fields in `currently_due` that must be resolved soon |
| `under_review` | medium | no | Stripe is reviewing the account; seller can't act |
| `partial_capabilities` | medium | no | Some capabilities active, some inactive |
| `requirements_eventually_due` | low | yes | Fields in `eventually_due` not yet urgent |

---

## 10. Internal Data Model

### `AccountSnapshot` (normalized input)

All analysis operates on this type, not the raw Stripe response. Snapshots are
either loaded from fixtures or produced by `adaptStripeAccount()` from a live API call.

```typescript
interface AccountSnapshot {
  payouts_enabled:   boolean
  details_submitted: boolean
  disabled_reason:   string | null
  requirements: {
    currently_due:      string[]
    eventually_due:     string[]
    past_due:           string[]
    pending_verification: string[]
  }
  capabilities: Record<string, 'active' | 'inactive' | 'pending' | 'unrequested'>
}
```

### `AccountIssue` (detected problem)

```typescript
interface AccountIssue {
  code:       string     // machine-readable issue identifier
  severity:   'high' | 'medium' | 'low'
  title:      string     // short human label
  message:    string     // plain-English explanation
  actionable: boolean    // can the seller or platform resolve this?
  fields?:    string[]   // relevant Stripe requirement field names
}
```

### `AccountState` (analysis result)

```typescript
interface AccountState {
  primaryStatus: string        // most severe issue code, or 'operational'
  issues:        AccountIssue[] // all detected issues, sorted by severity desc
}
```

---

## 11. State Mapping Logic

All interpretation logic lives in `src/analysis/stateMapping.ts`. The pipeline is:

1. **Normalize** raw Stripe data → `AccountSnapshot` (via Zod schema)
2. **Detect** all applicable issues (8 detectors run in order)
3. **Rank** issues by severity using `{ high: 3, medium: 2, low: 1 }`
4. **Select** the highest-ranked issue as `primaryStatus`
5. **Return** the full `AccountState` with all issues attached

Detection order matters for deduplication: `past_due` suppresses `requirements_due`
for the same fields; `setup_incomplete` suppresses `all_capabilities_inactive`.

No issue detector has side effects. The function is pure and deterministic —
the same snapshot always produces the same output.
