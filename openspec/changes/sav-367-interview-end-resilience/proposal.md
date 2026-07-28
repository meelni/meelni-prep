# SAV-367 interview end resilience

## Why

Explicit user end currently has two owners. The browser first asks the voice
runtime to settle and refuses to call the durable end endpoint when that
acknowledgment is late or missing. Production sessions therefore remain live
after the candidate has explicitly chosen End Interview.

## Outcome

End Interview is one authenticated, idempotent server command. The server
attempts a bounded runtime settlement, then commits terminal truth regardless
of whether the runtime is available. Incomplete transcript evidence still
fails closed: feedback is skipped and the session is not represented as a
complete evaluable interview.

## Boundaries

- No transcript text is added to logs or operational events.
- No missing runtime evidence is synthesized as settled.
- No feedback is generated from an incomplete writer generation.
- Lifecycle activation, opening behavior, endpointing, and release telemetry
  remain separately tracked under SAV-366 and SAV-368 through SAV-370.
