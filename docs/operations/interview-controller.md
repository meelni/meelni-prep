# Deterministic Interview Controller

SAV-471 adds a provider-free interview-intent reducer and a narrow full-
interview runtime adapter. The implementation is repository-only and disabled
by default. It does not activate Director influence, local tools, feedback
changes, provider execution, rollout, or a launch decision.

## Authorities

- The accepted room-metadata deadline and existing monotonic watchdog own time.
- The existing lifecycle workflow and settlement queue own terminal outcome.
- Canonical transcript v2 persistence owns delivered interviewer evidence.
- The controller owns only operational phase, time band, allowed move, compact
  probe ledger, and pre-deadline close intent.
- The model owns natural wording within one admitted move. It never estimates
  remaining time and may ask at most one substantive question per turn.

The elapsed reducer event can abort an undelivered pending move and fence local
controller state. It schedules no speech, emits no prompt snapshot, and never
delays or replaces the existing hard-deadline watchdog.

The adapter observes the monotonic clock again at the public LiveKit LLM node,
before provider generation. Authorization first requires both the finalized
candidate `ChatMessage.id` and the exact `controller:{move_id}` snapshot ID in
the public chat context. LiveKit 1.6.5 creates preemptive messages with distinct
IDs before the finalized hook, so a stale preemptive task is denied without
clock, revision, or move-stage mutation. The matching finalized pipeline may
authorize once. A normal/warning move that has crossed into closing is aborted
and leaves only `close` admissible; a move at elapsed is fenced. A pre-deadline
close may still generate.

Pinned LiveKit 1.6.5 emits the public `speech_created` event synchronously
before it creates that handle's pipeline task. The adapter uses Python task
context to carry the exact candidate handle identity across that public
ordering boundary and stamps each created handle with the current internal
generation epoch. Admission advances the epoch and mints an opaque,
cryptographically random, single-use generation nonce. Authorization requires
the first public `generate_reply` handle bound in that epoch plus the exact
finalized turn, move, and nonce before clock or reducer mutation. A
pre-admission handle and every later same-epoch handle are therefore stale even
if they receive the exact current chat context. An ambient sibling with only
predictable turn/move IDs cannot consume authority.

Pinned LiveKit 1.6.5 `generation.py` serializes the temporary chat context into
`ATTR_CHAT_CTX` immediately before invoking `llm_node`, so that opaque nonce may
appear in the SDK's pre-node trace. There is no await between node entry and
nonce consumption. LiveKit 1.6.5 `ChatContext.copy()` is shallow, so the
adapter never redacts a denied context in place. After successful authorization
only, it replaces the nonce-bearing message with an isolated clone in the
provider-bound copy. The nonce is absent from provider input, controller
snapshots, and message content, is not added to the durable conversation or
customer transcript, and is not written by Meelni application logs. Trace
observation after synchronous consumption cannot replay authority.

Denied, evicted, duplicate, and replayed handles cannot stage or abort the move
and cannot correlate transcript or interruption evidence. Candidate,
authorized, retired, nonce, transcript, and interruption correlation maps are
deterministically bounded. Every public speech-handle identity is also retained
in a separate session-lifetime replay ledger capped at 1,000 entries. In-flight
maps may evict safely because an evicted identity can never re-enter. Reaching
the session cap disables controller authority before accepting another
identity and restores the existing interviewer path; replay history is not
evicted while controller authority remains active.

## Flag and fallback

The flag is `MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED`. Only the exact string
`true` permits adapter construction. Construction additionally requires the
exact durable lifecycle state and positive version from a trusted boundary.
The current writer-registration response supplies only writer generation, so
the entrypoint deliberately passes no lifecycle snapshot and resolves
`lifecycle_snapshot_unavailable`. Consequently, setting the flag alone still
constructs the existing base `InterviewAgent` and creates no controller
snapshot.

This fence is intentional. The reducer never invents `active` or lifecycle
version 1, and the runtime cannot claim or use lifecycle CAS without a trusted
initial snapshot and reconnect/refresh path. SAV-472 owns supplying that
authority before any enabled runtime use; this slice does not change the writer
registration contract to obtain it.

Invalid inputs, stale state, illegal transitions, or any adapter exception
disable controller participation for that session. The base interviewer,
transcript ingest, deadline, reconnect, user-end, and settlement paths continue.
Disabling the flag is the complete rollback.

## Persistence and correlation

At `on_user_turn_completed`, LiveKit has finalized the candidate
`ChatMessage.id`, but the normal `conversation_item_added` publisher has not yet
run. The adapter receives that ID and the canonical `writer_id:message_id` event
identity assigned by the runtime. This is a runtime-final turn revision, not a
claim of durable persistence. The later successful publisher reconciles the
same identity.

Turns that project elapsed and already-terminal turns do not raise
`StopResponse` from this hook: pinned LiveKit Agents 1.6.5 would return before
committing the finalized user item. Instead, the adapter arms a turn-local
suppression identity, changes the temporary context to invalidate preemptive
generation, and returns normally. The public `llm_node` consumes that exact
identity and returns an empty generation. LiveKit then schedules its normal
pipeline, commits/emits the finalized user `ChatMessage` once, and the existing
`conversation_item_added` handler queues it for canonical persistence without
interviewer output. A normal pre-deadline explicit exit still admits one
graceful `candidate_requested_close`; canonical close delivery then makes the
controller terminal. Exit classification is a bounded anchored grammar for
stop/end/finish requests with an explicit interview/session target or clear
temporal/deictic termination context; bare clauses and those words inside
ordinary PM answer content do not trigger close.

An interviewer move commits only in the `TranscriptIngestQueue.publisher`
success callback, after positive move-to-speech-handle-to-assistant-item-to-event
correlation. Unrelated events are ignored. If one handle exposes multiple
assistant message IDs, the first successfully persisted correlated event is the
sole commit and remaining correlations are discarded.

The queue's optional interruption-marker observer also runs only after a
successful response. It accepts only the active writer's interviewer marker
with reason `no_provider_confirmed_prefix`, and can upgrade the correlated move
from aborted to interrupted. Observer failure is non-authoritative: it cannot
change queue settlement.

Once terminal, every recognized shape-valid event with the exact state revision
is an exact controller-state no-op, including clock, writer reconnect,
settlement replay, move stage, transcript evidence, interruption, and candidate
turn events. This prevents late events from rewriting clock, lifecycle, writer,
ledger, or revision while transcript persistence continues independently.

After a canonically delivered transition reaches the final objective/topic,
the catalog is exhausted and the next admitted move is close. Warning policy
does not override this fence.

## Provider-free verification

Run:

```bash
python3 -m unittest agent.test_interview_controller
fnm exec --using=22.22.0 npm run test:python-agent
fnm exec --using=22.22.0 npm run test:agent
fnm exec --using=22.22.0 npm run test:interviewer-benchmark
fnm exec --using=22.22.0 npm run interviewer:benchmark:verify-baseline
fnm exec --using=22.22.0 npm run check
fnm exec --using=22.22.0 npm run verify:agent
```

Every Node command must use the exact `.node-version` runtime, currently
22.22.0. These checks use fixtures and local deterministic code only. Do not
enable the controller or call a model/provider to validate this slice.
