# SAV-467 Agent Task Intake

## Intent

- User request: Complete the benchmark by recording the product owner's eight exact semantic labels in a durable fail-closed artifact.
- Product/user outcome: Measure whether adaptive interviewing is better without changing live behavior.
- Why now: SAV-466 established versioned interviewer moves; SAV-467 supplies the evaluation gate for later candidates.

## Slice

- Primary slice: Agent tooling and interviewer evaluation.
- Secondary slices: Live interview runtime contracts and reusable fixtures.
- Relevant skills: start, Linear workstream, feedback evaluation, LiveKit runtime, architecture, engineering memory, vertical slice, PR prep.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-465 (remains open).
- Child deliverable issue: SAV-467 only.
- Current Linear state: In Progress.

## Scope

- In scope: One typed/versioned JSON approval, strict runner-boundary verification, accepted provider-free reporting, adversarial tests, checked evidence, and contract/operations memory.
- Out of scope: Runtime prompt changes, customer transcripts, candidate scoring, provider calls/spend, Production mutations, canary/launch/default-on decisions, SAV-476 GO/NO-GO, signatures, and named human identity claims.
- Assumptions: SAV-198 patterns are reusable structurally but do not constitute interviewer-quality human adjudication.

## Product Lens

- Audience: Product owner and engineers comparing interviewer candidates.
- Lever: Better interview depth and trust in post-session feedback inputs.
- Product Compass note: Preserve a realistic interviewer that adapts without teaching or evaluating during the session.

## Technical Plan

- App files: None; no user-facing or runtime entrypoint change.
- Package/workflow files: Existing benchmark fixtures, local runner/CLI, and a repository-only adjudication parser.
- Data/provider dependencies: None for the default run.
- Docs/decisions: Contract, operations runbook, OpenSpec change, task memory, approval evidence, and checked baseline evidence. No decision record is needed because runtime/product authority is unchanged.

## Validation

- Required: Focused benchmark tests, baseline verification, package entrypoints, core/agent/Python-agent suites, typecheck, check, verify:agent, and clean-install reproducibility.
- Fixtures: Four full sessions, four complementary calibration sessions, six invariant controls, and fixed-seed outputs.

## Rollout

- Risk level: Low; tooling and contracts only.
- Backward compatibility: Additive package subpath and scripts.
- Metrics: Quality, response/judge latency, cost/calls, variance, invariants, and actionable failures.
- Follow-up: Semantic adjudication is complete. Later issues may gather separately authorized provider-backed candidate evidence and SAV-476 remains the human-owned rollout gate.

## Completion increment

- Accepted manifest: `312e086a46334ab3af3907406c90302990ab3ea90063e2ecc6428e17af30c70f`.
- Approval contract: `meelni.interviewer-benchmark-adjudication-approval.v1`.
- Canonical approval hash: `c45778d30fadbe37c3a35c9306443ac67a8fcdfe2693b94ab8663873bccb5757`.
- Accepted baseline report hash: `e64f58db923c40b62355d8c49cd6af4cc24de7401048051c23c3edb6a9cb37ef`.
- Provenance: direct product-owner message in supervisor task `01a016c0-57eb-72c0-a744-92c802d6be0a`, mirrored in Linear adjudication comment `b44d551e-d988-498f-94e9-16afdeaaac73` at `2026-08-19T05:53:26.680Z`; no named identity or signature is claimed.
- Resolution: eight of eight ordered scenario/label/seed decisions accepted; the report changes to `baseline_recorded_owner_adjudication_accepted` only when the exact artifact verifies.
- Authority: semantic gold-set adjudication only. Runtime, provider call/spend, canary, launch, default-on, Production, and SAV-476 GO/NO-GO authority remain denied.
- Remaining benchmark blocker: provider-backed candidate evidence has not been run; this approval neither permits nor performs that work.
