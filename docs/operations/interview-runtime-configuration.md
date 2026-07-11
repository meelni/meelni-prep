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

Unset or invalid numeric values use the checked-in defaults. Do not create
`NEXT_PUBLIC_*` equivalents and do not put credentials in these variables.
Deploy matching values to both runtimes: the web server persists the resolved
snapshot, while the Python agent independently resolves its effective runtime
settings as a defense against metadata injection.

Before rollout, run the TypeScript and Python contract tests and compare the
configured values across the two deployments. Keep the relaunch feature flag
off until the broader launch review is complete.
