# Interview Session Lifecycle Contract

Status: canonical contract, persistence/CAS foundation, atomic completion, start-path failure handling, metadata validation, and server/client/voice-runtime hard-deadline enforcement are implemented; Preview rollout evidence remains open

## Purpose

Every client, workflow, background job, and realtime provider must describe an interview with one provider-neutral lifecycle. The contract prevents browser state, provider state, feedback state, and the legacy database `status` column from independently deciding whether the same interview is still running or how it ended.

The TypeScript source of truth is `packages/core/src/session-lifecycle.ts`. Reusable scenarios live in `packages/test-fixtures/src/session-lifecycle.ts`.

## Canonical Record

A lifecycle-aware session exposes these domain facts:

| Field              | Contract                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifecycleState`   | One canonical state from the state machine below.                                                                                                                                   |
| `lifecycleVersion` | Monotonically increasing compare-and-set version. A newly created row starts at `1`; the first accepted transition writes `2`, and every later accepted transition increments once. |
| `terminalReason`   | Required from the accepted transition into `ending` onward; immutable after the first accepted terminal claim.                                                                      |
| `activatedAt`      | Set once when the session first reaches `active`; never cleared.                                                                                                                    |
| `endingAt`         | Set once when the first terminal claim reaches `ending`.                                                                                                                            |
| `endedAt`          | Set once when terminalization reaches `completed`, `abandoned`, or `failed`.                                                                                                        |
| `lastTransitionAt` | Timestamp of the last accepted transition.                                                                                                                                          |
| `runtimeRef`       | Provider-neutral `{ provider, id }` correlation. Provider-specific room fields are adapter compatibility only.                                                                      |

`activatedAt` is historical evidence, not a synonym for the current state. It remains populated during reconnecting, ending, and terminal states.

## States

| State          | Meaning                                                                                                         | Entry owner                                           | Valid exits                        |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------- |
| `created`      | The session identity and user intent exist durably; realtime startup has not begun.                             | Session-start workflow                                | `connecting`, `ending`             |
| `connecting`   | The workflow is provisioning or joining the realtime runtime.                                                   | Session workflow after entitlement and input checks   | `active`, `ending`                 |
| `active`       | The runtime has supplied a normalized ready signal and the interview can produce durable conversation signal.   | Session workflow consuming a provider-adapter signal  | `reconnecting`, `ending`           |
| `reconnecting` | An activated session lost transport and is inside its server-owned reconnect grace period.                      | Session workflow consuming a provider-adapter signal  | `active`, `ending`                 |
| `ending`       | One terminal claim has won; reconnect is closed and final transcript/stat settlement may drain.                 | Session workflow through a versioned terminal command | `completed`, `abandoned`, `failed` |
| `completed`    | A terminal outcome exists for an activated session, except for reasons that always mean abandonment or failure. | Session workflow                                      | None                               |
| `abandoned`    | The session never activated or lacks sufficient durable signal for a completed practice artifact.               | Session workflow                                      | None                               |
| `failed`       | A provider/runtime failure prevented a valid terminal practice outcome.                                         | Session workflow                                      | None                               |

Canonical edges:

```text
created -----> connecting -----> active -----> reconnecting
   |              |               |  ^              |
   |              |               |  +--------------+
   |              |               |
   +--------------+---------------+---------------> ending
                                                     |  |  |
                                                     |  |  +--> failed
                                                     |  +-----> abandoned
                                                     +--------> completed
