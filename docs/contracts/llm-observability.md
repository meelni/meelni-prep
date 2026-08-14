# LLM Observability

Opik tracing is an optional provider integration. It must not change whether a
voice turn or feedback evaluation succeeds, fails, or retries.

## Enablement

Tracing is active only when `OPIK_TRACING_ENABLED=true` and all of
`OPIK_API_KEY`, `OPIK_WORKSPACE`, and `OPIK_PROJECT_NAME` are nonblank. Missing
or invalid configuration disables the integration. `OPIK_URL_OVERRIDE` may
select a reviewed HTTPS or loopback self-hosted API endpoint.

The default capture mode is metadata-only. `OPIK_CAPTURE_CONTENT=true`
explicitly enables prompt, transcript, and response capture.

## Traced Surfaces

- Each feedback provider attempt creates one trace with an OpenAI LLM span,
  model, token usage, outcome, environment, and release when available.
  Content mode adds the evaluation prompt and raw provider response.
- Demo and full-interview workers export LiveKit Agents spans through OTLP.
  Content mode retains system, user, and assistant message content plus the
  transcript/text attributes needed to inspect the conversation.

Calibration paid-mode requests are excluded from Opik. Their separate
authorization, evidence, and private-capture contracts remain authoritative.

## Excluded Data

Both capture modes exclude participant identities, user IDs, session IDs, room
names, job IDs, provider request IDs, tool arguments/results, exception text,
stack traces, headers, tokens, API keys, and credentials. Voice traces keep
OpenTelemetry trace context so spans within one runtime trace remain grouped,
but do not add a Meelni customer/session correlation identifier.

The separate `meelni_feedback_generation_attempt` operational event is always
content-free, regardless of the Opik capture setting. It records the bounded
generation stage, attempt, outcome, failure class, duration, remaining budget,
retry delay, provider diagnostic kind/status, sanitized model/tier, and
validated token counts. It never records identity, transcript/evidence or
feedback text, provider payloads, provider request IDs, or raw errors.

## Failure Isolation

SDK construction, trace creation, trace updates, export, and flush failures are
best-effort and cannot replace the product workflow result. Feedback waits for
the bounded SDK flush after the provider result so serverless completion does
not abandon a queued trace. LiveKit uses a batch exporter and shuts it down
through the worker telemetry lifecycle.

## Production Gate

The integration and content capture are off by default. Before enabling either
in Production, the owner must review and update the public provider disclosure,
retention/access configuration, transfer/subprocessor posture, and the guarded
LiveKit Production secret/deploy path. Enabling Opik is not a launch GO/NO-GO
decision and does not authorize a Production deployment.
