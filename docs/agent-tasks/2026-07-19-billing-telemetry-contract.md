# Billing operational telemetry contract

## Intent

Close the privacy gap where authenticated billing-read and customer-portal
routes write raw database or Stripe exceptions to server logs.

## Slice

- Add `billing_read` and `billing_portal` to the version-1 operational-failure
  catalog with fixed route-level error codes.
- Route the six billing read/portal boundaries through
  `reportOperationalFailure`.
- Preserve every existing HTTP response and billing behavior.
- Extend the source contract so these boundaries cannot reintroduce ad hoc
  console output.
- Update the contract and operator runbook.

## Out of scope

- Billing catalog, entitlement, cancellation, proration, or refund changes.
- Provider configuration or mutation.
- Production, migration, feature-flag, or customer-data actions.
- Adding an external alert receiver; the runbook still records that launch
  blocker separately.

## Validation

- `npm run test:operations`: 52 tests passed, including the closed event
  behavior and route/code source contract.
- `npm run typecheck`: passed.
- Targeted ESLint: passed.
- Full current-main API Vitest selection: 27 files / 220 tests passed under
  the repository-compatible Node runtime.
- Prettier and `git diff --check`: passed.
- No raw `console.*` call remains in the six covered route boundaries.

## Tracking

Tracked under SAV-215. The GitHub branch and eventual PR provide the exact
implementation and verification evidence for this billing-observability slice.
