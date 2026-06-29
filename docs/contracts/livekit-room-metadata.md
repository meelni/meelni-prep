# LiveKit Room Metadata And Transcript Contract

This contract describes the provider-normalized payload shared by the Next.js
app and Python LiveKit agents.

## Room Metadata

Full interview rooms receive JSON metadata with this shape:

```json
{
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
current serialized shape. `agent/shared/config.py` accepts this shape and a small
set of legacy aliases while the runtime is still split between TypeScript and
Python.

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
