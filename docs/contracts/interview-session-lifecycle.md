# Interview Session Lifecycle Contract

Status: canonical contract, persistence/CAS foundation, atomic completion, start-path failure handling, metadata validation, hard-deadline enforcement, and reconnect recovery are implemented; Preview rollout evidence remains open

## Purpose

Every client, workflow, background job, and realtime provider must describe an interview with one provider-neutral lifecycle. The contract prevents browser state, provider state, feedback state, and the legacy database `status` column from independently deciding whether the same interview is still running or how it ended.

The TypeScript source of truth is `packages/core/src/session-lifecycle.ts`. Reusable scenarios live in `packages/test-fixtures/src/session-lifecycle.ts`.

## Canonical Record

A lifecycle-aware session exposes these domain facts:

| Field                                                                      | Contract                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lifecycleState`                                                           | One canonical state from the state machine below.                                                                                                                                                                                                                                    |
| `lifecycleVersion`                                                         | Monotonically increasing compare-and-set version. A newly created row starts at `1`; the first accepted transition writes `2`, and every later accepted transition increments once.                                                                                                  |
| `terminalReason`                                                           | Required from the accepted transition into `ending` onward. A reconnect timeout's provisional `disconnect_timeout` may refine once to `insufficient_signal` by prior-reason/version CAS before terminalization; every other accepted reason and all terminal outcomes are immutable. |
| `activatedAt`                                                              | Set once when the session first reaches `active`; never cleared.                                                                                                                                                                                                                     |
| `endingAt`                                                                 | Set once when the first terminal claim reaches `ending`.                                                                                                                                                                                                                             |
| `endedAt`                                                                  | Set once when terminalization reaches `completed`, `abandoned`, or `failed`.                                                                                                                                                                                                         |
| `lastTransitionAt`                                                         | Timestamp of the last accepted transition.                                                                                                                                                                                                                                           |
| `reconnectDeadlineAt` / `reconnectDeadlineOwner`                           | Immutable effective cutoff for the accepted reconnect generation, equal to the earlier of grace expiry and the hard deadline. The owner records `reconnect_grace` or `hard_deadline`; both fields are cleared together on recovery or terminal settlement.                           |
| `runtimeReadyAt`                                                           | First signed provider evidence that the dispatched interviewer runtime is active. Initial activation also requires current candidate presence.                                                                                                                                       |
| `roomCleanupPending`                                                       | Durable provider-cleanup intent set by terminal settlement when a room exists; cleared only after idempotent room deletion succeeds.                                                                                                                                                 |
| `roomCleanupAttemptedAt`                                                   | Shared recovery fairness cursor updated before every cleanup, provisioning, or failed-credit settlement attempt so a poison row cannot starve older or never-attempted work, including credit-only recovery.                                                                         |
| `roomProvisioningPending` / `roomProvisioningStartedAt`                    | Pre-provider crash-recovery lease established from PostgreSQL's clock by the `created → connecting` CAS when a room name exists. It remains independently scannable until full startup commits or teardown and failed-credit settlement are both acknowledged.                       |
| `presenceReconciledAt`                                                     | Fairness cursor for authoritative participant-list reconciliation. It is not transport-event ordering evidence and never changes lifecycle state by itself.                                                                                                                          |
| `lastTransportEventAt` / `lastTransportEventId` / `lastTransportEventName` | Signed candidate-presence ordering and replay evidence. These values never replace the lifecycle version as the write-conflict authority.                                                                                                                                            |
| `runtimeRef`                                                               | Provider-neutral `{ provider, id }` correlation. Provider-specific room fields are adapter compatibility only.                                                                                                                                                                       |

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
reads PostgreSQL time, resolves the existing durable-signal validation, and
first claims `ending` with `time_limit` or `insufficient_signal` through one
state/version compare-and-set that also proves the event's exact derived
deadline is due according to `clock_timestamp()`. That same claim persists the
independent room-cleanup state as `pending` before any provider call. Only that
claim owner or an idempotent retry of the stored outcome may settle terminal
truth and attempt room deletion.
If a delivery arrives before PostgreSQL says it is due, the worker
creates a distinct durable retry at the unchanged canonical deadline before it
returns `not_due`. The idempotent completion workflow then settles terminal
truth before provider deletion and owns feedback intent, streaks, and
completion-time achievements. Validation may refine lifecycle truth to
`insufficient_signal` without erasing the cleanup claim. A concurrent ordinary
end never creates the claim and cannot erase one already owned by the deadline
worker. Provider acknowledgement changes it to `deleted` or `already_absent`;
the central outbox cannot claim feedback while cleanup remains pending. Only
then can the client hand off. Retries preserve the first terminal claim and
dispatch at most once. A five-minute recovery query uses PostgreSQL time to
prioritize and order overdue open sessions, terminal pending-cleanup claims,
and acknowledged deadline-owned sessions whose eligible feedback outbox
remains retryable. Recovery never repeats room deletion after acknowledgement
and uses a unique delivery identity per recovery run.

The client countdown reflects this deadline but never claims `time_limit`. At
zero it mutes local input, removes voluntary controls, presents a non-dismissible
saving state, and polls stored terminal truth plus feedback readiness before
navigating to feedback. Direct feedback polling reports `settling` until room
cleanup is acknowledged. After acknowledgement, polling exposes the durable
dispatch state and direct retry uses the same idempotent outbox claim as
scheduled recovery; it cannot bypass unacknowledged hard-deadline room cleanup.
The relaunch gate remains off until Preview timing evidence and rollback are
verified.

## Reconnect Boundary

The provider-neutral policy lives in `packages/core/src/session-reconnect.ts`.
An activated session receives one fixed 30-second reconnect grace period per
accepted loss generation. Duplicate loss delivery does not extend the stored
deadline. The hard session deadline keeps priority when it is earlier than or
equal to the potential reconnect deadline, and reconnect never pauses or
restarts the interview clock.

LiveKit room retention is 60 seconds, while the Python agent uses
`RoomOptions(close_on_disconnect=False)`, so a browser reload can rejoin the
same room and agent job. Signed `participant_joined`, `participant_left`, and
`participant_connection_aborted` webhooks are normalized before the session
workflow sees them. A connecting room activates only after both a distinct
LiveKit agent-kind receipt and the exact standard-participant candidate identity
are joined; one identity cannot satisfy both receipts. The authenticated Room
Service participant list may repair a missing initial webhook only while both
participants are in joined/active provider state. A merely joining participant,
arbitrary standard participant, an agent
using the candidate identity, and stale/reordered presence never activate;
candidate loss moves an active session to reconnecting, and candidate rejoin
recovers it. Candidate observations persist their ordering watermark even when
they do not change lifecycle state, preventing delayed loss delivery from
overriding a later join.

The accepted reconnecting lifecycle version is the generation fence. Every
accepted loss persists the effective cutoff and its owner, including a loss in
the final 30 seconds. Only a grace-owned cutoff schedules reconnect enforcement;
the hard-deadline worker retains termination ownership when the hard deadline
wins. The grace event carries the version and exact stored cutoff. At expiry the
worker first checks authoritative candidate presence. Only provider state
`JOINED` or `ACTIVE` with a finite provider `joinedAt` strictly before the
stored cutoff may repair a missed join through the same
lifecycle-version, deadline, and timestamp compare-and-set;
the database clock must also still be strictly before the cutoff. Equality is
expired. Fresh token issuance, signed join recovery, presence repair, and the
timeout claim all use PostgreSQL time as the authorization clock, so an
application host's slow, fast, or rolled-back clock cannot extend access.
provider read failure leaves the session reconnecting for retry. Confirmed
absence allows the worker to atomically claim provisional
`ending (disconnect_timeout)` only while all three facts still match. The claim
is followed by candidate-token revocation, room deletion, and a bounded
two-second transcript drain. One durable validation snapshot both selects any
reason refinement and drives finalization; completion does not revalidate that
snapshot. Before terminalization, insufficient durable
signal may refine that provisional reason exactly once through a compare-and-set
that also matches the prior `disconnect_timeout` reason and lifecycle version.
It can never refine `insufficient_signal` back to `disconnect_timeout`.
Concurrent retries with divergent validation therefore preserve whichever
completed or abandoned terminal settlement commits first.
A restored session, later disconnect generation, user end, or hard deadline
makes the old event stale before any room deletion. Inngest sleeps to the exact
deadline, and a five-minute recovery scan re-emits distinct deliveries for
missing schedules or already-claimed retries. The reconnect deadline remains
durable schedule evidence after terminal settlement; room cleanup has its own
explicit pending marker and fair retry cursor, so recovery continues after
provider retries are exhausted.

LiveKit webhooks are best-effort delivery. A bounded one-minute recovery scan
lists provider participants for connecting, active, and reconnecting voice
sessions, with never-checked and least-recently-checked sessions first. For a
connecting room it repairs a missing candidate receipt, agent receipt, or both
only when the exact candidate and a distinct agent-kind participant are both
currently present. Confirmed absence from an active room synthesizes one
ordered candidate-loss observation; confirmed presence in reconnecting repairs
a missed join by version/deadline CAS. A stale scan cannot overwrite a newer
lifecycle version, and a provider read failure never invents absence.

Before any provider call, the adapter signs the participant token so signing
failure cannot leave a room or dispatch behind. The `created → connecting` CAS
also establishes a PostgreSQL-clock provisioning lease and room-cleanup intent before
room creation. Any later provider exception is treated as potentially
provisioned. An atomic provider-start failure sets `failed`,
`provider_failure`, and cleanup intent before immediate teardown. This includes
a partial room-create/agent-dispatch failure and later deadline-schedule or
credit-consume failure. Immediate cleanup clears intent only after LiveKit
confirms revocation and deletion or absence. Failed-start credit settlement
releases an active reservation or refunds an ambiguously consumed reservation
with deterministic idempotency keys.
User end attempts cleanup immediately but still returns committed terminal
truth if the provider is unavailable. Hard-deadline and reconnect workers clear
the same marker after acknowledged deletion. Cleanup removes the candidate with
an explicit token-revocation timestamp before deleting the room; room absence
is idempotent success. A five-minute terminal-room recovery scan fans each
pending row into an independently retryable event and prioritizes never-tried,
then least-recently-tried cleanup, provisioning, and credit-only work,
preventing one poison row from starving peers
or a retained agent or issued token from surviving an exhausted retry window.
A connecting provisioning lease becomes claimable after five minutes through
state, lifecycle-version, lease-timestamp, and a PostgreSQL-clock age fence. The recovery worker
then terminalizes it, retries provider teardown, settles credit idempotently,
and clears each durable marker only after its corresponding acknowledgement.

Browser history contains only `sessionId`. Reload requests a fresh short-lived
participant token from the owned session; it never creates a room, redispatches
the agent, or consumes another credit. Transcript ingest remains independently
governed by SAV-194 and must be complete before reconnect readiness is closed.
The token adapter converts the database-observed authorization window to an
absolute whole-second target, adjusts the provider SDK's relative TTL for the
signer clock, decodes the signed JWT, and returns its actual `exp` to the join
workflow. After signing, the workflow reads the session and PostgreSQL clock a
second time and withholds the credential unless `exp` is strictly later than
that snapshot and no later than the whole-second floor of the unchanged earlier
reconnect or hard deadline. A slow, fast, or delayed signer cannot extend or
return an already-expired credential.

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
