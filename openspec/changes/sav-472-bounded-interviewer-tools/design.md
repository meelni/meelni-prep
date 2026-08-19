# Design: Model Proposes, Controller Authorizes, Transcript Commits

## Flow

1. The runtime validates existing room metadata and registers its transcript
   writer exactly as before. The locked registration receipt includes lifecycle
   state/version, but does not by itself enable tools.
2. The runtime performs a separate authenticated `runtime_lifecycle_read` bound
   to the exact session, room, writer ID, and current writer generation. Only an
   active result creates a four-second local lease and permits controller/tool
   construction. The reader refreshes every second; tools never access it.
3. At a finalized candidate turn, explicit exit and deadline/closing paths keep
   the existing controller-owned close behavior. Otherwise the adapter finalizes
   the turn without admitting a move and mints one opaque tool-turn generation
   capability for the first public speech handle.
4. The LiveKit model may call only the five public tools, and enabled-path model
   generation structurally requires a tool until one move binds the handle.
   Reads project local
   immutable state. Probe lookup returns deterministic IDs. Commit/close rebuild
   the complete move from trusted controller state, serialize mutations under a
   local lock, validate exact revisions/writer/deadline/idempotency, and admit at
   most one pending move.
5. Pinned LiveKit 1.6.5 may re-enter `llm_node` on the same handle after tool
   output. Only the explicit tool-turn record permits three bounded
   continuations. Commit advances the admitted move to generated exactly once;
   continuation cannot mint a second nonce or move capability. The first tool
   failure or overflow admits one deterministic `controller_fallback` move,
   supplies its reduced move instruction, immediately fences later tools,
   grants one tool-free speech fallback, and then denies later re-entry.
6. Public speech completion still requires the exact opaque per-instance
   acceptance returned at `speech_created`. Tool/model activity cannot stage
   evidence. Only acknowledged canonical interviewer transcript evidence may
   commit the move as delivered history.
7. Any initial/refresh lifecycle failure, timeout, unavailable controller,
   malformed call, stale authority, race, or exhausted budget fails closed to
   ordinary speech where safe. Transcript persistence, explicit exit, deadline
   close, watchdogs, room termination, and settlement remain independent.

## Decisions

- The tool adapter imports no LiveKit, HTTP, database, billing, feedback, or
  provider integration. LiveKit remains in the thin entrypoint; lifecycle
  refresh remains outside the tool execution path.
- The lifecycle reader shares the existing HMAC-authenticated internal
  transcript endpoint. A shared session-row lock makes writer registration and
  its initial lifecycle receipt consistent; a reader shared-lock plus current-
  generation check fences replacements.
- A non-active refresh permanently fences controller/tool speech for that
  runtime. Reopening requires a replacement runtime and newer canonical writer,
  not a local active refresh.
- LiveKit and adapter caps are both three. Repeated names and recursion are
  rejected earlier than the SDK cap.
- The SAV-467 accepted baseline and approval artifacts are not rewritten. New
  deterministic cases validate selection and loop absence separately.
- Telemetry is metadata-only: tool name, contract, outcome, latency, and closed
  fallback reason. Arguments, results, content, identity, and reasoning are not
  exported by this adapter.

## Compatibility And Rollback

- Both controller and tool flags require exact `true`; absence remains the
  current prompt-led `InterviewAgent` behavior.
- Active trusted lifecycle is an additional prerequisite, not a flag-derived
  claim. Missing authority cannot enable tools.
- The internal registration response is reader-compatible only within this
  coordinated repository deployment; the Python parser fails closed on older
  responses and writer startup remains pre-output.
- The separate lifecycle read is metadata-only and does not change session or
  writer state.
- Disabling the tool flag restores SAV-471 prompt-led behavior. Disabling the
  controller flag restores the original interviewer. Neither rollback rewrites
  terminal outcomes or evidence.
