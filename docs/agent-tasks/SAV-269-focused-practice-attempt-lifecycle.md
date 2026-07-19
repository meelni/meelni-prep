# SAV-269 Agent Task Intake — Focused-Practice Attempt Lifecycle Phase 2a

## Intent

- User request: Continue the approved relaunch program while launch controls remain off.
- Product/user outcome: A PM candidate can start, resume, and complete one trustworthy focused-practice attempt derived from owned grounded feedback.
- Why now: SAV-202 Phase 1 defines the plan; persistence and UI need a stable lifecycle and repository seam before they can be implemented safely.

## Slice

- Primary slice: feedback and evaluation.
- Secondary slices: core lifecycle contract, authenticated workflow seam, test fixtures, and engineering memory.
- Relevant skills: `meelni-linear-workstream`, `meelni-vertical-slice-playbooks`, `meelni-codebase-architecture`, `meelni-feedback-evaluation`, and `meelni-engineering-memory`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-202.
- Child deliverable issue: SAV-269.
- Current Linear state: In Progress until implementation review and PR evidence are attached.

## Scope

- In scope: versioned pure attempt lifecycle, source/plan/finding snapshots, strict completion parser, non-scored self-review, owner-scoped workflow/repository port, account-deletion fences, concurrency behavior, package exports, fixtures, tests, and contract documentation.
- Out of scope: database schema or migration, Drizzle/RLS adapter, route or API, UI, analytics, provider/model call, LiveKit, Stripe, credits, Inngest, Preview or Production action, and feature-flag change.
- Assumptions: the future repository adapter atomically rechecks source ownership and uniqueness; persisted Feedback v2 is revalidated against canonical evidence before an attempt is created; the client supplies only authenticated source-session identity or a completion response.

## Product Lens

- Audience: PM candidates acting on grounded interview feedback.
- Activation/retention lever: make the next improvement step resumable and concrete without spending another credit.
- Product Compass note: Customer copy uses focused-practice and answer-revision language, never fitness framing, scores, readiness, or hiring predictions.

## Technical Plan

- Likely app files: none in Phase 2a.
- Likely package/workflow files: `packages/core/src/focused-practice-attempt.ts`, strict Feedback v2 reconstruction and recommendation resolution helpers, `lib/workflows/focused-practice-attempt.ts`, and `@meelni/test-fixtures`.
- Data or provider dependencies: none; repository is a port with an in-memory fake only.
- Docs/decisions to update: add the attempt contract, index it, and update the Phase 1 follow-up boundary.

## Validation

- Required commands: targeted lifecycle/workflow/fixture tests, package-entrypoint test, full core/fixture/workflow suites, typechecks, formatting, lint/build checks through `verify:agent`, and independent review.
- Optional/manual checks: none; there is no product surface or provider integration in this slice.
- Fixtures or regression tests needed: all four PM rounds, full and partial evidence, corrupted/legacy/questionless source, account-deletion races, cross-owner non-enumeration, concurrent starts, frozen resumption, exact completion replay, divergent completion conflict, forged input, and provider-free dependency canary.

## Rollout

- Risk level: medium; this is additive and unconnected, but defines a durable lifecycle and trust boundary.
- Backward compatibility: no existing persistence, route, or UI behavior changes; versioned v1 contracts fail closed on drift.
- Metrics/events to watch: none until an authenticated persisted integration exists.
- Follow-up slice: canonical post-0026 migration, Drizzle/RLS repository adapter, deletion/export coverage, and no-store API; feedback-workspace UI follows independently.
