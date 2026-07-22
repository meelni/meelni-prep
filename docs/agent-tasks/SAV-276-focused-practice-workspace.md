# SAV-276 Agent Task Intake — Focused-Practice Feedback Workspace

## Intent

- User request: Complete the feedback-to-focused-practice workspace that was left after durable persistence/API work.
- Product/user outcome: A signed-in PM candidate can turn completed feedback into one bounded focused-practice attempt, save a self-review, and compare it to the original evidence without starting another interview.
- Why now: SAV-277 delivered the durable authenticated API; SAV-276 exposes the user-facing workflow needed for relaunch readiness.

## Slice

- Primary slice: Feedback and evaluation.
- Secondary slices: Authenticated product UI, accessibility, contract documentation, and relaunch-gated focused practice.
- Relevant skills: Feedback evaluation, UI design system, engineering memory, PR prep, and Linear workstream.

## Linear Tracking

- Project: Meelni.
- Parent slice: SAV-202.
- Child deliverable: SAV-276.
- Current Linear state: In Progress.

## Scope

- In scope: Completed Feedback v2 workspace entry point, start/resume focused practice, bounded revised-answer/reflection entry, practiced-aloud confirmation, terminal self-review comparison, honest unavailable/conflict/error states, no-credit/no-new-score copy, and regression tests for the client API contract.
- Out of scope: Legacy feedback mutation, new model calls, LiveKit rooms, interview credit changes, analytics events, provider actions, production migrations, and relaunch default-on changes.
- Assumptions: The authenticated focused-practice API from SAV-277 is present on `main`; the relaunch access gate remains server-owned and default-off.

## Product Lens

- Audience: Authenticated PM candidates viewing completed, transcript-grounded Feedback v2.
- Activation/retention/monetization/growth lever: Retention through a concrete next practice step after feedback.
- Product Compass note: This is focused practice and self-review, not a gym, rep, second score, or readiness claim.

## Technical Plan

- Likely app files: `components/feedback/feedback-completed-review.tsx`, `components/feedback/focused-practice-workspace.tsx`, `app/feedback/[sessionId]/page.test.tsx`.
- Likely package/workflow files: none; consume the existing `focused-practice-attempt.v1` API contract.
- Data or provider dependencies: Authenticated no-store API only; no direct provider mutation.
- Docs/decisions to update: `docs/contracts/focused-practice-attempts.md`; no new decision record needed.

## Validation

- Required commands: targeted feedback markup/client tests, `npm run typecheck`, `npm run lint`.
- Optional/manual checks: Browser check of completed feedback workspace at mobile and desktop when Preview data is available.
- Fixtures or regression tests needed: Completed feedback start/complete request shape, no fitness wording, no technical metadata leak.

## Rollout

- Risk level: Medium: user-facing UI over an already durable API; no schema or provider mutation in this slice.
- Backward compatibility: Legacy feedback remains historical/read-only. Completed Feedback v2 gains a new focused-practice section.
- Metrics/events to watch: None added in this slice; future analytics must preserve explicit-consent policy.
- Follow-up slice: Preview/manual accessibility evidence and final Linear closure after PR merge.
