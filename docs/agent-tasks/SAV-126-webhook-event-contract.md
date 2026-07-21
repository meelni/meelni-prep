# Agent Task Intake: SAV-126 Stripe Webhook Event Contract

## Intent

- User request: advance the highest-value provider-free SAV-126 work while
  live Stripe and Production configuration remain separately gated.
- Product/user outcome: every paid, failed, refunded, or disputed billing
  transition reaches the handler because endpoint configuration cannot drift
  from runtime behavior.
- Why now: the current handler accepts 16 required events while the live-mode
  checklist documents only nine and the latest staging receipt records 15.

## Slice

- Primary slice: Stripe webhook delivery contract.
- Secondary slices: billing operations, security, and launch evidence.
- Relevant skills: `meelni-linear-workstream`,
  `meelni-engineering-memory`, `meelni-pr-prep`, and
  `stripe-best-practices`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-167.
- Child deliverable issue: SAV-126.
- Current Linear state: In Progress.

## Scope

- In scope: one executable required/optional event contract; type-safe runtime
  action dispatch; provider-free allowlist output and sanitized evidence
  verification; documentation drift tests; current isolation wording.
- Out of scope: Stripe/Vercel/Preview/Production mutation, credentials, signed
  delivery, catalog/Portal setup, billing policy, and relaunch state.
- Assumptions: the existing 16 billing event behaviors remain required;
  `customer.subscription.trial_will_end` remains optional.

## Product Lens

- Audience: candidates purchasing Interview Pass, Starter, or Pro.
- Activation/retention/monetization lever: reliable fulfillment and reversible
  payment truth.
- Product Compass note: operational evidence must cover the complete billing
  lifecycle, not only a successful purchase.

## Technical Plan

- App files: `app/api/webhooks/stripe/route.ts`.
- Package/workflow files: `lib/billing/stripe-webhook-events.ts`, its tests,
  and `scripts/stripe-webhook-event-contract.ts`.
- Data or provider dependencies: none; sanitized endpoint event names only.
- Docs to update: Stripe contract index, live checklist, test plan, and credit
  billing launch runbook.

## Validation

- Required commands: focused contract test, `npm run test:billing`, Stripe
  route tests, typechecks, formatting/diff checks, and proportional security
  scan.
- Completed locally under the repository's Node 22.22.0 runtime: 260 billing
  tests, 43 Stripe route tests, 54 operations tests, the production-source and
  contract-test compiler scopes, targeted ESLint, Prettier, skill validation,
  diff checks, and the Semgrep security scan.
- Full-repository `npm run typecheck` and `npm run typecheck:tests` remain
  unavailable in the shared local dependency install because its unrelated
  browser/UI test packages are absent. No compiler diagnostic remained in the
  production-source or webhook-contract scopes.
- Optional/manual checks: later provider-authorized verification of sanitized
  staging and live endpoint event exports.
- Regression tests: exact 16/1 contract, action exhaustiveness, incomplete or
  wildcard endpoint rejection, and documentation block drift.

## Rollout

- Risk level: medium; billing routing changes structurally but preserves each
  existing handler and event behavior.
- Backward compatibility: unknown signed events remain acknowledged no-ops;
  endpoint verification becomes intentionally stricter.
- Metrics/events to watch: webhook failures, missing refund/dispute receipts,
  and `stripe_event_log` reconciliation state after later rehearsal.
- Follow-up slice: guarded live endpoint/Portal/Vercel configuration and the
  three-product Checkout rehearsal remain open on SAV-126.
