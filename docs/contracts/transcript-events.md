# Transcript Event Contract

Status: version 2 canonical writer contract; version 1 read compatibility retained for rolling deployment

## Purpose

Every finalized interview turn must be uniquely addressable, ordered within its
runtime, correlated to the durable session and provider room, and backed by
measured timing. `packages/agent/src/transcript-events.ts` is the TypeScript
source of truth. `agent/shared/transcript_events.py` emits the same wire shape.

The Python runtime persists each event through the signed internal ingest route
before publishing it on LiveKit data topic `transcript`. A browser packet is
therefore a display notification, never the durability or trust boundary.

## Version 2

Canonical writers publish this shape:

```json
{
  "contract_version": 2,
  "event_id": "writer-instance-id:livekit-message-id",
  "writer_id": "writer-instance-id",
  "writer_generation": 2,
  "sequence": 7,
  "session_id": "durable-session-id",
  "room_name": "interview-runtime-room",
  "speaker": "user",
  "text": "I would begin by clarifying the goal.",
  "is_final": true,
  "started_at": "2026-07-10T05:00:00.000Z",
  "ended_at": "2026-07-10T05:00:04.250Z",
  "audio_duration_ms": 4250,
  "section": "product_sense",
  "delivery_state": "delivered"
}
```

| Field                      | Rule                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract_version`         | Exactly `2` for canonical writers.                                                                                                            |
| `event_id`                 | Non-empty opaque identity generated once for the event. Replays retain the exact value; consumers do not normalize or parse it.               |
| `writer_id`                | Non-empty identity for one agent job/writer instance. A replacement writer in the same room receives a new ID.                                |
| `writer_generation`        | Positive generation assigned by durable writer registration before the runtime can produce audible output.                                    |
| `sequence`                 | Positive safe integer from one writer-scoped namespace shared by turns and integrity markers. A stable event replay retains its assignment.   |
| `session_id` / `room_name` | Both required. The durable session ID comes from validated room metadata; the room name comes from the runtime.                               |
| `speaker`                  | `user` or `interviewer`.                                                                                                                      |
| `text` / `is_final`        | Text is non-empty and finalized. Partial STT hypotheses are not canonical events.                                                             |
| `started_at` / `ended_at`  | Canonical UTC ISO-8601 timestamps with exactly millisecond precision and `ended_at` strictly after `started_at`.                              |
| `audio_duration_ms`        | Positive safe integer duration equal to the timestamp interval within one millisecond. Zero, fractional, and estimated values are invalid.    |
| `section`                  | Non-empty durable section label. Until fine-grained section tracking lands, the runtime uses the interview round type; it never sends `null`. |
| `delivery_state`           | `delivered` or `partially_delivered`. Fully unheard generated speech is not a transcript turn.                                                |

The Python writer consumes committed LiveKit conversation items and
uses their runtime-measured `started_speaking_at` and `stopped_speaking_at`
metrics. LiveKit Agents 1.6.5 truncates an interrupted interviewer message to
the TTS-synchronized prefix that was actually played. That prefix is persisted
as `partially_delivered`; generated continuation is never stored.

When scheduled interviewer output is interrupted after entering the playout
schedule but has no provider-confirmed text—or a committed measured user or
interviewer turn cannot be normalized to canonical evidence—the runtime
persists a separate `integrity_unavailable` marker. Unscheduled speculative
generation and unmeasured user hypotheses are not audible evidence and do not
create markers. A marker contains
correlation, writer generation, identity, speaker, reason, and occurrence time but no `text`
field. Markers live outside `transcript_turn` and are never rendered or passed
to evaluation. Candidate markers and every `canonicalization_failed` marker
make the session ineligible. The exact
`interviewer/no_provider_confirmed_prefix` marker preserves independently
trustworthy candidate evidence, but the frozen snapshot restricts any resulting
feedback to qualitative-only mode.

Turns and markers do not own independent counters. The runtime allocates both
from one monotonic namespace per writer and remembers the assignment by stable
event identity and event kind. Replaying the same identity and kind reuses the
same sequence. Reusing an identity across kinds fails closed. This prevents a
turn followed by the first marker from both claiming sequence `1`, while
preserving the existing global event-ID idempotency boundary.

Before producing any audible output, each runtime durably registers a
metadata-only `runtime_writer_registration`. Registration is idempotent for the
same `(session_id, room_name, writer_id)` and returns a positive
`writer_generation`. A replacement runtime receives a later generation, which
fences the prior generation from distinct new writes without erasing that
prior writer's settlement obligation. Every turn, marker, settlement, and
targeted reconnect-settlement request carries the registered generation.

At an explicit end or semantic cutoff `D`, the runtime first disables audio
input and output at `D`, installs the immutable evidence cutoff synchronously,
force-interrupts current and queued generation, commits only measured evidence
whose event time is at or before `D`, and drains the signed
outbox. Each writer persists its own metadata-only `runtime_settlement` at its
semantic drain boundary: the active ending generation uses `D`, while a fenced
generation may retain its earlier reconnect/handoff cutoff. Database creation
time records later operational arrival separately. In the same transaction as
each canonical turn or marker, the database records the highest observed
sequence and the highest contiguous committed sequence for that writer.
Out-of-order delivery may temporarily create a gap; the committed watermark
does not cross it, and arrival of the missing sequence converges the already
stored suffix. A candidate marker or any `canonicalization_failed` marker
permanently degrades the writer. The exact
`interviewer/no_provider_confirmed_prefix` marker advances the shared sequence
but preserves writer integrity because it contains no candidate evidence. A
`settled` assertion is rejected while the registered writer has a gap or
degraded watermark.

Terminal completion freezes the per-writer committed boundaries and the
terminal cutoff. Complete evidence requires every registered generation to
have durable `settled` proof and no integrity fault. Missing settlement can
produce partial feedback only when the frozen database prefix is healthy,
gap-free, and independently satisfies the reviewable-evidence boundary. A gap,
degrading marker, degraded settlement, or malformed boundary fails closed.
Settlement seals that generation: exact replays remain idempotent, but distinct
new turns or markers from it are rejected.

## Durable Runtime-Settlement Command

Accepting explicit End atomically creates one
`transcript_runtime_settlement_command` for the accepted lifecycle version when
a registered writer exists. Contract version 1 copies the immutable cutoff,
room, writer ID, and writer generation, assigns the deterministic identity
`runtime-settlement:<session_id>:<lifecycle_version>`, and records a bounded
expiry. The command is service-only state; the browser cannot read or mutate
it.

The runtime uses the existing timestamped HMAC `/api/internal/transcript`
boundary for strict metadata-only `runtime_settlement_command_pull` and
`runtime_settlement_command_ack` messages. Pull requires the exact session,
room, writer ID, and generation. Ack additionally requires the command ID and
`settled` or `degraded` outcome, and the database accepts it only after the
matching `runtime_settlement` row exists with that outcome. Equivalent replays
return the existing acknowledgement. Unknown versions, stale generations,
identity drift, outcome conflicts, expiry, and late acknowledgements fail
closed.

The LiveKit `runtime_settlement_request` packet remains version-1 compatible,
but its request identity and cutoff are derived from the durable command. It is
only a wake-up hint. The Python writer pulls on that hint, exact candidate
disconnect, and shutdown. A rolling-deployment writer that only persists the
legacy settlement still converges because the matching settlement insert
atomically acknowledges its pending command. A command left pending at the
bounded finalizer deadline becomes terminal `expired`; frozen database
watermarks then classify evidence without manufacturing settled proof.

Consumers deduplicate globally by `event_id`. They order events from one writer
generation by `sequence`; overlapping user and interviewer speech may have
non-monotonic start times without violating that sequence. Disjoint reversed
intervals remain invalid. Across replacement writers they order by measured
`started_at`, then `writer_generation`, `writer_id`, and `sequence` as
deterministic tie-breakers. A sequence value without its generation and
`writer_id` has no ordering meaning.

## Compatibility

The unversioned legacy packet is called version 1 for rollout purposes:

```json
{
  "speaker": "user",
  "text": "Legacy finalized text",
  "timestamp": 1782600000,
  "is_final": true
}
```

The TypeScript adapter can identify this shape during a rolling web/agent
deployment. It does not manufacture `event_id`, sequence, duration, section,
or delivery state. The browser may keep the old timestamp only as a display
timestamp; it leaves measured start/end, duration, and section absent when
rendering and does not persist the legacy packet because the current database
requires a measured start time. New writers must never emit this shape.
Unsupported explicit versions and malformed packets fail closed.

Version 1 read support can be removed only after deployed agents all emit
version 2 and the observation window reports no legacy packets. Version 2 is
additive at the transport boundary; SAV-194 adds nullable canonical persistence
columns so historical rows remain readable.

## Rollout And Verification

1. Deploy a web reader that accepts version 2 and identifies legacy packets.
2. Deploy the version 2 Python writer.
3. Run the shared golden valid/invalid fixture through TypeScript and Python,
   including canonical timestamps, integer bounds, timing, and delivery state.
4. Observe legacy-packet and invalid-packet logs before removing compatibility.
5. Verify completed speech, mid-sentence interruption, and zero-prefix
   interruption against the pinned runtime contract.

The public relaunch gate remains off until the downstream transcript privacy,
ingest, evaluation, and launch-rehearsal slices pass.

## Durable Ingest

Version 2 is the only durable turn writer shape. The runtime sends the exact
canonical body to `/api/internal/transcript`, signed with a timestamped,
domain-separated HMAC derived from the shared server-only LiveKit secret. The
route validates the signature before parsing, requires
`event.session_id === sessionId`, and verifies the stored provider room inside
the database transaction. The candidate browser has no transcript-write API.

`event_id` is globally unique. An equivalent replay returns the existing row;
reusing the identity with different content fails closed. `(session_id,
writer_id, sequence)` remains unique and the registered
`(session_id, writer_generation, writer_id)` foreign key binds evidence to its
durable writer generation. A session accepts at most 1,000 durable turns. Legacy rows keep all
canonical identity fields null. Canonical rows
require the entire version 2 identity/timing tuple and are immutable through
the legacy correction helpers.

The endpoint accepts only bounded JSON request bodies. Canonical measured time
must remain within the server-owned interval from the stored session start
through its absolute hard deadline. Operational failures log only a fixed code;
database errors and transcript content are never written to server logs.

An empty or truncated signed body is an invalid runtime transcript payload. An
aborted body read is unreadable and receives the same fail-closed HTTP 400
boundary. None of these cases invokes durable ingest or logs parser errors or
partial transcript content. Unsupported media types, oversized bodies, and
invalid service authentication retain their distinct 415, 413, and 401/503
responses.

Within one writer, measured start times must remain monotonic with sequence.
The ingest transaction rejects an inversion. Readers therefore order by
`started_at`, then `writer_generation`, `writer_id`, `sequence`, `event_id`, and
row ID. Generation precedes writer identity so same-millisecond turns from
replacement runtimes remain in durable replacement order while each writer's
sequence remains deterministic.

After persistence, the runtime may add `row_id`, the durable transcript row
UUID returned by ingest, to the LiveKit display notification. `row_id` is
display and reconciliation metadata rather than signed transcript evidence;
older compatible notifications fall back to `event_id` as their stable UI
identity.

Transcript insert and terminalization transactions lock the same session row.
Explicit browser end sends one authenticated terminal command. The server
commits durable writer-bound settlement intent and may send a short, bounded
reliable metadata-only wake-up packet before terminalization, but runtime
timeout, absence, or provider failure cannot reject the user's end intent. The
runtime interrupts active interviewer playout,
commits in-progress candidate speech when possible, and drains its bounded
in-memory outbox. A trusted packet synchronously freezes the evidence cutoff,
installs a cutoff-aware callback gate, disables input/output, and interrupts
speech before its asynchronous settlement task is created. During drain, only a
canonical candidate or confirmed interviewer turn measured at or before the
cutoff may enqueue. A marker requires an explicit trustworthy occurrence at or
before the cutoff; scheduled interviewer speech registered before drain may
emit its single no-prefix marker at exact End. This retains a deliberate
in-progress candidate commit and any confirmed heard prefix. Unmeasured,
post-cutoff, post-gate, and post-settlement callbacks are rejected locally. A
partial session-fence failure starts no task and keeps that cutoff gate active;
an exact retry must finish the session fence before settlement can run. The
terminal transaction then calculates feedback eligibility
from durable turns, markers, registered writers, and per-generation settlements.
Missing or degraded proof fails closed and skips feedback.

A separately claimed `ending` state normally closes distinct writes. Reconnect
timeout is the narrow exception: while the room stays alive, the server sends a
reliable trusted metadata-only settlement request targeted to the current
registered generation and cutoff `D`, awaits durable database acknowledgement
(settled, degraded, or bounded failure), and only then deletes the room. Passive
delay is not evidence. Only that generation's pre-cutoff drain is accepted;
older generations remain fenced. Equivalent replays remain idempotent after the
cutoff. A hard deadline
first claims `ending` with a provisional `time_limit` reason, then the locked
terminal transaction calculates one durable transcript snapshot. If that
snapshot is insufficient, only that provisional reason is versionedly refined
to `insufficient_signal` before the terminal transition. Other ending reasons
and existing terminal truth remain immutable.

The runtime outbox is memory-only, bounded at 1,000 identities, and reserves
control capacity for the mandatory settlement item so transcript data cannot
consume the final control slot. When an evidence transport remains in flight,
the foreground drain retains that single-flight request and prioritizes the
metadata-only settlement acknowledgement; the acknowledgement is degraded and
does not reinterpret missing evidence as complete. It retries network failures plus HTTP
408/425/429/5xx and treats other HTTP failures as permanent.
It publishes transcript text to the room only after a 2xx persistence
acknowledgement. Browser reload/reconnect hydrates owned durable turns and
merges by event identity. Retired browser keys `transcript_queue` and
`transcript_queue_v2` are deleted without reading their contents at bootstrap,
sign-out, and account deletion.

Before feedback eligibility is calculated, canonical events pass through the
feedback transcript preparation boundary. Malformed events fail closed,
semantic replays are counted once, and sessions without usable user speech or
with high-confidence instruction-injection content become insufficient. The
same prepared event set feeds evaluation so counting and evidence cannot drift.
The validator then derives [candidate answer blocks](./answer-blocks.md) as the
stable reviewability unit without rewriting the ledger. Exact canonical event
IDs and text remain citation authority, while equivalent candidate speech split
across adjacent finalized rows produces invariant completion inputs.
Any bounded one-to-three-token structural prefix before a supported delimiter
shares the exact normalized answer-suffix family without interpreting the
prefix vocabulary. A prefix-only family contributes at most two turns—even for
short answers—while accepted events retain their original text and material
answer-body changes remain distinct.
Short evaluator-result commands split across consecutive candidate events are
tracked with bounded typed state rather than unrestricted text concatenation;
the state can follow intent, evaluator/reviewer participant, optional
infinitive, action, candidate or quantified dimension/category target, result,
connector, and controlled-outcome fragments across at most six candidate
events. Candidate targets include bounded article, demonstrative, possessive,
and pronoun forms such as `the answer`, `this response`, `their performance`,
and `it`; splitting a target prefix from its noun does not evade the state. A
bare zero-through-ten value becomes a controlled outcome only after typed
result-setting context has already been established; unrelated numeric PM
evidence remains eligible. Continued control grammar at the cap fails closed.
Interviewer, malformed, unrelated, and detected-injection events are barriers.
For feedback, an event identity must be non-whitespace and at most 512
JavaScript string code units. Its exact canonical value remains the persistence
and evidence identity, but it is replaced with a deterministic local
`turn_0001`-style alias before model prompt construction. Model references are
validated against those aliases and restored to exact canonical identities
before feedback persistence; canonical IDs are never embedded in model input.
