# SAV-267 Launcher Test Isolation

## Intent

- User request: Continue the accepted relaunch-readiness program using agents and keep Linear and GitHub current.
- Product/user outcome: Calibration validation remains deterministic when multiple agents or CI workers run it concurrently.
- Why now: A provider-free failure reproduced when one launcher-test process removed a shared `/tmp` channel while another process was asserting its global inventory.

## Slice

- Primary slice: Feedback and evaluation reliability.
- Secondary slices: CI determinism and security regression coverage.
- Relevant skill(s): `meelni-linear-workstream`, `meelni-feedback-evaluation`, `meelni-engineering-memory`, `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-248.
- Child deliverable issue: SAV-267.
- Current Linear state: In Progress.

## Scope

- In scope: A validated test-only channel namespace, process-owned inventory assertions, and an intentional two-process concurrency regression.
- Out of scope: Production launcher overrides, credential-path changes, paid model calls, provider state, migrations, and feature flags.
- Assumptions: Production continues using the fixed private channel prefix; only explicit launcher test mode accepts a namespace.

## Product Lens

- Audience: Engineers and agents validating PM feedback calibration.
- Activation/retention/monetization/growth lever: Trustworthy release validation and lower CI waste.
- Product Compass note: This preserves feedback trust without changing the customer-facing evaluation contract.

## Technical Plan

- Likely app files: `lib/evaluation/calibration-live-launcher.test.mjs` and its concurrency worker fixture.
- Likely package/workflow files: `scripts/run-evaluation-calibration-live.sh`.
- Data or provider dependencies: None; dummy test credentials only.
- Docs/decisions to update: This task intake; no product or architecture decision change.

## Validation

- Required commands: Targeted launcher tests, intentional dual-process regression, `npm run test:calibration`, `npm run check:ci`.
- Optional/manual checks: Run two targeted launcher suites concurrently.
- Fixtures or regression tests needed: A synchronized worker process that reports owned channel inventory before and after its peer exits.

## Rollout

- Risk level: Low, with security-sensitive test seam validation.
- Backward compatibility: Production channel creation and credential flow remain unchanged.
- Metrics/events to watch: CI failure rate for calibration launcher cleanup assertions.
- Follow-up slice: Refresh SAV-248 calibration evidence after this reliability fix merges.
