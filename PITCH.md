# Stripe Account Debugger

## The Problem

Stripe Connect does not expose a single "account status" field.

To understand why a seller can't get paid, you have to cross-reference at least seven independent API signals:

```
requirements.currently_due     → fields that must be provided now
requirements.eventually_due    → fields that will be required soon
requirements.past_due          → fields whose deadline has passed
requirements.pending_verification → documents Stripe is reviewing
disabled_reason                → why the account is restricted
payouts_enabled                → whether payouts are currently allowed
details_submitted              → whether onboarding is even complete
capabilities                   → per-product active/inactive/pending status
```

Each field is accurate. Together, they're hard to reason about.

In practice this means:
- Engineers re-implement the same fragile conditional logic across multiple services
- Support teams escalate "why is this seller blocked?" to engineers who have to spelunk the API
- Sellers receive vague, contradictory, or actionless instructions
- It's unclear whether a problem is **seller-actionable**, **temporary** (Stripe review), or a **hard block** caused by a missed deadline

As Stripe's API evolves — new capability models, Accounts v2, changing requirement semantics — every team that re-implemented this logic has to update it separately.

---

## The Solution

A **deterministic interpretation layer** that translates raw Stripe account data into clear, ranked, plain-English explanations.

```bash
npx tsx src/index.ts --fixture past_due_blocked
```

```
  stripe account debugger

  source  fixture: past_due_blocked

────────────────────────────────────────────────────────────
  payouts             ✗ disabled
  details             ✓ submitted
  disabled_reason     requirements.past_due
────────────────────────────────────────────────────────────
  PAST DUE — BLOCKED                              [HIGH  ]
────────────────────────────────────────────────────────────
  2 issues detected

  ✕  past_due                                [HIGH  ]
     Requirements past due
     A required document deadline has passed. Payouts are disabled until all
     missing requirements are resolved. This requires immediate action.
     fields → individual.verification.document

  ●  partial_capabilities                    [MEDIUM]
     Some capabilities inactive
     Active: card_payments. Inactive: transfers.
     → no seller action required

────────────────────────────────────────────────────────────
```

**Under 10 seconds to understand any account state. No Stripe expertise required.**

### How it works

1. Raw Stripe account data is normalized into a stable `AccountSnapshot` (Zod-validated, insulated from API churn)
2. Eight independent issue detectors run against the snapshot — setup, past due deadlines, reviews, rejections, capability gaps, and more
3. Issues are ranked by severity (`high > medium > low`); the most severe becomes the `primaryStatus`
4. Output is plain English, with actionability flags so you know immediately whether the seller can fix it or has to wait

The tool works **without a Stripe API key** using local fixtures — realistic, Stripe-shaped JSON files that cover the full range of real-world Connect states.

---

## Demo

### 1. Operational — clean account, fully active

```bash
npx tsx src/index.ts --fixture operational
```

```
  stripe account debugger

  source  fixture: operational

────────────────────────────────────────────────────────────
  payouts             ✓ enabled
  details             ✓ submitted
────────────────────────────────────────────────────────────
  ✓  OPERATIONAL
────────────────────────────────────────────────────────────
  No issues detected. Account is fully operational.
────────────────────────────────────────────────────────────
```

> **What happened:** All requirements are clear, payouts are enabled, all capabilities are active. The tool confirms there's nothing to act on — the baseline happy path.

---

### 2. Needs Information — live but fields coming due

```bash
npx tsx src/index.ts --fixture needs_information
```

```
  stripe account debugger

  source  fixture: needs_information

────────────────────────────────────────────────────────────
  payouts             ✓ enabled
  details             ✓ submitted
────────────────────────────────────────────────────────────
  INFORMATION REQUIRED                            [MEDIUM]
────────────────────────────────────────────────────────────
  2 issues detected

  ●  requirements_due                        [MEDIUM]
     Information required
     The following fields must be provided to maintain active capabilities.
     Payouts or charges may be restricted if not resolved.
     fields → business_profile.url

  ○  requirements_eventually_due             [LOW   ]
     Upcoming requirements
     The following fields will be required in the future. No capabilities are
     currently affected, but failure to provide them will eventually cause restrictions.
     fields → individual.id_number

────────────────────────────────────────────────────────────
```

> **What happened:** The account is live and processing — payouts are still enabled — but `business_profile.url` is currently due, and `individual.id_number` is on the horizon. The tool surfaces both issues ranked by urgency so the seller knows what to fix first and what can wait.

---

### 3. Past Due — hard-blocked after a missed deadline

```bash
npx tsx src/index.ts --fixture past_due_blocked
```

```
  stripe account debugger

  source  fixture: past_due_blocked

────────────────────────────────────────────────────────────
  payouts             ✗ disabled
  details             ✓ submitted
  disabled_reason     requirements.past_due
────────────────────────────────────────────────────────────
  PAST DUE — BLOCKED                              [HIGH  ]
────────────────────────────────────────────────────────────
  2 issues detected

  ✕  past_due                                [HIGH  ]
     Requirements past due
     A required document deadline has passed. Payouts are disabled until all
     missing requirements are resolved. This requires immediate action.
     fields → individual.verification.document

  ●  partial_capabilities                    [MEDIUM]
     Some capabilities inactive
     Active: card_payments. Inactive: transfers.
     → no seller action required

────────────────────────────────────────────────────────────
```

> **What happened:** The seller submitted onboarding but missed the deadline for uploading an ID document. Stripe set `disabled_reason: requirements.past_due` and disabled payouts. The tool detects this as a HIGH severity, actionable issue and surfaces the exact field name — `individual.verification.document` — so the seller knows exactly what to upload. The secondary `partial_capabilities` issue confirms transfers are also down as a consequence.

