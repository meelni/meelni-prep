# SAV-464 Opik Interview Turn Visibility

## Intent

- User request: Make Opik traces show what the candidate says and the questions
  the interviewer asks, with content retained under Opik's retention policy.
- Product/user outcome: An operator can inspect the ordered conversation on an
  interview trace and the exact candidate/interviewer content on each turn.
- Why now: Production traces exist, but current LiveKit turn naming and trace
  projection make the conversation difficult or impossible to inspect in Opik.

## Slice

- Primary slice: LiveKit interview observability runtime.
- Secondary slices: Opik provider operations and engineering memory.
- Relevant skills: `meelni-livekit-interview-runtime`,
  `meelni-ops-connections`, `meelni-linear-workstream`,
  `meelni-engineering-memory`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-377 (under program SAV-365).
- Child deliverable issue: SAV-464.
- Current Linear state: In Progress.

## Scope

- In scope: Preserve LiveKit 1.6.5 `agent_turn` spans; project allowlisted user,
  transcript, TTS, and interviewer-response text into Opik input/output fields;
  aggregate an ordered conversation onto the `agent_session` span and root
  `job_entrypoint` trace; add content-off and identity-redaction regressions;
  document retention and verification.
- Out of scope: Customer/session correlation identifiers, tool payloads, raw
  errors, Opik retention-plan changes, Production deployment, launch action,
  or retroactive modification of already-ingested traces.
- Assumptions: `OPIK_CAPTURE_CONTENT=true` remains the explicit content gate,
  Production runtime-secret wrappers continue to require it, and Opik applies
  its configured workspace retention after ingestion.

## Product Lens

- Audience: The Meelni owner and engineering operators diagnosing live PM mock
  interview quality.
- Activation/retention/monetization/growth lever: Better interview trace
  evidence shortens diagnosis of poor turn-taking and question quality.
- Product Compass note: This is operator observability for live PM interview
  practice, not an end-user control or a broader product surface.

## Technical Plan

- Likely app files: None.
- Likely package/workflow files: `agent/shared/opik_tracing.py` and
  `agent/test_opik_tracing.py`.
- Data or provider dependencies: LiveKit Agents OpenTelemetry spans and the
  hosted Opik OTLP endpoint; no database or provider writes during local
  implementation.
- Docs/decisions to update: LLM observability contract, Opik operations
  runbook, and this intake. No new decision record or OpenSpec change is needed
  because the owner already accepted content capture under SAV-377.

## Validation

- Required commands: `npm run test:python-agent`, `npm run verify:agent`,
  `npm run check`, and `git diff --check`.
- Optional/manual checks: After merge, perform an owner-authorized Preview and
  then Production interview; verify root and turn input/output fields in Opik
  without copying customer content into evidence.
- Fixtures or regression tests needed: Synthetic paired candidate/interviewer
  turns, cross-batch root aggregation, metadata-only capture, and identity
  redaction.

## Rollout

- Risk level: Medium. Content is already authorized and emitted in content
  mode, but the root aggregation adds bounded in-memory state until a session
  ends.
- Backward compatibility: Metadata-only mode remains content-free; tracing
  remains best-effort and cannot alter interview outcomes.
- Metrics/events to watch: Content-free startup initialization line, Opik
  export failures, root conversation presence, preserved turn spans, and
  identity-field absence.
- Follow-up slice: Owner-authorized Production deployment and one bounded live
  trace verification after the reviewed SHA merges.
