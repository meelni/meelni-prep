# Bound Interviewer Tools To Fresh Session-Local Authority

Date: 2026-08-19
Status: accepted
Issue: SAV-472
Decision owners: engineering contract; Production/default-on remains human-owned

## Context

SAV-466 defined five narrow local interviewer tools and SAV-471 introduced a
deterministic controller, but the runtime deliberately lacked a trusted initial
lifecycle snapshot. Pinned LiveKit Agents 1.6.5 also re-enters the public LLM
node after tool execution on the same speech handle and can forward mixed model
text toward TTS before it awaits the accompanying tools, while SAV-471
generation authority was intentionally single-use. Enabling tools without
resolving these boundaries would either fabricate lifecycle authority, reject
legitimate tool continuation, or make provider compliance the only barrier to
unauthorized pre-tool speech.

## Decision

1. Expose exactly `read_interview_state`, `read_interview_clock`,
   `get_probe_candidates`, `commit_interviewer_move`, and
   `request_graceful_close` through public pinned LiveKit APIs.
2. Keep all tool execution in memory and session-local. The tool adapter has no
   HTTP/database/provider integration.
3. Obtain lifecycle authority reader-first through the existing authenticated
   transcript boundary. Writer registration returns the lifecycle state/version
   read under its session lock; a separate reader verifies the exact room and
   current writer generation before constructing a local four-second lease and
   on every refresh.
4. Never infer `active` from room metadata, provider presence, the model, or a
   tool argument. Initial failure uses the existing interviewer; refresh failure
   invalidates controller/tool authority. Non-active and terminal state cannot
   be reopened within that runtime.
5. Allow bounded same-handle continuation only for an explicit tool-turn
   record. Preserve SAV-471 prompt-led single-use authorization and exact opaque
   per-instance completion acceptance. Continuation never mints a second move
   or generation capability.
6. Let the model propose while controller policy reconstructs, authorizes, and
   records one move. Only acknowledged canonical spoken/delivered transcript
   evidence commits history.
7. Require a tool before enabled-path model speech. Enforce 150 ms tool
   deadlines, three distinct calls per turn, three LiveKit tool steps, no
   recursive/concurrent/repeated calls, and bounded idempotency. The first tool
   failure or continuation overflow admits one deterministic controller fallback
   move, fences later tools, permits one tool-free reply, and then denies later
   re-entry. Strip text from every required-tool provider response before the
   pinned LiveKit text/TTS channels while preserving real tool calls. Reserve
   same-handle admission before queueing so overlapping siblings fail closed,
   then serialize execution and failure-fence publication so either the
   failure/fallback path or committed-move path wins atomically.
8. Record only privacy-safe tool name, outcome, contract version, and latency.
   Do not export arguments, results, transcript/model content, or chain of
   thought.
9. Keep both server flags disabled by default and unchanged in every
   environment. This decision does not authorize rollout, deploy, provider
   mutation, Production action, or launch.

## Consequences

- The normal runtime can acquire real durable lifecycle truth without granting
  a tool direct database authority.
- Writer replacement, lifecycle transition, and stale lease invalidate local
  controller/tool authority while retaining the required base speech fallback.
  Malformed calls, timeout, races, and budget exhaustion reject the attempted
  request and use one move-bound controller fallback while transcript
  persistence, explicit exit, deadline watchdogs, and settlement remain
  independent.
- Mixed provider text cannot become audible before a successful tool-bound
  continuation, and concurrent sibling failures cannot strand an admitted move
  behind a fallback fence.
- Lifecycle reads add bounded background traffic only when the exact controller
  flag and all prerequisite contracts are already valid. The tool surface still
  additionally requires its separate exact flag.
- A reconnecting runtime permanently falls back from controller/tools instead
  of attempting to re-open local speech authority.
- The SAV-467 accepted benchmark artifact remains byte-unchanged; new
  provider-free selection controls prove necessary calls and reject loops.

## Rejected alternatives

### Put lifecycle state in room metadata

Rejected because room metadata is not canonical lifecycle truth and cannot
fence a newer writer or terminal transition.

### Let each tool query the database

Rejected because per-tool remote authority would add latency, failure coupling,
and a privileged surface. A refreshed local lease keeps the tool path bounded.

### Reuse SAV-471 authorization for every same-handle re-entry

Rejected because it would weaken the single-use prompt-led capability. The
explicit tool-mode record is the narrower authorization.

### Commit a move when a tool succeeds

Rejected because generated or unheard output is not candidate-visible fact.
Canonical transcript acknowledgement remains the sole delivery boundary.

## Follow-up

- SAV-473 owns adaptive evidence-isolation fixtures.
- SAV-475 owns any later evidence-based live recommendation.
- SAV-476 retains the human-owned GO/NO-GO decision.
- SAV-465 remains open as the parent workstream.
