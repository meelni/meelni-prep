# Design: Controller-Owned Intent, Model-Owned Wording

## Flow

1. The runtime validates room metadata and `InterviewBriefV2` exactly as today.
2. When the exact controller flag is off, no controller is constructed and the
   current `InterviewAgent` behavior is unchanged. The flag alone is
   insufficient: construction also requires an exact durable lifecycle state
   and positive version from a trusted boundary.
3. The current writer-registration boundary returns no lifecycle snapshot. The
   entrypoint therefore passes none and remains fenced to `InterviewAgent` even
   if the flag is set. Provider-free boundary tests supply an explicit fixture
   snapshot; SAV-472 must add the authoritative initial and refresh path before
   runtime use. No live product or provider read is added here.
4. Only `on_user_turn_completed` may admit a next move and produce a bounded
   instruction snapshot. The hook uses the runtime-final LiveKit candidate
   message ID plus its deterministically assigned canonical event identity; it
   does not claim that the later publisher has already persisted the event.
   One pending move blocks a second admission.
5. Speech events advance only lifecycle evidence. The move joins committed
   probe history only after a successful canonical transcript write positively
   correlated through the move, speech handle, assistant item, and event ID.
   An optional post-success interruption-marker observer may upgrade a
   correlated unheard abort, but it cannot settle the queue or session.
6. The pre-deadline closing band or explicit exit may admit a graceful close.
   At the deadline the controller admits no move and emits no snapshot; the
   existing watchdog fences, settles, and terminates without waiting for model
   speech. Runtime failures disable the adapter for that session and leave the
   existing transcript/deadline/settlement paths running.

## Decisions

- The reducer is a provider-free Python domain module. LiveKit objects remain in
  a thin adapter so reducer tests require neither audio nor a provider.
- Controller state has its own internal v1 envelope and projects the already
  accepted `interview-runtime-state.v1` wire. The accepted cross-runtime wire is
  not widened by implementation-only monotonic and pending-move fields.
- `admitted` is the accepted wire name for a planned move. Admission,
  generation, scheduling, and speech do not commit history.
- A compact lifecycle ledger is bounded to the latest 24 moves, while the prompt
  snapshot includes only the latest 8 canonically delivered moves and has a
  fixed byte ceiling.
- Clarification is intentional only when the completed candidate turn supplies
  an ambiguity, silence, repetition, or explicit clarification signal. It is
  recorded separately from ordinary probing so repetition prevention remains
  inspectable.
- The controller computes time bands. The model never receives instructions to
  estimate elapsed or remaining time.

## Compatibility And Rollback

- `MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED` accepts only the exact value `true`
  and otherwise behaves as disabled.
- Missing or invalid brief/deadline inputs, stale state, illegal transition, or
  adapter failure permanently disables controller participation for that
  session and preserves the existing interviewer path. Missing lifecycle
  authority is a deliberate fence, not a fabricated `active`/version-1 value.
- The adapter does not change room metadata, transcript event schemas, deadline
  commands, user-end behavior, reconnect handling, or settlement ownership.
- Disabling the flag is the complete rollback. SAV-475 owns any later live
  recommendation; SAV-476 remains the human-owned launch boundary.
