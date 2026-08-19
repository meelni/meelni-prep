# Interview Runtime Configuration

Interview provider, model, and voice tuning is operator-owned. Configure these
non-secret variables on both the Next.js and Python voice-agent deployments:

- `MEELNI_INTERVIEW_STT_MODEL`
- `MEELNI_INTERVIEW_LLM_MODEL`
- `MEELNI_INTERVIEW_TTS_MODEL`
- `MEELNI_INTERVIEW_VOICE`
- `MEELNI_INTERVIEW_TTS_SPEED`
- `MEELNI_INTERVIEW_TTS_EMOTION`
- `MEELNI_INTERVIEW_TTS_VOLUME`

String values are trimmed; blank strings use the checked-in defaults. Speed and
volume accept decimal or exponent syntax only (not hexadecimal), must be finite,
and must remain within `0.6–1.5` and `0.5–2.0` respectively. Invalid values use
the checked-in defaults. TypeScript and Python enforce these rules with the same
shared golden fixtures. Do not create
`NEXT_PUBLIC_*` equivalents and do not put credentials in these variables.
Deploy matching values to both runtimes: the web server persists the resolved
snapshot, while the Python agent independently resolves its effective runtime
settings as a defense against metadata injection.

Set `LIVEKIT_INTERVIEW_AGENT_NAME` and `LIVEKIT_DEMO_AGENT_NAME` for every
worker invocation, including local development. Startup rejects missing or
blank names. This is a safety property, not optional tuning: LiveKit workers
without a name use automatic dispatch and can join unrelated new rooms.

The web adapter provisions each room with its explicit named dispatch in the
same room-creation request and then lists dispatches. Continue only when there
is exactly one nonblank matching dispatch. Treat an unnamed, duplicate, or
mismatched dispatch as a failed start; let the durable failed-start workflow
terminate the room and settle the reservation. Do not repair the room by adding
a second dispatch.

Before rollout, run the TypeScript and Python contract tests and compare the
configured values across the two deployments. Keep the relaunch feature flag
off until the broader launch review is complete.

## Deterministic controller

`MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED` is a server-only, disabled-by-default
runtime flag. Only the exact value `true` constructs the SAV-471 controller;
absence, blanks, mixed case, and every other value retain the existing
`InterviewAgent` path. Construction also requires an exact durable lifecycle
snapshot from the authenticated current-writer-bound lifecycle reader. Missing,
non-active, stale, or unavailable authority fails safely to `InterviewAgent`.
Do not add a `NEXT_PUBLIC_*` equivalent, configure the flag in Preview or
Production, or infer launch permission from its presence in the repository. See
[Deterministic Interview Controller](./interview-controller.md) for evidence
boundaries and provider-free verification.

`MEELNI_INTERVIEW_TOOLS_V1_ENABLED` is the separate SAV-472 server-only gate.
The exact value `true` exposes the five local tools only when the controller is
enabled and a current-writer-bound lifecycle reader has produced a fresh active
lease. Missing/invalid values, a non-active state, writer replacement, reader
failure, or lease expiry preserve the prompt-led fallback. Do not add a
`NEXT_PUBLIC_*` equivalent or configure either gate in any environment as part
of this repository slice.

## Read-only Interview Director shadow

`MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED` is a separate server-only exact
flag and defaults off. SAV-474 deliberately injects no application adapter, so
even the exact value `true` resolves `adapter_unavailable` and starts no
Director task. Do not configure the flag in Preview or Production, add a
`NEXT_PUBLIC_*` equivalent, or reuse the live interview model configuration as
a Director selection. See
[Interview Director Shadow](./interview-director-shadow.md).
