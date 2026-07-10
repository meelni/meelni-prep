# Transcript Event Contract

Status: version 2 canonical writer contract; version 1 read compatibility retained for rolling deployment

## Purpose

Every finalized interview turn must be uniquely addressable, ordered within its
runtime, correlated to the durable session and provider room, and backed by
measured timing. `packages/agent/src/transcript-events.ts` is the TypeScript
source of truth. `agent/shared/transcript_events.py` emits the same wire shape.

The LiveKit data topic remains `transcript`. The packet is a transport fact,
not proof that the turn was durably stored. Persistence ownership,
deduplication, and out-of-order ingest belong to SAV-194.

## Version 2

Canonical writers publish this shape:

```json
{
  "contract_version": 2,
  "event_id": "writer-instance-id:livekit-message-id",
  "writer_id": "writer-instance-id",
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
| `event_id`                 | Non-empty identity generated once for the event. Replays retain it.                                                                           |
| `writer_id`                | Non-empty identity for one agent job/writer instance. A replacement writer in the same room receives a new ID.                                |
| `sequence`                 | Positive safe integer, monotonically assigned within one `writer_id`. Gaps are allowed.                                                       |
| `session_id` / `room_name` | Both required. The durable session ID comes from validated room metadata; the room name comes from the runtime.                               |
| `speaker`                  | `user` or `interviewer`.                                                                                                                      |
| `text` / `is_final`        | Text is non-empty and finalized. Partial STT hypotheses are not canonical events.                                                             |
| `started_at` / `ended_at`  | Canonical UTC ISO-8601 timestamps with exactly millisecond precision and `ended_at` strictly after `started_at`.                              |
| `audio_duration_ms`        | Positive safe integer duration equal to the timestamp interval within one millisecond. Zero, fractional, and estimated values are invalid.    |
| `section`                  | Non-empty durable section label. Until fine-grained section tracking lands, the runtime uses the interview round type; it never sends `null`. |
| `delivery_state`           | `delivered` or `partially_delivered`. Fully unheard generated speech is not a transcript turn.                                                |

The current Python writer consumes committed LiveKit conversation items and
uses their runtime-measured `started_speaking_at` and `stopped_speaking_at`
metrics. If positive timing cannot be measured, the writer drops and logs the
event instead of inventing a zero-duration turn.

Consumers deduplicate globally by `event_id`. They order events from one writer
by `sequence`; across replacement writers they order by measured `started_at`,
then `writer_id` and `sequence` as deterministic tie-breakers. A sequence value
without its `writer_id` has no ordering meaning.

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
5. SAV-193 may begin publishing heard interrupted speech as
   `partially_delivered`; SAV-194 owns durable ordering and idempotency.

Until SAV-193 lands, the canonical writer excludes interrupted interviewer
items rather than publishing generated-but-unheard text as delivered speech.

The public relaunch gate remains off until the downstream transcript privacy,
ingest, evaluation, and launch-rehearsal slices pass.

## Durable Ingest

SAV-194 makes version 2 the only durable writer shape. The authenticated web
endpoint accepts `{ sessionId, event }`, validates the complete shared event,
requires `event.session_id === sessionId`, and verifies both session ownership
and the stored provider room inside the database transaction. Missing and
cross-user sessions remain indistinguishable.

`event_id` is globally unique. An equivalent replay returns the existing row;
reusing the identity with different content fails closed. `(session_id,
writer_id, sequence)` is also unique, so a writer cannot assign one sequence to
two events. A session accepts at most 1,000 durable turns. Legacy rows keep all
canonical identity fields null. Canonical rows
require the entire version 2 identity/timing tuple and are immutable through
the legacy correction helpers.

Within one writer, measured start times must remain monotonic with sequence.
The ingest transaction rejects an inversion. Readers therefore order by
`started_at`, then `writer_id`, `sequence`, `event_id`, and row ID; this obeys
writer sequence while producing a deterministic cross-writer order.

Transcript insert and terminalization transactions lock the same session row.
Explicit browser end establishes a client cutoff, stops accepting later packet
arrivals, and performs a bounded retry/in-flight flush. Once the terminal
transaction owns the row, it calculates feedback eligibility from the durable
turns in that transaction and closes new distinct writes. Equivalent replays
remain idempotent after terminalization. System deadlines use the durable
evidence available when they acquire the same lock.

The browser remains a temporary authenticated transport bridge and cannot make
a packet durable until the server acknowledges it. SAV-193 owns removal of raw
browser persistence and the longer-term server-side ingest trust boundary.

Before feedback eligibility is calculated, canonical events pass through the
feedback transcript preparation boundary. Malformed events fail closed,
semantic replays are counted once, and sessions without usable user speech or
with high-confidence instruction-injection content become insufficient. The
same prepared event set feeds evaluation so counting and evidence cannot drift.
