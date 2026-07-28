# Interview Room UX Polish

## Intent

- User request: Simplify the live interview room, make the audio visual respond
  to real speech, remove transcript clutter, and present one spoken turn as one
  transcript message.
- Product/user outcome: Candidates can focus on the conversation, understand
  whose turn it is, and scan the transcript without duplicated status copy or
  implementation-facing metadata.
- Why now: The current room repeats state in multiple treatments, under-scales
  LiveKit audio levels, and exposes persisted transcript fragments as separate
  chat messages.

## Slice

- Primary slice: Authenticated interview/session.
- Secondary slices: UI design system and transcript display.
- Relevant skills: `meelni-ui-design-system`,
  `meelni-design-review-orchestrator`, `meelni-livekit-interview-runtime`, and
  `meelni-engineering-memory`.

## Linear Tracking

- Project: Not provided.
- Parent slice issue: None.
- Child deliverable issue: None.
- Current Linear state: Untracked repository request.

## Scope

- In scope: Interview-stage hierarchy, one concise live status, audio-level
  mapping, transcript header copy, timestamp removal, consecutive-speaker
  grouping, and answer-count consistency.
- Out of scope: Transcript persistence contracts, evaluation semantics, agent
  prompts, LiveKit deployment, and public demo behavior.
- Assumptions: Persisted canonical events remain immutable; grouping is a
  presentation concern based on speaker alternation.

## Product Lens

- Audience: PM candidates in an active voice interview.
- Activation/retention/monetization/growth lever: Trust and completion quality.
- Product Compass note: Keep the room calm, stage-first, and interview-focused.

## Technical Plan

- Likely app files: `app/interview/page.tsx` and
  `app/interview/components/*`.
- Likely package/workflow files: None.
- Data or provider dependencies: Existing LiveKit voice-assistant state and
  normalized `useTrackVolume` output.
- Docs/decisions to update: This task intake only; no durable contract changes.

## Validation

- Required commands: Targeted interview UI tests, `npm run typecheck`, and
  `npm run lint`.
- Optional/manual checks: Desktop and mobile interview-room screenshots with
  synthetic room data.
- Fixtures or regression tests needed: Audio-level mapping, transcript
  grouping, timestamp absence, and removal of duplicated stage copy.

## Rollout

- Risk level: Medium; visible live-room behavior changes without persistence
  changes.
- Backward compatibility: Canonical and legacy transcript packets remain
  readable and unmodified.
- Metrics/events to watch: Interview completion, mic toggles, and runtime
  transcript integrity.
- Follow-up slice: Live audio QA in a real Preview room.
