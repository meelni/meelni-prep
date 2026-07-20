# SAV-277 Focused-Practice Persistence

## Intent

- User request: Complete the standalone focused-practice backend persistence and authenticated API slice.
- Product/user outcome: A signed-in candidate can start, resume, read, and complete one durable five-minute practice attempt derived from owned, completed Feedback v2.
- Why now: SAV-202 needs a privacy-safe durable boundary before the feedback-workspace UI can expose focused practice.

## Slice

- Primary slice: Feedback and evaluation.
- Secondary slices: Database migration, authenticated HTTP APIs, account privacy, and relaunch access control.
- Relevant skills: Feedback evaluation, vertical slice, architecture, engineering memory, PR prep, and Linear workstream.

## Linear Tracking

- Project: Meelni.
- Parent slice: SAV-202.
- Child deliverable: SAV-277.
- Current state: In Progress.

## Scope

- In scope: Canonical migration `0028`, strict Drizzle hydration, atomic owner-scoped create/resume/completion, authenticated no-store routes, relaunch gating, deletion fencing, account export `1.2.0`, deletion cleanup, and database concurrency/privacy rehearsal.
- Out of scope: Feedback-workspace UI, new scoring/model calls, LiveKit, Inngest, credit or analytics mutations, shared-environment migrations, provider actions, relaunch-flag changes, and merging.
- Assumptions: The exact stacked predecessor is PR #359 head `5c76e2449b57ccfbf23b43149526d229a869e32f`; the current contract/template tuple remains v1.

## Product Lens

- Audience: Authenticated PM candidates with completed, grounded Feedback v2.
- Lever: Retention through a concrete next practice step without fabricating a second score or readiness claim.
- Product Compass note: This is focused practice, not a gym or a “rep”; the user-facing experience remains feedback-led and evidence-grounded.

## Technical Plan

- App/API: Add start, read, and complete route handlers that authenticate and gate access before body or database work.
- Workflow/data: Implement the SAV-269 repository port with strict row decoding, source ownership, immutable snapshots, identity locking, deletion fencing, unique create-or-load, and CAS completion.
- Privacy: Add explicit export projection and delete attempts before the source feedback/session graph.
- Operations: Extend the canonical schema fingerprint, rolling preflight, clean/upgrade migration harness, history, and runbooks through `0028`.

## Validation

- Required: Focused-practice workflow/repository/API tests, account export/privacy tests, typecheck, test typecheck, migration docs contract, and disposable PostgreSQL 17 clean/upgrade/rolling/idempotence rehearsal.
- Optional/manual: Preview API rehearsal after the stacked PRs land and an isolated Preview migration is separately authorized.
- Fixtures: Full/partial Feedback v2 sources, owner/cross-owner access, source corruption, replay/conflict, deletion race, immutable snapshot, and concurrent create/complete.

## Rollout

- Risk level: High because this adds durable personal data and authenticated mutation APIs.
- Backward compatibility: Additive schema and routes; account export advances from `1.1.0` to `1.2.0`.
- Metrics/events to watch: None added in this slice; validate server status aggregates without transcript or response text.
- Follow-up slice: SAV-276 feedback-workspace UI and separately authorized Preview rehearsal.
- Migration coordination: `0028_focused_practice_attempts` is generated from exact predecessor `5c76e2449b57ccfbf23b43149526d229a869e32f`; regenerate if PR #359 changes or another migration becomes canonical first.
- Feature flag: Relaunch stays default-off.
