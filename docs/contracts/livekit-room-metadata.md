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

The public session-start boundary accepts only `difficulty`, `duration`, the
legacy-compatible `hintMode` field, and `questionPreference`. Full mock
interviews normalize every `hintMode` value to `off`. Provider names, model
names, voice IDs, speed, emotion, volume, and feedback timing are operational
settings. The web workflow strips legacy or malicious copies of those fields
before persistence and room creation, then resolves trusted settings from
server environment.

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

## Agent Dispatch

The web adapter creates a full-interview room and its one explicit named agent
dispatch atomically with `RoomAgentDispatch`. It never creates a plain room
before a second dispatch request. After creation, the adapter requires exactly
one dispatch with a nonblank ID, the configured
`LIVEKIT_INTERVIEW_AGENT_NAME`, and the exact room name. An automatic unnamed
dispatch, an extra dispatch, or any mismatch is a start failure and enters the
durable failed-start cleanup workflow.

Both Python workers require their dispatch-name environment variable in every
mode, including local development. Omitting the name must stop the worker
before registration; otherwise LiveKit automatic dispatch could attach that
worker to unrelated rooms. The demo uses `LIVEKIT_DEMO_AGENT_NAME`; the full
interview uses `LIVEKIT_INTERVIEW_AGENT_NAME`; the names must remain distinct.

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

## Full-Interview Prompt Behavior

The authenticated full-interview runtime is a realistic PM interviewer, not an
in-session teaching experience. For every supported round type it:

- speaks one concise deterministic opening that is retained in model chat
  context and permits candidate barge-in;
- includes the selected question in that first audible turn when one is present,
  then asks one adaptive follow-up at a time;
- probes the candidate's reasoning, specificity, evidence, trade-offs, and risks;
- does not teach a framework, suggest an answer, or judge answer quality during
  the interview; and
- leaves strengths, improvements, scores, and recommendations to the durable
  post-interview feedback workflow.

Full mock interviews normalize `feedback_mode` to `end_only` and `hintMode` to
`off` at both the TypeScript and Python boundaries. This includes legacy
`real_time` or `silent` feedback values and legacy `gentle` or `coach` hint
values. The authoritative TypeScript runtime composer and room-metadata writer
also overwrite legacy feedback timing after caller-provided settings are
merged, so newly serialized rooms always carry `end_only`. The short public
demo is a separate runtime and may provide a brief feedback preview; its
behavior must not be used as the authenticated mock-interview contract.

The authenticated full-interview UI follows the same contract: it does not
offer a hints toggle, call the nudge-analysis endpoint, or render a nudge
overlay. Legacy `gentle` or `coach` values read from an older session remain
inert. Therefore a `hint shown` event is not a valid full-mock analytics event;
display telemetry belongs with a future, separately accepted guided-practice
surface that can supply a real supported hint mode.

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

The registered writer UUID is an ingest identity, not a LiveKit participant
identity. The server targets exactly one provider-owned agent identity: first a
unique joined/active kind-4 room participant correlated to the configured
interview agent name, or, only when that projection is absent or incomplete,
the exact identity from the room's single dispatch with that configured name
and single running job. A missing or blank configured interview-agent name
authorizes no target and no dispatch lookup. The normalized current projection requires exact
dispatch/job linkage, room job type, room and agent names, exactly one job per
room dispatch, protobuf `deletedAt == 0` / `endedAt == 0` defaults, running
status, and no publisher-only job participant projection. Only separate
explicitly deleted dispatches and separate structurally complete terminal
dispatch jobs are ignored as history. Ambiguous agents, dispatches, or jobs;
stale job state;
wrong agent or room state; identity disagreement; and blank or over-limit
identities fail closed without sending data.

After target resolution, the server re-reads the exact current writer
generation. Replacement or absence sends nothing; a generation that settled
during provider lookup returns its durable result. Only the same current,
unsettled generation can receive the exact-destination packet.

A realtime data packet is a post-persistence display notification. A turn
counts as durable lifecycle signal only after the signed runtime endpoint
verifies session/room correlation and acknowledges persistence. The browser
hydrates durable server truth after reload/reconnect and never stores raw retry
payloads.
