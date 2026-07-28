# SAV-367 interview end resilience

## Intent

- User request: Deeply audit and fix live interview start, turn-taking, and exit failures, especially explicit End Interview.
- Product/user outcome: A candidate can end once from any runtime state and is never trapped in the room by a missing voice-runtime acknowledgment.
- Why now: Production sessions with audible turns are returning settlement timeouts and cannot complete.

## Slice

- Primary slice: Interview/session lifecycle.
- Secondary slices: Transcript integrity, feedback eligibility, LiveKit runtime, interview UI.
- Relevant skills: LiveKit interview runtime, codebase architecture, vertical-slice playbooks, feedback evaluation, Linear workstream, engineering memory.

## Linear tracking

- Project: Meelni.
- Parent slice issue: SAV-365.
- Child deliverable issue: SAV-367.
- Current Linear state: In Progress.

## Scope

- In scope:
  - One authenticated, idempotent End Interview command.
  - A bounded, best-effort server request for voice-runtime settlement.
  - Durable terminalization when the agent is absent, reconnecting, slow, or cannot acknowledge.
  - Fail-closed feedback eligibility when writer evidence is missing or degraded.
  - Browser end intent that freezes new transcript display during the terminal handoff.
  - Regression coverage for early exit, in-flight runtime work, timeout, provider failure, duplicate end, and terminal replay.
- Out of scope:
  - Lifecycle activation repair (SAV-366).
  - Opening/barge-in changes (SAV-368).
  - VAD/endpointing tuning (SAV-369).
  - Full runtime release telemetry (SAV-370).
- Assumptions:
  - The existing database finalizer remains the source of terminal truth.
  - Missing settlement evidence must skip feedback rather than fabricate completeness.
  - Room cleanup and feedback dispatch remain recoverable side effects after terminal truth commits.

## Product lens

- Audience: Candidates using authenticated PM mock interviews.
- Lever: Activation and retention through reliable completion and trustworthy feedback.
- Product Compass note: Reliability and honest evidence take priority over squeezing feedback from an incomplete transcript.

## Technical plan

- App files: `app/interview/page.tsx`, `app/api/interview/end/route.ts`.
- Workflow files: a server-owned explicit-end orchestration workflow plus existing runtime-settlement and completion workflows.
- Data/provider dependencies: Supabase session ownership, LiveKit room data, writer settlement rows, durable feedback/credit stores.
- Docs/decisions: OpenSpec change under `openspec/changes/sav-367-interview-end-resilience/`; lifecycle contract clarification.

## Validation

- Required commands:
  - Focused workflow, route, and UI-helper tests.
  - Python runtime contract tests if the runtime protocol changes.
  - `npm run typecheck`.
  - Targeted lint/build checks in proportion to the touched surface.
- Manual checks:
  - End before the agent speaks.
  - End while the candidate speaks.
  - End while the interviewer speaks or the model is thinking.
  - End during reconnect.
  - Repeat End after terminalization.
- Regression fixtures:
  - Settlement success, timeout, provider unavailable, missing writer, degraded writer, and already-terminal session.

## Rollout

- Risk level: High; terminal lifecycle and feedback eligibility are affected.
- Backward compatibility: Existing runtime settlement endpoint remains readable during rollout, but the browser no longer depends on it.
- Metrics/events: End latency, best-effort settlement outcome, terminal state, feedback skipped reason, cleanup deferral.
- Follow-up slice: SAV-370 runtime release identity and settlement-stage telemetry.
