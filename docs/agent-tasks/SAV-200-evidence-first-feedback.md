# SAV-200 Evidence-First Feedback Review

## Intent

- User request: restore and finish SAV-200 on current `main` as a focused, reviewable pull request.
- Product/user outcome: completed feedback is trustworthy and evidence-first; incompatible persisted data never appears as personalized guidance.
- Why now: the earlier SAV-200 work landed only on a stale feature branch, while current `main` still casts persisted JSON directly into the customer response.

## Slice

- Primary slice: feedback and evaluation.
- Secondary slices: authenticated feedback UI and durable feedback read contracts.
- Relevant skills: `meelni-feedback-evaluation`, `meelni-ui-design-system`, `meelni-vertical-slice-playbooks`, `meelni-linear-workstream`, `meelni-engineering-memory`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-168.
- Child deliverable issue: SAV-200.
- Current Linear state: In Progress; a reconvergence start note is recorded on SAV-200.

## Scope

- In scope: owner-scoped completed-feedback reads; strict supported-v2, supported-legacy, and invalid variants; canonical candidate-turn evidence revalidation; evidence-first findings; complete, partial, skipped, failed, processing, missing, session-active, settling, legacy, and invalid UI states; accessibility; responsive presentation; regression tests and contract documentation.
- Out of scope: database migrations, provider calls, Production data, feature flags, LiveKit changes, recommendation ranking, SAV-201/SAV-202 persistence, launch decisions, and merging the PR.
- Assumptions: the current feedback-v2 version tuple and scoring weights remain authoritative; legacy rows have no transcript-verification claim; only the product owner makes launch go/no-go decisions.

## Product Lens

- Audience: PM candidates reviewing a completed or interrupted mock interview.
- Activation/retention/monetization/growth lever: trust in feedback and a clear next practice action.
- Product Compass note: use live PM interview practice language; avoid fitness metaphors, readiness claims, and provider/model marketing.

## Technical Plan

- Likely app files: `app/api/feedback/[sessionId]/route.ts`, `app/feedback/[sessionId]/page.tsx`, and the loading route where shared lifecycle behavior requires it.
- Likely package/workflow files: a provider-independent `@meelni/core` read model, explicit bounded database projections, and canonical evidence-turn reads.
- Data or provider dependencies: none; persisted values are treated as untrusted input and tests use fixtures only.
- Docs/decisions to update: feedback-v2 and feedback-generation contracts; no new decision record because this implements already accepted feedback-v2 behavior.

## Validation

- Required commands: targeted core/API/UI/database tests, `npm run test:core`, `npm run typecheck`, `npm run lint`, `npm run check:ci`, `npm run build`, and `npm run verify:agent` where the local environment permits.
- Optional/manual checks: authenticated feedback fixtures at mobile and desktop widths in light/dark and reduced-motion modes.
- Fixtures or regression tests needed: valid full/partial v2, valid legacy, unsupported/malformed completed data, evidence mismatch, score mismatch, low confidence, long content, and every lifecycle state.

## Rollout

- Risk level: high because the change determines whether persisted feedback is presented as trustworthy.
- Backward compatibility: the exact supported legacy tuple remains readable through an explicit historical-feedback view; incompatible completed rows fail closed without scores.
- Metrics/events to watch: frequency of invalid completed read models, feedback recovery attempts, and transcript-evidence navigation failures.
- Follow-up slice: SAV-201/SAV-202 supply deterministic focused-practice recommendations through their existing typed contracts; SAV-200 does not rank or persist recommendations.

## Implementation Evidence

- Implemented on the isolated `codex/sav-200-feedback-presentation-reconvergence` branch from exact `main` head `6d67c66fc30d5853d5564edceb90009c7efa4381`.
- Added a strict provider-independent persisted-feedback presenter, bounded owner-scoped reads, canonical candidate-turn evidence revalidation, explicit supported-v2/supported-legacy/invalid lifecycle variants, and an evidence-first shared review UI.
- Preserved the current SAV-201/SAV-202 focused-practice contracts; this slice neither ranks nor persists recommendations.
- Automated validation passed: targeted core/database/API/UI tests, TypeScript checks, `npm run check:ci`, `npm run build`, and `npm run verify:agent`.
- `npm run verify:agent` reported only four pre-existing lint warnings outside this change. The isolated worktree also lacked local Vercel secrets and the optional Python agent virtual environment, so authenticated browser/provider rehearsal was intentionally not run.
- No provider call, Production data access, migration, feature-flag change, customer-data use, or launch action occurred.
