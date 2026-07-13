# SAV-247 Invoice-First Subscription Convergence

## Intent

- User request: Complete every accepted relaunch-readiness issue and make the safest implementation decisions autonomously.
- Product/user outcome: A paid Starter or Pro purchase grants the correct entitlement on the first valid invoice delivery even when Stripe delivers the invoice before the subscription-created webhook commits.
- Why now: Preview rehearsal proved a paid-without-entitlement window caused by webhook delivery racing an uncommitted customer mapping.

## Slice

- Primary slice: billing, trials, and entitlements
- Secondary slices: Stripe provider normalization and webhook idempotency
- Relevant skills: meelni-linear-workstream, meelni-vertical-slice-playbooks, meelni-engineering-memory, stripe-best-practices

## Linear Tracking

- Project: Meelni
- Parent slice issue: SAV-226
- Child deliverable issue: SAV-247
- Current Linear state: Todo

## Scope

- In scope: Authoritative subscription lookup for subscription-creation invoices; customer, subscription, price, owner, and period binding; invoice-first local state convergence; exact-once payment and credit behavior; reordered and concurrent webhook tests.
- Out of scope: Checkout redesign, catalog changes, refunds, Production/live-mode provider actions, and customer data.
- Assumptions: Stripe-signed events remain untrusted until their relevant subscription snapshot is retrieved and cross-checked; renewal invoices cannot establish missing local subscription state.

## Product Lens

- Audience: PM candidates purchasing Starter or Pro practice access.
- Activation/retention/monetization/growth lever: Monetization trust and immediate paid activation.
- Product Compass note: A successful paid purchase must produce usable interview access without relying on webhook delivery order.

## Technical Plan

- Likely app files: `app/api/webhooks/stripe/route.ts` and its route tests.
- Likely package/workflow files: a focused Stripe subscription-snapshot normalizer or the existing subscription reconciliation workflow.
- Data or provider dependencies: Existing Stripe test-mode API and current billing tables; no schema migration expected.
- Docs/decisions to update: Stripe test plan and this task intake; no new product decision record.

## Validation

- Required commands: targeted Stripe webhook tests, full billing suite, full API suite, application/test typechecks, lint, build or exact-head Preview deployment.
- Optional/manual checks: Isolated Stripe test-mode purchase with natural event order, event replay, and period-end cancellation.
- Fixtures or regression tests needed: invoice first, subscription first, concurrent delivery, conflicting owner/customer/subscription/price evidence, renewal without local state, and duplicate delivery.

## Rollout

- Risk level: High because this controls paid entitlement creation.
- Backward compatibility: Existing subscription-first and renewal paths must remain exact-once; ambiguous or incomplete evidence remains retryable and fail-closed.
- Metrics/events to watch: Failed Stripe webhook count, payment without linked grant, first-paid-invoice latency, duplicate grant count.
- Follow-up slice: SAV-246 database privilege convergence, then the full synthetic golden path.
