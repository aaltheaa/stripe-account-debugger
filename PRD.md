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

### 8.2 --list-fixtures Extension
npx tsx src/index.ts --list-fixtures

#### Usage

```bash
npx tsx src/index.ts --fixture past_due_blocked
``