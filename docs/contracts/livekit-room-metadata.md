# LiveKit Room Metadata And Transcript Contract

This contract describes the provider-normalized payload shared by the Next.js
app and Python LiveKit agents.

## Room Metadata

Full interview rooms receive JSON metadata with this shape:

```json
{
  "contract_version": 1,
  "session_id": "uuid",
  "deadline_at": "2026-07-09T20:30:00.000Z",
  "round_type": "product_sense",
  "mode": "voice_video",
  "question": {
    "id": "question-id",
    "text": "How would you improve Spotify?",
    "company": "Spotify",
    "type": "Product Sense",
    "askedAt": "2026-06-27T17:30:00.000Z"
  },
  "config": {
    "difficulty": "intermediate",
    "voice": "cgSgspJ2msm6clMCkdW9",
    "speed": 1,
    "emotion": "professional",
    "volume": 1,
    "duration": 30,
    "feedback_mode": "end_only",
    "stt_model": "deepgram/nova-3",
    "llm_model": "openai/gpt-4.1-mini",
    "tts_model": "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"
  }
}
```

`packages/agent/src/room-metadata.ts` is the TypeScript source of truth for the
serialized shape. `contract_version` and `session_id` are required. The web
workflow creates both; consumers must not invent a session ID from a room name.

`deadline_at`, when present, is an absolute UTC timestamp in canonical
`YYYY-MM-DDTHH:mm:ss.sssZ` form. An explicitly malformed timestamp fails closed
at the TypeScript and Python metadata boundaries. Missing `deadline_at` is
normalized to `null` only for rolling compatibility with rooms created before
SAV-189; new server writers must always supply it before hard-deadline rollout
can be considered complete.

Contract version 1 is the only canonical writer shape. Python may normalize the
documented legacy question aliases (`question_id`, `question_text`, and
`question_type`) at its adapter boundary, but new writers use `id`, `text`, and
`type`. Missing metadata, invalid JSON, an unsupported contract version, a
missing session ID, or an invalid round type is a runtime-start failure. It must
not silently create an uncorrelated default interview.

## Duration And Runtime Deadline

`packages/core/src/session-deadline.ts` owns the provider-neutral duration and
absolute-deadline policy. Supported interview durations are 15, 30, and 45
minutes; missing or unsupported values normalize to 30 minutes in both
TypeScript and Python. Callers derive one absolute `deadline_at` from the
server-owned session start instant and serialize it only at room-metadata and
API boundaries.

The Python voice runtime rejects an already-expired job before `AgentSession`
starts. For a future deadline it arms one watchdog after the session starts. At
or after `deadline_at`, it calls the immediate `AgentSession.aclose()` path
without draining queued speech, then uses the acknowledged room-service API to
terminate the room. Duplicate watchdogs share one enforcement operation. A
normal session close cancels a watchdog that has not begun enforcement.

This runtime shutdown is a provider-side safety boundary, not canonical session
terminal truth. The server deadline workflow still owns the versioned
`time_limit` claim, feedback handoff, and durable outcome. Agent shutdown must
not write lifecycle state or infer feedback eligibility.

Room metadata correlates the runtime to the session; it does not own session
lifecycle. Provider-native room/job/participant states are normalized signals
for the session workflow described in
[Interview Session Lifecycle Contract](./interview-session-lifecycle.md).

## Runtime Lifecycle Events

The TypeScript and Python runtimes share a provider-neutral event contract on
topic `interview.lifecycle.v1`:

```json
{
  "contract_version": 1,
  "event_id": "runtime-event-id",
  "session_id": "uuid",
  "type": "runtime_activated",
  "occurred_at": "2026-07-09T20:00:00.000Z",
  "runtime_ref": {
    "provider": "realtime-provider",
    "id": "opaque-runtime-id"
  }
}
```

Allowed event types are `runtime_provisioned`, `runtime_activated`,
`connection_lost`, `connection_restored`, and `provider_failed`.
`provider_failed` additionally requires:

```json
{
  "failure": {
    "reason": "provider_failure",
    "code": "safe_normalized_code",
    "retryable": true
  }
}
```

Rules:

- `event_id`, `session_id`, `occurred_at`, and `contract_version` are required.
- `occurred_at` is an ISO timestamp.
- Runtime references contain an adapter name and opaque runtime ID, never a
  token or credential.
- Consumers validate the version and shape, deduplicate by `event_id`, and
  correlate by `session_id` before asking the session workflow to transition.
- Events are facts, not direct lifecycle writes. A delayed event cannot reopen
  a terminal session, and a provider failure must pass through terminal
  arbitration.

## Transcript Events

Agents publish finalized transcript turns to LiveKit data topic `transcript`
using the [versioned transcript event contract](./transcript-events.md). Version
2 requires stable identity, sequence, session/room correlation, measured
start/end timing and audio duration, a non-null section, and explicit delivery
state across TypeScript and Python.

A realtime data packet remains best-effort transport, not durable transcript
storage. A turn counts as durable lifecycle signal only after persistence
succeeds. Data-packet delivery can miss a temporarily disconnected receiver;
reconnect and end workflows must not assume that every packet arrived.