---

### 4. Under Review — Stripe review in progress, no seller action possible

```bash
npx tsx src/index.ts --fixture under_review
```

```
  stripe account debugger

  source  fixture: under_review

────────────────────────────────────────────────────────────
  payouts             ✗ disabled
  details             ✓ submitted
  disabled_reason     under_review
────────────────────────────────────────────────────────────
  UNDER REVIEW                                    [MEDIUM]
────────────────────────────────────────────────────────────
  2 issues detected

  ●  under_review                            [MEDIUM]
     Account under review
     Stripe is conducting a review of this account. No action is required from the
     seller at this time. Capabilities may be limited until the review is complete.
     → no seller action required

  ●  partial_capabilities                    [MEDIUM]
     Some capabilities inactive
     Active: card_payments. Inactive: transfers.
     → no seller action required

────────────────────────────────────────────────────────────
```

> **What happened:** Stripe has triggered a manual review — `disabled_reason: under_review` with a document in `pending_verification`. Payouts are off, but this is **not actionable by the seller**. The tool makes this explicit: `→ no seller action required`. A support agent seeing this output knows immediately: don't ask the seller to do anything, just tell them to wait.

---

### 5. Partial Capabilities — core payments active, ACH and bank transfer not yet enabled

```bash
npx tsx src/index.ts --fixture partial_capabilities
```

```
  stripe account debugger

  source  fixture: partial_capabilities

────────────────────────────────────────────────────────────
  payouts             ✓ enabled
  details             ✓ submitted
────────────────────────────────────────────────────────────
  PARTIAL CAPABILITIES                            [MEDIUM]
────────────────────────────────────────────────────────────
  2 issues detected

  ●  partial_capabilities                    [MEDIUM]
     Some capabilities inactive
     Active: card_payments, transfers. Inactive: us_bank_account_ach_payments.
     Pending: bank_transfer_payments.
     → no seller action required

  ○  requirements_eventually_due             [LOW   ]
     Upcoming requirements
     The following fields will be required in the future. No capabilities are
     currently affected, but failure to provide them will eventually cause restrictions.
     fields → company.tax_id

────────────────────────────────────────────────────────────
```

> **What happened:** Card payments and transfers are fully active — the seller can process and receive money. But ACH is inactive and bank transfer payments are pending Stripe's approval. The tool lists all capability states in one place and flags `company.tax_id` as an upcoming requirement before restrictions kick in.

---

### 6. Onboarding Incomplete — seller never finished setup, 3 stacked issues

```bash
npx tsx src/index.ts --fixture onboarding_incomplete
```

```
  stripe account debugger

  source  fixture: onboarding_incomplete

────────────────────────────────────────────────────────────
  payouts             ✗ disabled
  details             ✗ not submitted
────────────────────────────────────────────────────────────
  SETUP INCOMPLETE                                [HIGH  ]
────────────────────────────────────────────────────────────
  3 issues detected

  ✕  setup_incomplete                        [HIGH  ]
     Onboarding not completed
     The account has not submitted required business details. No capabilities will
     be enabled and no payouts are possible until onboarding is complete.

  ●  requirements_due                        [MEDIUM]
     Information required
     The following fields must be provided to maintain active capabilities.
     Payouts or charges may be restricted if not resolved.
     fields → business_type, individual.first_name, individual.last_name,
              individual.dob.day, individual.dob.month, individual.dob.year,
              individual.email, tos_acceptance.date, tos_acceptance.ip

  ○  requirements_eventually_due             [LOW   ]
     Upcoming requirements
     The following fields will be required in the future. No capabilities are
     currently affected, but failure to provide them will eventually cause restrictions.
     fields → individual.id_number

────────────────────────────────────────────────────────────
```

> **What happened:** `details_submitted: false` is the root signal — the seller started onboarding but never completed it. The tool derives three stacked issues: the top-level `setup_incomplete` block, the 9 specific fields in `currently_due`, and a future requirement. A platform engineer can see at a glance that re-triggering the onboarding flow is the right call.

---

### `--explain` — see the normalized snapshot before analysis

```bash
npx tsx src/index.ts --fixture past_due_blocked --explain
```

```
  stripe account debugger

  source  fixture: past_due_blocked

────────────────────────────────────────────────────────────
  payouts_enabled     false
  details_submitted   true
  disabled_reason     requirements.past_due
  currently_due       individual.verification.document
  past_due            individual.verification.document
  capabilities        card_payments: active  transfers: inactive
────────────────────────────────────────────────────────────
  PAST DUE — BLOCKED                              [HIGH  ]
  ...
```

> **What happened:** `--explain` prints the normalized `AccountSnapshot` above the analysis output — the exact data the detectors ran against. Useful for debugging edge cases or verifying that a live Stripe account was parsed correctly.

---

### `--json` — machine-readable output for automation and CI

```bash
npx tsx src/index.ts --fixture operational --json
```

```json
{
  "state": {
    "primaryStatus": "operational",
    "issues": []
  },
  "snapshot": {
    "payouts_enabled": true,
    "details_submitted": true,
    "disabled_reason": null,
    "requirements": {
      "currently_due": [],
      "eventually_due": [],
      "past_due": [],
      "pending_verification": []
    },
    "capabilities": {
      "card_payments": "active",
      "transfers": "active"
    }
  }
}
```

> **What happened:** `--json` outputs the full analysis result as structured JSON — the `AccountState` (primary status + all issues) alongside the normalized snapshot. Designed for piping into monitoring scripts, alerting pipelines, or automated support tooling.
