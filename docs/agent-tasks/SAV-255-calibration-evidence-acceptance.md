# SAV-255 Calibration Evidence Acceptance

Historical delivery note: SAV-255 introduced v8 and the evidence-only gate
name. SAV-248 now emits v9 to add mandatory semantic-review finalization; the
v8 statements below describe the completed SAV-255 slice, not the current
writer contract.

## Intent

- User request: remove automated launch-decision language from calibration.
- Product/user outcome: calibration automation reports evidence without claiming
  launch authority.
- Why now: the human-owned launch decision reserves GO/NO-GO for the product
  owner, while the current v7 report still calls its combined evidence field
  `launchAcceptance`.

## Slice

- Primary slice: feedback and evaluation governance.
- Secondary slices: release-evidence compatibility and operator tooling.
- Relevant skills: `meelni-feedback-evaluation`,
  `meelni-engineering-memory`, `meelni-linear-workstream`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-198.
- Child deliverable issue: SAV-255.
- Current Linear state: In Progress.

## Scope

- In scope: emit `evaluation-calibration-report.v8`; rename the combined gate
  to `calibrationEvidenceAcceptance`; preserve all states, thresholds, and
  fail-closed CLI behavior; document and test immutable v7 compatibility.
- Out of scope: changing historical v7 bytes, provider calls, Production data,
  rollout actions, threshold changes, or launch GO/NO-GO.
- Assumptions: no runtime reader other than the calibration CLI consumes the
  current report type; committed v7 receipts remain historical evidence.

## Product Lens

- Audience: product owner and PM/engineering reviewers of calibration evidence.
- Activation/retention/monetization/growth lever: trustworthy feedback quality
  and trustworthy release evidence.
- Product Compass note: automated evidence should be decisive within its
  bounded domain and explicit about the authority it does not hold.

## Technical Plan

- Likely app files: none.
- Likely package/workflow files: calibration report, CLI, and behavior tests.
- Data or provider dependencies: none.
- Docs/decisions to update: calibration contract, runbook, evidence
  interpretation prose, and related agent task wording; no new decision record
  is needed.

## Validation

- Required commands: `npm run test:calibration`, application and test
  typechecks, scoped lint, Prettier check, and `git diff --check`.
- Optional/manual checks: repository search separates the historical v7/v8
  terminology from the current v9 writer.
- Fixtures or regression tests needed: byte hashes and interpretation of both
  committed v7 calibration reports, preservation of the hash-bound SAV-250
  audit, and the v8 gate/CLI behavior later preserved by v9.

## Rollout

- Risk level: low, with a deliberate versioned contract break for current
  writers.
- Backward compatibility: v7 evidence stays byte-for-byte immutable and is
  interpreted as historical technical evidence only; SAV-255 writers emitted
  v8 and current SAV-248 writers emit v9.
- Metrics/events to watch: none; this provider-free change creates no runtime
  product event.
- Follow-up slice: none required for the rename itself.
