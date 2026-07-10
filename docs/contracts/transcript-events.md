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

The Python writer consumes committed LiveKit conversation items and
uses their runtime-measured `started_speaking_at` and `stopped_speaking_at`
metrics. LiveKit Agents 1.6.5 truncates an interrupted interviewer message to
the TTS-synchronized prefix that was actually played. That prefix is persisted
as `partially_delivered`; generated continuation is never stored.

When an interruption has no provider-confirmed text—or a committed user or
interviewer turn cannot be normalized to canonical measured evidence—the
runtime persists a separate `integrity_unavailable` marker. It contains
correlation, identity, speaker, reason, and occurrence time but no `text`
field. Markers live outside `transcript_turn`, are never rendered or passed to
evaluation, and make the session ineligible for feedback because complete
evidence cannot be proven.

At an explicit end or the exact runtime deadline, the runtime first disables
audio input, commits any active user turn without generating another reply,
interrupts active interviewer speech, and drains the signed outbox. It then
persists one metadata-only `runtime_settlement` watermark with `settled` or
`degraded` state. Terminal completion requires a durable `settled` watermark
and no integrity markers; missing or degraded proof fails closed. Settlement
also seals the runtime queue. Under the same session row lock, exact event
replays remain idempotent but every new transcript or marker identity is
rejected after the watermark.

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
writer_id, sequence)` is also unique, so a writer cannot assign one sequence to
two events. A session accepts at most 1,000 durable turns. Legacy rows keep all
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
`started_at`, then `writer_id`, `sequence`, `event_id`, and row ID; this obeys
writer sequence while producing a deterministic cross-writer order.

Transcript insert and terminalization transactions lock the same session row.
Explicit browser end invokes the runtime's transcript-settlement RPC. The
runtime interrupts any active interviewer playout, waits for LiveKit to expose
the synchronized prefix or no-prefix marker, and drains its bounded in-memory
outbox before the browser requests terminalization. Once the terminal
transaction owns the row, it calculates feedback eligibility from the durable
turns in that transaction and closes new distinct writes. A separately claimed
`ending` state, including reconnect-timeout cleanup, also closes distinct
writes. Equivalent replays remain idempotent after the cutoff. A hard deadline
first claims `ending` with a provisional `time_limit` reason, then the locked
terminal transaction calculates one durable transcript snapshot. If that
snapshot is insufficient, only that provisional reason is versionedly refined
to `insufficient_signal` before the terminal transition. Other ending reasons
and existing terminal truth remain immutable.

The runtime outbox is memory-only, bounded at 1,000 identities, retries network
failures plus HTTP 408/425/429/5xx, and treats other HTTP failures as permanent.
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
