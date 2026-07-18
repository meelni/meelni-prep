# SAV-266 Exact Local Node Runtime

## Intent

- User request: Continue launch-readiness work while external provider connections remain pending.
- Product/user outcome: Local setup, diagnostics, and calibration tooling fail early and consistently when the active Node runtime differs from the reviewed runtime.
- Why now: CI and the privileged calibration runtime already target Node 22.22.0, while local tooling previously accepted older or adjacent versions.

## Slice

- Primary slice: Developer tooling and calibration runtime integrity.
- Secondary slices: CI parity and operator documentation.
- Relevant skills: `meelni-linear-workstream`, `meelni-engineering-memory`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: Relaunch readiness.
- Child deliverable issue: SAV-266.
- Current Linear state: In Progress.

## Scope

- In scope: One exact machine-readable local Node pin, fail-before-side-effect setup enforcement, complete doctor diagnostics, CI consumption of the same pin, calibration build/verification enforcement, regression tests, and operations documentation.
- Out of scope: Provider mutations, Production data or migrations, feature-flag changes, package upgrades, paid calibration calls, and changes to the privileged launcher's independent binary attestation.
- Assumptions: Vercel remains on the supported Node 22 major while local and calibration tooling require the exact reviewed 22.22.0 patch.

## Product Lens

- Audience: Meelni engineers and coding agents.
- Activation/retention/monetization/growth lever: Release reliability and lower operational recovery time.
- Product Compass note: Infrastructure-only; no customer-facing positioning or launch decision changes.

## Technical Plan

- Add `.node-version` as the canonical exact local runtime and expose a small dependency-free parser/assertion module.
- Enforce the version before local setup side effects and report mismatches without aborting the remainder of doctor diagnostics.
- Make CI setup-node and calibration artifact commands consume the shared contract.
- Keep `package.json` at `22.x` for Vercel compatibility and document the intentional exact-local versus deployment-major distinction.
- Refresh the calibration runtime manifest's package-lock digest without changing the generated bundle bytes.

## Validation

- Required commands: Node 20 negative setup/doctor/calibration checks; Node 22.22.0 runtime unit tests; `npm run test:local`; `npm run test:calibration`; `npm run verify:agent`; `npm run check`; and `git diff --check`.
- Optional/manual checks: Confirm mismatch output contains the deterministic `fnm install` and `fnm use` recovery command and setup creates no new state before exiting.
- Fixtures or regression tests needed: Exact-version acceptance, adjacent-version rejection, strict `.node-version` parsing, and cross-file CI/package/calibration alignment.

## Rollout

- Risk level: Low to moderate; the change intentionally blocks unsupported local runtimes.
- Backward compatibility: Developers on another Node version must select 22.22.0 before setup or calibration commands; Vercel remains compatible with Node 22.
- Metrics/events to watch: Hosted Validate result and local setup/doctor failures.
- Follow-up slice: Track dependency engine requirements separately if the package graph moves beyond Node 22 support.
