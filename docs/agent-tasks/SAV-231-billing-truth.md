# SAV-231 Billing Truth

## Intent

- User request: Make refunds, disputes, cancellations, credits, and customer-facing billing state agree before relaunch.
- Product/user outcome: A customer sees one truthful credit balance, and support can explain every payment reversal without hidden debt or unrelated clawbacks.
- Why now: The credit catalog is accepted, but Stripe reversals currently update payment history without reconciling paid grants.

## Slice

- Primary slice: Billing, Trials, and Entitlements.
- Secondary slices: Stripe webhooks, support evidence, analytics, billing UI, and operations.
- Relevant skills: `meelni-vertical-slice-playbooks`, `meelni-product-strategy`, `meelni-engineering-memory`, `meelni-linear-workstream`, `meelni-pr-prep`, and `stripe-best-practices`.

## Linear Tracking

- Project: Meelni Relaunch.
- Child deliverable issue: SAV-231.
- Current Linear state: In Progress.

## Scope

- In scope: Interview Pass and subscription payment/grant correlation; full and cumulative partial refunds; refund failure/cancellation; dispute withdrawal/reinstatement/closure; durable grant revocation; active-reservation settlement; idempotency, event reordering, and concurrency; deletion privacy; payment history and billing UI truth; support evidence; analytics; additive migration; test-mode fixtures.
- Out of scope: Live Stripe or Production mutation, catalog or pricing changes, forced cancellation of in-flight interviews, clawing credits from unrelated grants, and cancellation-provider behavior until the product owner selects immediate cancellation or paid-period access.
- Assumptions: Any refund/dispute against a paid source revokes the source's remaining funded credits. Ordinary cancellation without a payment reversal preserves granted credits. Active reservations settle normally but cannot restore revoked credits to spendable balance.

## Product Lens

- Audience: PM candidates paying for live mock interviews.
- Lever: Monetization and trust.
- Product Compass note: Truthful entitlements and explainable adjustments take priority over maximizing short-term credit recovery.

## Technical Plan

- App files: Stripe webhook, cancellation route, payment-history route, dashboard billing section.
- Workflow files: Credit ledger service/store, Stripe billing reconciliation workflow, billing analytics.
- Data/provider dependencies: PostgreSQL, durable rollover source lots and lot allocations, and test-mode Stripe event fixtures.
- Docs/decisions: Accepted billing-adjustment policy, credit-billing launch runbook, Stripe test plan.

## Validation

- Required commands: `npm run test:billing`, targeted workflow/API tests, `npm run test:database-migrations` against disposable PostgreSQL, `npm run typecheck`, `npm run lint`, and `npm run build` where environment permits.
- Manual checks: No-refund cancellation preserves credits; refund/dispute excludes the correlated source immediately; replay is stable; payment history explains the adjustment.
- Regression fixtures: Pass refund, cumulative partial subscription refunds, failed refund, dispute withdrawal/reinstatement, ordered and reversed delivery, replay, concurrent reserve-versus-revoke, active allocation release/consume after revocation, aggregate payment status, rollover correlation, overlapping partial withdrawals after three source credits are consumed, a frozen allocation that is consumed then session-refunded while overlapping full withdrawals remain active, and two 4-credit sources contributing one credit each to a pooled rollover where one pooled credit is consumed and both sources are fully refunded. The pooled case must finish at four available renewal credits with total source truth of seven unrecoverable and one revoked credit across ordered, reversed, replayed, concurrent, clean-database, and upgrade-database execution.

## Rollout

- Risk level: High; billing and entitlement integrity.
- Backward compatibility: Additive schema; legacy payment rows without correlation or rollover grants without durable source lots require support review rather than guessed mutation.
- Metrics/events: `billing_credit_payment_adjusted`, reconciliation-required failures, revoked/unrecovered quantities, duplicate events.
- Follow-up slice: Preview Stripe rehearsal after environment isolation and before enabling the relaunch flag.
- Policy blocker: Cancellation economics and customer promise require an explicit product-owner choice; this branch intentionally makes no cancellation change.
