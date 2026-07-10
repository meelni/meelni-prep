# SAV-149 Transcript Body Hardening

## Intent

- User request: execute the accepted Meelni relaunch-readiness program.
- Product/user outcome: an interrupted browser or LiveKit shutdown cannot turn
  an empty transcript request into a noisy server exception.
- Why now: this failure was observed during a real local interview shutdown and
  is part of the Wave 1 trustworthy golden path.

## Slice

- Primary slice: transcript ingest request boundary.
- Secondary slices: runtime failure handling and launch operations.
- Relevant skills: LiveKit interview runtime, Linear workstream, PR prep.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-166.
- Child deliverable issue: SAV-149.
- Current Linear state: In Progress.

## Scope

- In scope: regression coverage for empty, truncated, and aborted JSON bodies;
  controlled HTTP 400 behavior; quiet parser failure; contract documentation.
- Out of scope: transcript identity, ordering, batching, persistence, LiveKit
  event shapes, browser retry policy, feedback, and provider configuration.
- Assumption: SAV-194 remains the base transcript-ingest contract and the
  relaunch flag remains default-off.

## Product Lens

- Audience: PM candidates completing a live voice interview.
- Lever: reliability and trust in the post-interview feedback handoff.
- Product Compass note: this is failure containment, not a new user-facing
  capability.

## Technical Plan

- App files: `app/api/session/transcript/route.test.ts`.
- Contract files: `docs/contracts/transcript-events.md`.
- Data/provider dependencies: none; no remote database or LiveKit call.
- Decision record: not needed because persistence semantics do not change.

## Validation

- Required: targeted transcript API test, `npm run test:api`, typecheck, lint,
  `npm run check:ci`, and `npm run build`.
- Manual equivalent: authenticated empty/aborted request returns 400 without an
  `Unexpected end of JSON input` log.
- Regression cases: empty body, truncated JSON, and rejected/aborted body read.

## Rollout

- Risk: low; tests and documentation close an already-implemented fail-closed
  path on the SAV-194 stack.
- Backward compatibility: successful and workflow-level ingest behavior is
  unchanged.
- Metrics/events: existing transcript retry and API error monitoring.
- Follow-up slice: isolated Preview golden-path rehearsal under SAV-186.
