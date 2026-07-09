# LiveKit Room Metadata And Transcript Contract

This contract describes the provider-normalized payload shared by the Next.js
app and Python LiveKit agents.

## Room Metadata

Full interview rooms receive JSON metadata with this shape:

```json
{
  "contract_version": 1,
  "session_id": "uuid",
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

Contract version 1 is the only canonical writer shape. Python may normalize the
documented legacy question aliases (`question_id`, `question_text`, and
`question_type`) at its adapter boundary, but new writers use `id`, `text`, and
`type`. Missing metadata, invalid JSON, an unsupported contract version, a
missing session ID, or an invalid round type is a runtime-start failure. It must
not silently create an uncorrelated default interview.

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

Agents publish final transcript turns to LiveKit data topic `transcript`:

```json
{
  "speaker": "user",
  "text": "I would start by clarifying the goal.",
  "timestamp": 1782600000,
  "is_final": true
}
```

Rules:

- `speaker` is `user` or `interviewer`.
- `timestamp` is epoch seconds.
- The app only persists valid parsed events.
- Partial STT events should not be persisted as final turns.
- Interrupted or undelivered agent speech should not be published as transcript.
- A realtime data packet is best-effort transport, not durable transcript
  storage. The browser currently persists accepted events through the
  authenticated transcript endpoint and retry queue.
- A turn counts as durable lifecycle signal only after persistence succeeds.
- Data-packet delivery can miss a temporarily disconnected receiver; reconnect
  and end workflows must not assume that receiving every packet is guaranteed.
