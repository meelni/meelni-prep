# SAV-232 Terminal Replay Analytics

## Intent

- User request: Complete the accepted relaunch-readiness findings through tracked, verified agent work.
- Product/user outcome: Exact settlement retries do not inflate canonical credit-consume, release, or refund metrics.
- Why now: The independent atomic-ledger audit found that storage replay was idempotent while terminal analytics replay was not.

## Slice

- Primary slice: billing / credit settlement
- Secondary slices: analytics and observability
- Relevant skills: Meelni vertical-slice playbooks and Stripe best practices

## Linear Tracking

- Project: Meelni
- Parent slice issue: SAV-191
- Child deliverable issue: SAV-232
- Current Linear state: In Review

## Scope

- In scope: Surface first-write versus exact replay from terminal settlement; emit canonical terminal analytics only for the first committed write; cover consume, release, and refund.
- Out of scope: Catalog, balance, reservation-transition, PostHog provider, or launch-flag changes.
- Assumptions: Exact replay keeps the same terminal type and idempotency key; conflicting terminal requests continue to fail closed.

## Product Lens

- Audience: Meelni operators evaluating interview activation and billing correctness.
- Lever: Trustworthy monetization and reliability metrics.
- Product Compass note: This is measurement correctness, not a new customer-visible claim.

## Technical Plan

- Likely app files: None.
- Likely package/workflow files: `lib/billing/credits.ts`, local development adapter, and billing tests.
- Data or provider dependencies: None; no database or provider writes.
- Docs/decisions to update: This intake and Linear evidence only; no behavior contract changes beyond the additive duplicate result.

## Validation

- Required commands: Focused billing tests, typecheck, `npm run check:ci`, and `npm run build`.
- Optional/manual checks: Inspect the emitted event sequence under first writes and exact replays.
- Fixtures or regression tests needed: Consume, release, and refund first-write/replay pairs with an injected terminal event recorder.

## Rollout

- Risk level: Low.
- Backward compatibility: The settlement result adds `duplicate`; existing callers that only read `reservation` remain compatible.
- Metrics/events to watch: Canonical terminal event volume and replay ratio in workflow logs.
- Follow-up slice: SAV-233 narrows the low-level mutation API independently.
