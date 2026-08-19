# SAV-467 Agent Task Intake

## Intent

- User request: Build and publish a versioned local multi-turn interviewer benchmark.
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

- In scope: Typed contracts, four-round synthetic sessions, adversarial cases, deterministic invariants, provider boundary, replay baseline, thresholds, tests, and operations docs.
- Out of scope: Runtime prompt changes, customer transcripts, candidate scoring, provider calls, Production mutations, launch/default-on decisions, and owner adjudication fabrication.
- Assumptions: SAV-198 patterns are reusable structurally but do not constitute interviewer-quality human adjudication.

## Product Lens

- Audience: Product owner and engineers comparing interviewer candidates.
- Lever: Better interview depth and trust in post-session feedback inputs.
- Product Compass note: Preserve a realistic interviewer that adapts without teaching or evaluating during the session.

## Technical Plan

- App files: None; no user-facing or runtime entrypoint change.
- Package/workflow files: `@meelni/agent`, isolated test-fixture subpath, local runner and CLI.
- Data/provider dependencies: None for the default run.
- Docs/decisions: Contract, operations runbook, OpenSpec change, checked baseline evidence. No accepted decision is claimed while owner adjudication is pending.

## Validation

- Required: Focused benchmark tests, baseline verification, package entrypoints, core/agent/Python-agent suites, typecheck, check, verify:agent, and clean-install reproducibility.
- Fixtures: Four full sessions, four complementary calibration sessions, six invariant controls, and fixed-seed outputs.

## Rollout

- Risk level: Low; tooling and contracts only.
- Backward compatibility: Additive package subpath and scripts.
- Metrics: Quality, response/judge latency, cost/calls, variance, invariants, and actionable failures.
- Follow-up: Owner adjudicates exactly eight examples; later issues compare candidates and may seek shadow entry.
