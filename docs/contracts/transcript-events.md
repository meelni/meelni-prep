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
  "event_id": "6f506551-3f14-4c55-a1c1-1bf11c1117e1",
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
| `sequence`                 | Positive integer, monotonically assigned within one runtime/room. Gaps are allowed; consumers must order by it and deduplicate by `event_id`. |
| `session_id` / `room_name` | Both required. The durable session ID comes from validated room metadata; the room name comes from the runtime.                               |
| `speaker`                  | `user` or `interviewer`.                                                                                                                      |
| `text` / `is_final`        | Text is non-empty and finalized. Partial STT hypotheses are not canonical events.                                                             |
| `started_at` / `ended_at`  | Valid absolute timestamps with `ended_at` strictly after `started_at`.                                                                        |
| `audio_duration_ms`        | Positive measured duration and equal to the timestamp interval within one millisecond. Zero and estimated placeholder durations are invalid.  |
| `section`                  | Non-empty durable section label. Until fine-grained section tracking lands, the runtime uses the interview round type; it never sends `null`. |
| `delivery_state`           | `delivered` or `partially_delivered`. Fully unheard generated speech is not a transcript turn.                                                |

The current Python writer consumes committed LiveKit conversation items and
uses their runtime-measured `started_speaking_at` and `stopped_speaking_at`
metrics. If positive timing cannot be measured, the writer drops and logs the
event instead of inventing a zero-duration turn.

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
or delivery state. The browser may keep the old timestamp for compatibility
and leaves missing duration/section fields absent. New writers must never emit
this shape. Unsupported explicit versions and malformed packets fail closed.

Version 1 read support can be removed only after deployed agents all emit
version 2 and the observation window reports no legacy packets. Version 2 is
additive at the transport boundary; no database migration is part of this
slice.

## Rollout And Verification

1. Deploy a web reader that accepts version 2 and identifies legacy packets.
2. Deploy the version 2 Python writer.
3. Verify TypeScript and Python fixtures serialize the same field names,
   timestamps, timing invariant, and delivery states.
4. Observe legacy-packet and invalid-packet logs before removing compatibility.
5. SAV-193 may begin publishing heard interrupted speech as
   `partially_delivered`; SAV-194 owns durable ordering and idempotency.

Until SAV-193 lands, the canonical writer excludes interrupted interviewer
items rather than publishing generated-but-unheard text as delivered speech.

The public relaunch gate remains off until the downstream transcript privacy,
ingest, evaluation, and launch-rehearsal slices pass.
