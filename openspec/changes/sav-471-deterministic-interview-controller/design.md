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
5. Pinned LiveKit 1.6.5 emits public `speech_created` synchronously before it
   creates that handle's pipeline task. A bounded per-adapter Python task
   context carries only that candidate identity into the public LLM generation
   boundary, while the adapter records the current internal generation epoch on
   every created handle. Admission advances that epoch. The adapter then
   binds the nonce to the first public `generate_reply` handle in the current
   epoch and requires that exact handle, finalized candidate message ID,
   admitted move identity, and cryptographically random one-time turn nonce
   before projecting monotonic time. Neither a pre-admission handle nor a later
   same-epoch handle can authorize the new nonce even if handed its temporary
   context. The nonce and candidate entry are synchronously consumed together
   before reducer mutation; stale, evicted, duplicate, or replayed attempts are
   denied state-stably.
   The nonce is carried only by the temporary system-message ID. Pinned LiveKit
   serializes that context into its pre-node SDK trace before `llm_node`, so the
   opaque value may appear there. Because pinned `ChatContext.copy()` is
   shallow, denied paths never redact in place. Successful authorization alone
   replaces the nonce-bearing item with an isolated clone in the provider-bound
   copy. The nonce never enters provider input, snapshot/content,
   durable/customer transcripts, or Meelni application logs, and trace access
   after consumption cannot replay it.
   A separate non-evicting session-lifetime ledger remembers up to 1,000
   observed speech-handle identities, so bounded in-flight eviction cannot make
   an old identity admissible again. At capacity, the adapter disables itself
   before accepting another identity and returns generation to the existing
   interviewer path.
   Speech events then advance only lifecycle evidence. The move joins committed
   probe history only after a successful canonical transcript write positively
   correlated through the move, speech handle, assistant item, and event ID.
   An optional post-success interruption-marker observer may upgrade a
   correlated unheard abort, but it cannot settle the queue or session.
6. The pre-deadline closing band or explicit exit may admit a graceful close;
   terminal state follows canonical close delivery. A completed turn that
   projects elapsed, and every already-terminal turn, returns normally from
   `on_user_turn_completed`; an empty result at the public LLM node lets
   LiveKit commit the finalized user item through its normal
   `conversation_item_added` path without model speech. At the deadline the
   controller admits no move and emits no snapshot; the existing watchdog
   fences, settles, and terminates without waiting for model speech. Runtime
   failures disable the adapter for that session and leave the existing
   transcript/deadline/settlement paths running.

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
- Candidate exit intent uses a bounded, anchored stop/end/finish request
  grammar that requires an interview/session target or clear temporal/deictic
  termination context. Bare clauses and ordinary answer content containing
  those verbs do not request an exit; an unambiguous match admits the existing
  graceful close.
- The controller computes time bands. The model never receives instructions to
  estimate elapsed or remaining time.
- A canonically delivered transition at the final objective/topic exhausts the
  catalog. The next move is close even in warning, so the clamped catalog tail
  cannot repeat transitions indefinitely.
- After terminal, recognized shape-valid events at the exact revision return
  the identical state. Transcript persistence remains independently owned.

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
