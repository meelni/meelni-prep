# SAV-411 spoken feedback eligibility

## Intent

- User request: preserve safe feedback after a natural spoken interview was
  misclassified by deterministic grammar and a textless interviewer marker.
- Product/user outcome: trustworthy frozen candidate evidence reaches grounded,
  scoreless coaching instead of a false no-data or system-degradation result.
- Why now: the latest owner-authenticated Production incident reproduced both
  false-negative seams and never invoked the evaluator.

## Slice

- Primary slice: feedback and evaluation.
- Secondary slices: transcript integrity, interview finalization, and durable
  feedback dispatch.
- Relevant skills: feedback evaluation, LiveKit interview runtime, codebase
  architecture, vertical-slice playbooks, engineering memory, Linear, and PR
  preparation.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-410, which remains open.
- Child deliverable issue: SAV-411.
- Current Linear state: In Review.

## Scope

- In scope: a typed qualitative-only long-form eligibility level; separate
  scoreable-response breadth; role/reason-scoped interruption integrity; one
  sanitized Production-shaped end-to-feedback regression.
- Out of scope: Production repair or retry, provider tuning, numerical rubric
  changes, LiveKit deployment, database migration, and SAV-412.
- Assumptions: canonical transcript preparation, frozen evidence boundaries,
  closed evidence-limited provider selections, and current scored Feedback v2
  remain authoritative.

## Product Lens

- Audience: authenticated PM interview candidates.
- Activation/retention lever: every trustworthy interview should return an
  honest useful outcome.
- Product Compass note: preserve evidence and withhold numerical precision when
  deterministic code cannot justify scores.

## Technical Plan

- App files: feedback lifecycle compatibility types and tests only.
- Package/workflow files: core eligibility and interruption contracts, session
  validation, writer progress, transcript snapshot, finalizer, generation mode,
  and sanitized fixtures.
- Data or provider dependencies: none for implementation; one redacted,
  aggregate-only Production read validated the proposed gate before adoption.
- Docs/decisions: amend the accepted evidence-gated decision and transcript,
  completion, generation, and Feedback v2 contracts; add OpenSpec.

## Validation

- Required commands: targeted core/workflow tests, `npm run test:core`,
  `npm run test:workflows`, `npm run test:interview-resilience`,
  `npm run test:database-migrations`, `npm run test:calibration`,
  `npm run typecheck`, `npm run verify:agent`, and repository secret/diff checks.
- Optional/manual checks: provider-free Production-shaped end-to-view fixture.
- Regression fixtures: six long synthetic spoken/STT-shaped answers, harmless
  interviewer interruptions with settled and missing writer proof, hard marker
  variants, adversarial low-signal cases, exact 14/15-token relationship edges,
  and the documented lexical false-positive limitation.
- Privacy-safe incident validation: the exact correlated six-turn Production
  row passed the refined fallback 6/6. Per-turn text was never output; token
  counts ranged from 46–200, distinct recognized lexemes from 4–11, recognized
  density from 0.073–0.140, strong disjoint relationships from 1–4, and broad
  disjoint relationships from 2–7.

## Rollout

- Risk level: high because the change controls provider invocation and frozen
  transcript trust.
- Backward compatibility: stored completion statistics may omit
  `scoreableResponses` and `feedbackModeConstraint`; generation retains the
  legacy substantive-count behavior when those additive fields are absent.
- Metrics/events to watch: outcome reason, completion tier, evaluator mode,
  generation failure, and transcript evidence state.
- Follow-up slice: SAV-410 remains the incident parent; SAV-393 remains open.
