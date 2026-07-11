# SAV-233 Ledger Mutation Surface

## Intent

- User request: Complete the accepted relaunch-readiness findings through tracked, verified agent work.
- Product/user outcome: Application callers cannot bypass the lock-safe credit-ledger service with public low-level writes.
- Why now: The atomic-ledger audit found that the production adapter still exposed transaction-only mutation primitives.

## Slice

- Primary slice: billing architecture
- Secondary slices: testability and module boundaries
- Relevant skill: Meelni codebase architecture

## Linear Tracking

- Project: Meelni
- Parent slice issue: SAV-191
- Child deliverable issue: SAV-233
- Current Linear state: In Review (repository handoff; connector reauthorization required)

## Scope

- In scope: Separate provider-neutral reads from transaction-scoped mutations; narrow the runtime Drizzle adapter object; enforce that every transaction callback operation stays within the locked user; preserve explicit mutation access in the in-memory test adapter.
- Out of scope: Ledger behavior, persistence schema, catalog policy, package relocation, or provider work.
- Assumptions: All production writes already enter through `withUserTransaction`; direct mutation callers are test-only.

## Product Lens

- Audience: Meelni engineers and coding agents changing billing workflows.
- Lever: Reliability and faster safe iteration.
- Product Compass note: No customer-visible behavior or positioning change.

## Technical Plan

- Likely app files: None.
- Likely package/workflow files: `lib/billing/credits.ts`, `lib/billing/credit-ledger-store.ts`, and ledger tests.
- Data or provider dependencies: None.
- Docs/decisions to update: This intake and Linear evidence; existing atomic-ledger behavior remains authoritative.

## Validation

- Required commands: Billing tests, typecheck, boundary checks, `npm run check:ci`, and build.
- Optional/manual checks: Inspect the production adapter's runtime keys.
- Fixtures or regression tests needed: Assert every low-level mutation key is absent from the production adapter while existing fault-injection tests remain green.

## Rollout

- Risk level: Low.
- Backward compatibility: Top-level production reads and legitimate `withUserTransaction` calls are unchanged; unsupported direct access and cross-user callback reads or writes fail closed.
- Metrics/events to watch: None beyond existing billing failures.
- Follow-up slice: SAV-218 can split larger ledger workflows after behavior stabilizes.
