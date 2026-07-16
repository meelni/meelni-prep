# LiveKit Room Metadata And Transcript Contract

This contract describes the provider-normalized payload shared by the Next.js
app and Python LiveKit agents.

## Room Metadata

Full interview rooms receive JSON metadata with this shape:

```json
{
  "contract_version": 1,
  "session_id": "uuid",
  "transcript_ingest_url": "https://meelni.com/api/internal/transcript",
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
    "hintMode": "off",
    "questionPreference": { "recency": "very_recent", "recentDays": 365 },
    "stt_model": "deepgram/nova-3",
    "llm_model": "openai/gpt-4.1-mini",
    "tts_model": "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"
  }
}
```

### Configuration ownership

The public session-start boundary accepts only `difficulty`, `duration`,
`hintMode`, and `questionPreference`. Provider names, model names, voice IDs,
speed, emotion, volume, and feedback timing are operational settings. The web
workflow strips legacy or malicious copies of those fields before persistence
and room creation, then resolves trusted settings from server environment.

Free-form persona text is not part of the public request or room contract and
is never appended to the agent prompt. The optional public `role` field accepts
only the canonical `pm` value; any other value is rejected before persistence.

Room metadata carries the web server's resolved snapshot for observability and
session history. The Python voice runtime treats all provider/model/voice
fields in metadata as untrusted and independently resolves them from its own
environment. Web and voice-agent deployments therefore must use matching
`MEELNI_INTERVIEW_*` values. No setting in this contract is a credential.

`packages/agent/src/room-metadata.ts` is the TypeScript source of truth for the
serialized shape. `contract_version`, `session_id`, and
`transcript_ingest_url` are required. The web workflow creates them; consumers
must not invent a session ID from a room name or derive an ingest host from
untrusted request headers. The ingest URL must be exact HTTPS with no query or
fragment; loopback HTTP is allowed only for local development.

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
starts. For a future deadline it arms one watchdog after the session starts.
At semantic cutoff `D = deadline_at`, it stops input and output, persists only
the exact heard prefix or textless unavailable marker measured at or before
`D`, performs a bounded per-generation runtime-outbox drain, and records
`settled_at = D` before acknowledged room termination. Later operational
acknowledgement does not extend audio or the evidence window. Duplicate
watchdogs share one enforcement operation. A normal session close cancels a
watchdog that has not begun enforcement.

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
2 requires stable identity, registered `writer_generation`, sequence,
session/room correlation, measured start/end timing and audio duration, a
non-null section, and explicit delivery state across TypeScript and Python.

Each audible runtime first durably registers a metadata-only writer identity.
Every registered generation must persist its own settled proof; replacement
writers fence older distinct writes but do not erase older settlement
obligations. On reconnect expiry, the server uses the trusted
`meelni.transcript.settlement.request` topic for a reliable metadata-only
request containing request, session, room, writer-generation, and cutoff
correlation. It awaits durable acknowledgement before room deletion. This
control exchange never carries transcript text, provider credentials, or
question content.

A realtime data packet is a post-persistence display notification. A turn
counts as durable lifecycle signal only after the signed runtime endpoint
verifies session/room correlation and acknowledges persistence. The browser
hydrates durable server truth after reload/reconnect and never stores raw retry
payloads.