```

All terminal states are immutable. A delayed ready, reconnect, transcript, deadline, or provider event cannot reopen them.

## Terminal Reasons

New sessions may claim exactly one of these reasons:

| Reason                | Meaning                                                                                   | Derived terminal state                              |
| --------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `user_end`            | The authenticated user explicitly requested the interview to end.                         | `completed` after activation; otherwise `abandoned` |
| `time_limit`          | The server-owned hard deadline expired.                                                   | `completed` after activation; otherwise `abandoned` |
| `disconnect_timeout`  | Transport did not recover before the server-owned reconnect deadline.                     | `completed` after activation; otherwise `abandoned` |
| `provider_failure`    | A normalized runtime/provider failure prevented or terminated the experience.             | Always `failed`                                     |
| `insufficient_signal` | Durable transcript/session evidence is below the minimum needed for a completed artifact. | Always `abandoned`                                  |

`legacy_unknown` exists only for backfilled terminal rows whose historical cause cannot be proved. New commands must reject it.

Terminal state is derived from the reason plus whether the session ever activated. Callers do not choose a contradictory state. In particular, a disconnect timeout after activation remains distinguishable from a normal user end while still allowing downstream transcript policy to decide whether signal is sufficient. If signal is insufficient, the terminal claim must use `insufficient_signal` before it is committed.

## Transition Ownership And Concurrency

The session workflow is the sole writer and arbiter of lifecycle state.

- Browser/UI code submits intent (`start`, `end`, `reconnect`) and renders the stored result. It does not declare terminal truth.
- Realtime provider adapters normalize runtime-ready, transport-lost, transport-restored, and provider-failure signals. They do not write lifecycle rows directly.
- The voice runtime publishes provider-neutral correlation and transcript events. A provider job ending is not itself a session terminal transition.
- The transcript aggregator supplies durable-signal facts before terminalization. It does not reopen a terminal session.
- The deadline worker owns hard-deadline and reconnect-grace commands.
- Feedback generation consumes a terminal session. It must not mark the session completed.
- Billing consumes the immutable terminal outcome to settle a reservation, refund, or credit. It must not infer an outcome from provider or feedback state.

The workflow compares the requested state/reason with the stored outcome, validates the edge, and performs one atomic compare-and-set update against the current lifecycle version. External runtime events carry stable event IDs for deduplication and observability; the lifecycle version remains the write-conflict authority.

1. An equivalent replay returns `idempotent` with the stored state and does not increment the version.
2. The first valid terminal claim moves the row to `ending`, stores its reason, activation fact, and version, and becomes the only outcome allowed to finalize.
   A provider failure before activation is the sole folded case: the workflow
   validates the virtual `connecting → ending → failed` path and persists the
   claim and terminal result in one compare-and-set write because there is no
   transcript or statistics drain to preserve.
3. A concurrent incompatible claim returns `conflict` with the stored winner. It cannot overwrite the reason or terminal state.
4. An invalid edge returns `invalid_transition` and changes nothing.
5. Finalization must derive the terminal state from the stored reason and activation fact; it cannot accept a caller-selected contradiction.

This first-valid-claim rule makes concurrent end, deadline, disconnect, and provider-failure commands converge on one stored outcome.

## Transcript And Feedback Boundary

- Only normalized final transcript events are eligible for durable persistence.
- Realtime data delivery is not durable storage. A transcript turn counts only after authenticated persistence acknowledges it.
- `ending` is the bounded drain phase for accepted transcript writes and statistics. Terminalization uses the durable turns available at that boundary.
- Feedback status (`pending`, `processing`, `completed`, `failed`, `skipped`) is a separate workflow. It never substitutes for session lifecycle state.
- A completed session can have pending or failed feedback. An abandoned session can have skipped feedback. Those combinations are not lifecycle contradictions.
- Transcript ordering and idempotency are governed by the transcript-ingest contract tracked in SAV-194; lifecycle code must not invent a second transcript identity rule.

## Room Metadata And Correlation

Canonical room metadata contract version 1 requires `contract_version: 1` and `session_id`. New SAV-189 writers also supply one canonical UTC `deadline_at`; missing values remain readable only during the staged rollout. The runtime reference, selected question, transcript events, logs, and feedback request must remain correlated to the same session ID.

Room metadata does not own lifecycle state. Provider-native room or participant statuses are adapter inputs only. See [LiveKit Room Metadata And Transcript Contract](./livekit-room-metadata.md).

## Hard Deadline Boundary

The provider-neutral duration/deadline policy lives in
`packages/core/src/session-deadline.ts`. It accepts only 15, 30, or 45 minutes,
uses 30 minutes as the one compatibility default, derives an absolute deadline
from the server-owned start instant, and treats the exact deadline as expired.
Serialized timestamps use canonical millisecond UTC ISO form.

The voice runtime consumes `deadline_at` as a defensive stop boundary. It
rejects already-expired jobs before starting an agent session, closes audio I/O
immediately without draining queued agent speech, and terminates the room once
through the acknowledged room-service API even if duplicate watchdog tasks
fire. A normal early close cancels the pending watchdog. That provider action
prevents listening or speaking past the deadline but does not select or persist
a terminal reason.

The server deadline worker remains the sole owner of the durable `time_limit`
command. It schedules the absolute deadline with a future Inngest event,
attempts room deletion before settlement, and uses separate idempotent
settlement and dispatch boundaries. Terminal truth and completion-time
motivation may commit when deletion fails, but feedback dispatch remains
deferred until deletion is acknowledged as `deleted` or `already_absent`.
Retries preserve the first terminal claim and dispatch at most once. A
five-minute recovery scan prioritizes absolute deadlines and uses a unique
delivery identity per recovery run.

The client countdown reflects this deadline but never claims `time_limit`. At
zero it mutes local input, removes voluntary controls, presents a non-dismissible
saving state, and polls stored terminal truth plus feedback readiness before
navigating to feedback. Direct feedback polling reports `settling`, and direct
retry cannot bypass unacknowledged hard-deadline room cleanup.
The relaunch gate remains off until Preview timing evidence and rollback are
verified.

## Legacy Compatibility And Backfill

The existing database status values remain a temporary read/write compatibility projection:

| Canonical state                                             | Legacy projection |
| ----------------------------------------------------------- | ----------------- |
| `created`, `connecting`, `active`, `reconnecting`, `ending` | `in_progress`     |
| `completed`                                                 | `completed`       |
| `abandoned` + `insufficient_signal`                         | `too_short`       |
| Other `abandoned`                                           | `abandoned`       |
| `failed`                                                    | `error`           |

Backfill rules:

- Preserve a historical terminal status and use `legacy_unknown` when the cause is not provable.
- `too_short` can safely become `abandoned` with `insufficient_signal`.
- Treat an `in_progress` row with only `endedAt` as an ambiguous interrupted
  write: backfill it conservatively to `abandoned` with `legacy_unknown`, never
  to a successful completion.
- Do not invent `activatedAt`, reconnect history, or a provider-failure reason from a legacy `in_progress` row alone.
- Classify recent joinable legacy rows through the compatibility reader during rollout; repair stale `in_progress` rows only with explicit timestamp, transcript, feedback, and deadline evidence.
- Backfill must be forward-only, dry-run counted, repeatable, and idempotent. Record before/after counts by legacy status, canonical state, and terminal reason.
- No new session may emit `legacy_unknown`.

The legacy projection remains until all writers and readers use canonical fields and production comparison shows no divergence for a full observation window.

## Rollout

1. Land the provider-neutral core contract, fixtures, docs, metadata/runtime-event contracts, canonical persistence fields, CAS store, guarded backfill, and legacy projection. This is the SAV-187 foundation.
2. Adopt `created → connecting` and provider-start failure terminalization in the start workflow; authorize join/reconnect from canonical joinable states. This is also part of SAV-187.
3. Dual-write remaining terminal/reconnect paths through the session workflow; shadow-read canonical and legacy projections and emit divergence metrics.
4. Move runtime-ready, reconnect, deadline, explicit end, transcript settlement, feedback, and credit consumers to the workflow in dependency order.
5. Enable transition rejection after preview fixtures and production shadow reads show no unexpected edges.
6. Switch reads to canonical state, retain the legacy projection for rollback, then remove it in a separate migration after the observation window.

Rollback disables canonical reads and transition enforcement while preserving written canonical facts. Rollback must never rewrite terminal outcomes or decrement lifecycle versions.

## Observability

Emit one structured `interview_session_transition` record per command with:

- session ID, command/idempotency key, lifecycle version, from/to state, terminal reason, activation flag;
- signal source, normalized signal, transition owner, outcome (`accepted`, `idempotent`, `conflict`, or `rejected`);
- runtime provider plus opaque runtime ID, timestamps, elapsed time in prior state, and safe error code;
- no room token, provider secret, transcript text, email, or other customer content.

Monitor:

- transition counts and latency by edge;
- invalid-transition and version-conflict rate;
- sessions stuck in `created`, `connecting`, `reconnecting`, or `ending` beyond their deadlines;
- start-to-active latency, reconnect recovery rate, and reconnect timeout rate;
- terminal outcomes by state and reason;
- canonical/legacy projection divergence;
- feedback or credit workflows attempting to mutate lifecycle state.

## Dependencies

- SAV-188: atomic, idempotent end-session workflow.
- SAV-189: server-owned hard session deadline.
- SAV-190: disconnect and reconnect state handling.
- SAV-191: credit settlement from terminal outcomes.
- SAV-194: transcript ownership, ordering, and idempotency.
- SAV-176: feature-flag activation and rollback rehearsal consumes lifecycle readiness evidence.

## Non-goals

- Redesigning the interview room UI or product positioning.
- Choosing or exposing realtime/STT/LLM/TTS providers.
- Defining feedback rubric thresholds or credit refund policy.
- Replacing transcript-ingest identity and ordering rules.
- Reconstructing unverifiable historical provider events.
- Treating a provider disconnect, background-job result, or browser navigation as terminal truth by itself.

## Verification Matrix

| Scenario                          | Expected path                                                     | Required evidence                                            |
| --------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Normal completion                 | `created → connecting → active → ending → completed (user_end)`   | Core transition test, workflow test, lifecycle fixture       |
| Provider start failure            | `created → connecting → ending → failed (provider_failure)`       | Adapter-normalization test, workflow test, lifecycle fixture |
| User ends before activation       | `created/connecting → ending → abandoned (user_end)`              | Workflow test and credit-settlement assertion                |
| Insufficient durable signal       | `active → ending → abandoned (insufficient_signal)`               | Transcript fixture, validator/workflow test                  |
| Reconnect succeeds                | `active → reconnecting → active`                                  | Reconnect fixture and deadline-cancel assertion              |
| Reconnect expires                 | `active → reconnecting → ending → completed (disconnect_timeout)` | Server-deadline test and lifecycle fixture                   |
| Hard deadline                     | `active → ending → completed (time_limit)`                        | Fake-clock workflow test and lifecycle fixture               |
| Duplicate command                 | No second transition or version increment                         | Idempotency test                                             |
| Concurrent terminal commands      | First valid claim retained; loser returns `conflict`              | Transaction race test and lifecycle fixture                  |
| Delayed event after terminal      | Terminal-to-nonterminal edge rejected                             | Exhaustive transition test and invalid fixture               |
| Legacy backfill                   | Counts preserved; projection agrees; rerun is a no-op             | Migration dry run, clean/legacy migration tests              |
| Feedback failure after completion | Session remains terminal and unchanged                            | Feedback workflow regression test                            |

The relaunch gate remains off until SAV-187 passes its integrated checks and the downstream end, deadline, reconnect, credit, transcript, and launch-rehearsal tickets supply their workflow and manual evidence. A merged contract and migration do not by themselves prove production adoption.
