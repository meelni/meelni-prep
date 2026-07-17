# SAV-245/SAV-247 Invoice Entitlement Reconvergence

## Intent

- User request: Complete the provider-free subscription correctness work while preserving the owner-controlled relaunch gate.
- Product/user outcome: A valid Starter or Pro invoice produces the same exact entitlement regardless of Stripe webhook delivery order, while ambiguous evidence grants nothing.
- Why now: The parked fixes addressed complementary invoice-line and invoice-first failure modes but were not present on the canonical launch branch.

## Slice

- Primary slice: billing, trials, and entitlements
- Secondary slices: Stripe normalization, webhook ordering, privacy-safe replay
- Relevant skills: meelni-linear-workstream, meelni-vertical-slice-playbooks, meelni-engineering-memory, meelni-pr-prep, stripe-best-practices

## Linear Tracking

- Project: Meelni
- Parent slice issues: SAV-245 and SAV-247
- Child deliverable issue: one combined reconvergence pull request
- Current Linear state: In Progress

## Scope

- In scope: bounded invoice-line pagination; recurring service-period, subscription, price, and owner binding; authoritative invoice-first bootstrap; atomic mapping, payment, subscription, and credit outcome; retired-resource, redaction, replay, and legacy compatibility.
- Out of scope: provider mutations, live Checkout, Production or customer data, refunds, feature-flag changes, and launch decisions.
- Assumptions: a subscription-creation invoice may bootstrap only from a fresh authoritative subscription read; a renewal invoice may never invent missing local state.

## Product Lens

- Audience: PM candidates purchasing Starter or Pro practice access.
- Activation/retention/monetization/growth lever: immediate paid activation and billing trust.
- Product Compass note: paid access must not depend on webhook delivery order.

## Technical Plan

- App files: Stripe webhook route and focused route tests.
- Workflow files: invoice-line evidence and invoice-first subscription normalizers.
- Data or provider dependencies: existing billing tables and Stripe types; no migration or provider operation.
- Docs/decisions to update: subscription-entitlement contract and Stripe test plan; no new product decision.

## Validation

- Required commands: billing suite, Stripe webhook route suite, full API/CI checks, typechecks, lint, security checks, and production build.
- Optional/manual checks: isolated test-mode rehearsal only after separate authorization.
- Fixtures or regression tests needed: paginated lines, modern and legacy evidence, proration and cross-subscription ambiguity, invoice-first delivery, missing renewal state, retired resource, replay, and redacted failure.

## Rollout

- Risk level: high because the slice controls paid entitlement creation.
- Backward compatibility: modern and legacy Stripe invoice shapes remain supported only when evidence is unique and internally consistent.
- Metrics/events to watch: failed Stripe webhook count, succeeded payment without linked grant, duplicate grants, and entitlement latency.
- Follow-up slice: exact-head Preview rehearsal while the relaunch feature flag remains off.
