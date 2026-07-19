# Checkout success truth

## Intent

- User request: Remove the false credit-success state from the Checkout return route.
- Product/user outcome: A PM candidate sees purchase confirmation and learns that credits were added only after the exact authenticated purchase has a durable credit grant record.
- Why now: Direct navigation, an absent or forged Checkout Session ID, and webhook delay currently render the same success claim as a fulfilled purchase.

## Slice

- Primary slice: Billing, trials, and entitlements.
- Secondary slices: Authentication handoff and public purchase-state UX.
- Relevant skills: `meelni-vertical-slice-playbooks`, `stripe-best-practices`, `meelni-ui-design-system`, `meelni-engineering-memory`, `meelni-linear-workstream`, `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-185.
- Child deliverable issue: SAV-272.
- Current Linear state: In Review while the isolated implementation awaits independent review and merge.

## Scope

- In scope: Safe server-only Checkout Session parsing, per-return opaque handle and 30-day cookie handoff, concurrent-tab isolation, auth preservation, webhook-owned canonical failure-to-success convergence, authenticated first-party settlement reads, pending/confirmed/reversal recovery states, relaunch-safe navigation, bounded retries, recursive browser and server analytics redaction, behavior tests, and the durable Checkout contract.
- Out of scope: Credit fulfillment changes, database migrations, catalog changes, cancellation policy, refunds, prorations, provider mutations, feature-flag changes, and Production actions.
- Assumptions: Signed webhook workflows remain the only entitlement mutation path. The return route confirms historical fulfillment only from the matching durable payment-and-grant correlation; it does not claim a current remaining balance.

## Product Lens

- Audience: A PM candidate returning from an Interview Pass, Starter, or Pro Checkout.
- Activation/retention/monetization/growth lever: Monetization trust and paid activation.
- Product Compass note: Purchase copy follows entitlement truth; navigation alone is never success evidence.

## Technical Plan

- App files: `/pricing/success`, `/api/checkout/return`, `/api/checkout/status`, Checkout creation, and the existing Stripe webhook adapter.
- Workflow files: Provider-neutral settlement resolution plus authoritative webhook-only Checkout Session helpers under `lib/billing/`.
- Data or provider dependencies: Existing signed webhook provider reads plus owner-scoped `payment_history`→`credit_grant` reads. Subscription-create fulfillment records the existing Checkout Session ID in the existing payment row. No migration or new provider mutation.
- Docs/decisions to update: Extend the existing Stripe Checkout fulfillment contract and test plan; no new decision record because policy is unchanged.

## Validation

- Required commands: Focused Checkout-state and route tests, full billing/API suites, typecheck, lint, and build/agent verification as feasible.
- Optional/manual checks: Preview-only test-mode Checkout after separate provider authorization; not part of this provider-free implementation.
- Fixtures or regression tests needed: Missing/malformed handle-specific cookie, two concurrent returns, 30-day delayed revisit, missing/expired versus unavailable auth, wrong-owner, pending, canonical failed-to-succeeded and delayed-failure ordering for one-time and subscription-create purchases, reversed copy, ambiguous or mismatched grant, incomplete provider inventory, database-unavailable, relaunch-gated navigation, provider-ID-free auth handoff, and recursive browser/server analytics redaction using synthetic IDs only, including return handles, billing `source_id`, and embedded `idempotency_key` fields.

## Rollout

- Risk level: Medium UX and billing-truth risk; no migration or entitlement mutation risk.
- Backward compatibility: Authenticated Checkout creation now mints a random opaque handle in Session metadata, uses a queryless `success_url`, returns the handle without the Session ID, and stores the handle in same-tab storage before redirect. The public legacy return route discards every query. Exactly eight deterministic server-cookie slots bind handle plus Session ID for 30 days; collisions fail closed. Pending and retryable states retain correlation, while confirmed and definitive states clear it. Exact legacy subscription-create invoice rows with a NULL Checkout correlation are validated and backfilled or promoted in place without downgrading reversal truth.
- Metrics/events to watch: Pending confirmations that do not converge and safe confirmation-unavailable operational events.
- Follow-up slice: Run the isolated Preview Checkout test separately after provider authorization, then close SAV-272 with merged verification evidence.
