# Adaptive Interviewer Synthetic Shadow Session Contract

Status: design freeze; no live authority checked in

## Entrypoint fence

The interview worker inspects private LiveKit agent-job metadata first. When it
identifies the exact Preview-shadow job contract, it MUST authenticate durable
admission and either delegate to the synthetic runner or shut down. It MUST NOT
fall through to ordinary room metadata parsing or customer runtime setup.

The Shadow branch returns before transcript writer registration, transcript
ingest, lifecycle reads, runtime settlement commands, customer controller,
interviewer tools, Director influence, feedback, credits, usage and ordinary
provider-failure persistence.

Unavailable, killed, expired, mismatched or unadmitted jobs exit before
`ctx.connect`, `AgentSession` or provider transport construction.

## Synthetic room contract

Room metadata is strict JSON no larger than 4 KiB and nesting depth 8:

```json
{
  "contract_version": "adaptive-interviewer-preview-shadow-synthetic-room.v1",
  "topology": "production_project_shadow",
  "session_binding_sha256": "64 lowercase hex",
  "round": "behavioral | product_sense | execution | strategy",
  "voice_condition": "one checked-in rehearsal condition",
  "expires_at": "canonical millisecond UTC"
}
```

No additional field is accepted. The binding and expiry are independently
checked against the admitted lease. The owner participant identity is the fixed
Production-project Shadow identity; it is not a customer ID.

## Voice and transcript behavior

The runner uses fixed server-owned interview voice configuration and a hard
deadline no later than the lease expiry. It may start the standard LiveKit
STT/LLM/TTS pipeline and speak the normal mock-interview opening.

Final candidate and interviewer turns may be normalized to the existing
transcript event wire solely for the authenticated owner room's in-memory UI.
The events use a synthetic session/writer namespace and are published only over
the LiveKit data channel. They are never canonical, durable, replayable,
hydrated, evaluated, analyzed or sent to a Meelni web API.

## Director behavior

Final synthetic turns use `observe_synthetic_transcript`; they never call
`observe_persisted_transcript`. A bounded in-memory simulator supplies the
minimum current-state shape required by the read-only Director. It is not
exported as customer authority and never constructs tools, delivery admission
or influence. Recommendations remain silent and exposure is `none`.

## Protected control-plane transport

Both durable admission and terminal evidence requests require the canonical
HTTPS staging endpoint, signed/durable run and lease bindings, the exact worker
evidence capability and a bounded temporary Vercel Automation Bypass secret in
the `x-vercel-protection-bypass` header.

The bypass secret is redacted from repr, exceptions, logs, evidence and tracked
files. Missing or malformed bypass configuration makes construction unavailable
before provider work. It grants no application authority without the existing
signed/capability-authenticated payload.

## Settlement

Disconnect, deadline, cancellation, voice failure and Director close all
converge on the existing coalesced 250 ms Shadow settlement boundary. The
worker submits exactly one terminal receipt when cleanup is confirmed or one
stop-incomplete incident when it is not. Submission is idempotently retried and
contains no room, participant, transcript, prompt or provider payload.
