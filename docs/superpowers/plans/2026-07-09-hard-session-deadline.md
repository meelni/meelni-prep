# SAV-189 Hard Session Deadline

## Intent

- User request: complete the stack-ranked Meelni relaunch program while the relaunch feature remains default-off.
- Product/user outcome: every live voice interview ends at the promised server deadline even when the browser is hidden, disconnected, or killed.
- Why now: hard duration promises are launch-critical trust and cost controls.

## Slice

- Primary slice: session duration and hard deadline.
- Secondary slices: lifecycle completion, LiveKit runtime, feedback dispatch, motivation side effects, focused-room UI, Inngest recovery, and operations.
- Relevant skills: LiveKit runtime, vertical-slice playbook, codebase architecture, UI design system, engineering memory, and Linear workstream.

## Linear Tracking

- Project: Meelni Relaunch Readiness.
- Parent slice issue: SAV-189.
- Current Linear state: In Progress until Preview evidence is attached.

## Scope

- In scope: shared duration policy; absolute deadline metadata; exact scheduled enforcement; recovery; acknowledged room deletion; runtime watchdog; join denial at the boundary; client countdown and terminal state; completion parity.
- Out of scope: reconnect-grace policy (SAV-190), transcript late-turn drain policy (SAV-194), and durable credit-ledger transaction redesign.
- Assumptions: supported durations remain 15, 30, and 45 minutes; missing legacy duration normalizes to 30 minutes; the relaunch flag remains default-off.

## Product Lens

- Audience: PM candidates practicing realistic voice interviews.
- Lever: trust and retention; a promised timed interview must end predictably.
- Product Compass note: describe this as live PM interview practice, not a gym or fitness metaphor.

## Technical Plan

- App: start schedules the deadline before returning credentials; Inngest owns exact enforcement and recovery; the client reflects stored truth.
- Packages: core owns duration/deadline arithmetic, agent owns metadata parity, integrations owns acknowledged room termination.
- Runtime: reject already-expired jobs before session start and stop active I/O immediately at the boundary.
- Data: reuse persisted `started_at` plus normalized duration for this staged slice; a future indexed `deadline_at` column may replace the recovery scan.
- Docs: lifecycle, completion, room metadata, UI state, and operations runbook.

## Validation

- Required: typecheck, test typecheck, core, agent, integrations, workflows, API, Python runtime contracts, design guardrails, lint, build, and CI checks.
- Manual: desktop/mobile deadline UI preview; authenticated Preview LiveKit and Inngest rehearsal after environment isolation.
- Regression cases: exact boundary, stale/malformed events, duplicate commands,
  recovery identity, mixed-duration recovery order, room-delete failure with
  deferred dispatch and visibility, acknowledged retry with exactly-once
  dispatch, already-expired runtime, unauthorized validation, and countdown
  clamping.

## Rollout

- Risk: high; it terminates live provider sessions and triggers completion.
- Compatibility: legacy rooms may omit `deadline_at`; new writers always include it. Existing sessions derive the deadline from persisted start and config.
- Watch: deadline lateness, delete failures, recovery count, terminal reason, feedback dispatch, and sessions open beyond deadline.
- Follow-up: Preview rehearsal is blocked until Preview is isolated from Production data and has a valid Inngest event key.
