# SAV-197 Feedback Workflow

## Intent

- User request: make feedback generation reliable under retries, replay, and concurrent delivery.
- Product/user outcome: every eligible completed interview produces at most one durable feedback result without stale overwrites or duplicate insights.
- Why now: relaunch readiness requires a recoverable evaluation path before the feature flag becomes default-on.

## Slice

- Primary slice: feedback and evaluation.
- Secondary slices: interview completion, Inngest dispatch, authenticated feedback API.
- Relevant skills: `meelni-feedback-evaluation`, `meelni-vertical-slice-playbooks`, `meelni-linear-workstream`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-168.
- Child deliverable issue: SAV-197.
- Current Linear state: In Progress pending independent audit and PR preparation.

## Scope

- In scope: one state machine, atomic claim and terminal CAS, event fencing, retry leases, thin adapters, retired writer removal, fixtures, contracts, adversarial tests.
- Out of scope: schema changes, provider configuration, remote database mutation, launch-flag rollout.
- Assumptions: existing dispatch and feedback columns are sufficient.

## Technical Plan

- App files: authenticated feedback polling and recovery route.
- Workflow files: generation orchestration, recovery orchestration, Inngest adapter.
- Data dependencies: existing feedback row and dispatch outbox fields.
- Docs: this intake and `docs/contracts/feedback-generation.md`.

## Validation

- Required commands: typecheck, test typecheck, workflow/API/fixture tests, `npm run check:ci`, and `npm run build`.
- Fixtures: stable initial/retry event identities and lease timestamps.
- Regression focus: concurrent claims, stale completion/failure, immutable terminal replay, owner/event mismatch, failed and stale recovery, one-time insights.

## Rollout

- Risk level: high because this controls post-interview value delivery.
- Backward compatibility: read compatibility retained; retired write routes remain `410 Gone`.
- Metrics/events to watch: generation failures, expired leases, retry dispatches, feedback completion, insight update requests.
- Follow-up slice: independent audit, PR preparation, then launch-flag readiness review.
