# SAV-201 Agent Task Intake — Deterministic Drill Recommendations

## Intent

- User request: Build a provider-neutral, versioned, deterministic recommendation contract from validated Feedback v2 evidence.
- Product/user outcome: Equal evaluated PM interview inputs produce the same evidence-grounded focused-practice identity.
- Why now: Relaunch feedback must not expose random, generic, or hallucinated personalization.

## Slice

- Primary slice: feedback and evaluation.
- Secondary slices: core package contract and regression fixtures.
- Relevant skills: `meelni-feedback-evaluation`, `meelni-vertical-slice-playbooks`, `meelni-codebase-architecture`, `meelni-engineering-memory`, `meelni-linear-workstream`, `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-168.
- Child deliverable issue: SAV-201.
- Current Linear state: In Progress until the stacked PR is merged and rollout criteria are satisfied.

## Scope

- In scope: canonical PM rounds, validated dimension scores, grounded improvement evidence, explicit ties and unavailable states, stable drill IDs, template-version fencing, fixtures, tests, and contract docs.
- Out of scope: model/provider calls, prompt changes, persistence, UI/API integration, credit usage, analytics, feature flags, and launch-readiness claims.
- Assumptions: Feedback v2 has already passed `parseFeedbackV2`; the contract repeats selection-critical checks but does not reparse raw model output.

## Product Lens

- Audience: PM candidates reviewing evidence-grounded feedback.
- Lever: trust and retention through a repeatable next practice action.
- Product Compass note: User-facing language is “focused practice” or “practice recommendation,” never gym, reps, workouts, or fitness framing. Internal `drill` identifiers remain compatibility vocabulary only.

## Technical Plan

- App files: none.
- Package/workflow files: `packages/core/src/drill-recommendation.ts` through the public `@meelni/core` entrypoint; fixtures in `@meelni/test-fixtures`.
- Data/provider dependencies: none.
- Docs: add the deterministic drill recommendation contract and contract index entry.

## Validation

- Required commands: targeted core/fixture/type tests, `npm run check:ci`, `npm run build`, and `npm run verify:agent` when feasible.
- Manual checks: none; no UI or provider behavior changes.
- Fixtures: four canonical PM rounds plus pending, processing, insufficient, skipped, abandoned, and failed states.

## Rollout

- Risk level: medium; recommendation semantics are durable but not integrated into a product surface in this slice.
- Backward compatibility: additive public package export; legacy and invalid feedback fail closed.
- Metrics/events to watch: none until a later integration slice owns a user surface.
- Follow-up slice: catalog/UI integration only after this contract is reviewed; do not begin SAV-202 in this task.
