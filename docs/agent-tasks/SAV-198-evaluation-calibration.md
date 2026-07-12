# SAV-198 Evaluation Calibration

## Intent

- User request: prove PM feedback quality against an adjudicated gold set before relaunch.
- Product/user outcome: feedback evidence, completion state, score agreement, and repeated-run stability have an honest launch gate.
- Why now: SAV-196 made transcript evidence fail closed and SAV-197 made generation retry-safe; neither proves live model quality.

## Slice

- Primary slice: feedback and evaluation.
- Secondary slices: reusable fixtures and operator tooling.
- Relevant skills: `meelni-feedback-evaluation`, `meelni-vertical-slice-playbooks`, `meelni-engineering-memory`, `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-168.
- Child deliverable issue: SAV-198.
- Current Linear state: In Progress.

## Scope

- In scope: at least 40 synthetic PM transcripts spanning weak, average, and strong sufficient answers; agent-authored semantic adjudication candidates with exact evidence; an explicit product-owner/PM signoff gate; dimension score bands; model provenance; a bounded workflow-backed calibration harness; machine-readable reports; and operator docs.
- Out of scope: customer transcripts, remote database writes, paid provider calls without explicit authorization, model tuning, and launch-readiness claims from deterministic fixtures.
- Assumptions: the SAV-196 canonical transcript validator and SAV-197 generation workflow remain the production boundaries under test.

## Technical Plan

- Fixture files: `packages/test-fixtures/src/evaluation-calibration.ts` and behavior tests.
- Workflow files: `lib/evaluation/calibration.ts` and behavior tests using `generateFeedbackWorkflow` with an in-memory store.
- Operator files: `scripts/run-evaluation-calibration.ts` and package scripts.
- Provider dependency: optional OpenAI execution through the existing scorer, guarded by an explicit paid-calibration acknowledgement, an all-approved adjudication artifact, the fresh pinned `gpt-5.1-2025-11-13` + official endpoint + default-tier pricing contract, zero SDK retries/redirects, a 96-physical-attempt cap, and a $3 hard spend cap.
- Docs: calibration contract, operations runbook, and a checked preflight report.

## Validation

- Required commands: calibration preflight/self-test, fixture/core/workflow tests, `npm run check:ci`, `npm run build`, and `npm run verify:agent` when the local environment permits it.
- Fixtures: 10 Product Sense, 10 Execution, 10 Strategy, and 10 Behavioral cases; every round includes weak, average, and strong sufficient answers plus full, partial, short, and low-signal states.
- Acceptance thresholds: 100% exact evidence validity, insufficient handling, and model identity; at least 80% pooled and per-dimension score agreement; at least 75% per-round and per-state agreement; maximum repeated-run dimension range of 1; and exactly three runs within 96 calls and $3 total estimated committed spend.

## Rollout

- Risk level: high because the result gates claims about feedback trustworthiness.
- Backward compatibility: additive test/operator surface only; no runtime schema or customer data changes.
- Metrics/events to watch: provider-run validity, score agreement, unstable dimensions, insufficient cases incorrectly sent to the model.
- Follow-up slice: an explicitly authorized repeated provider run; keep SAV-198 In Progress until its machine-readable report passes.
