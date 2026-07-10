# Operational Failure Event Contract

## Purpose

`meelni_operational_failure` is the provider-independent server event used to find launch-critical failures in Vercel Runtime Logs or a future verified log drain. It is operational telemetry, not marketing analytics.

## Version 1

```json
{
  "event": "meelni_operational_failure",
  "version": 1,
  "occurredAt": "2026-07-10T20:00:00.000Z",
  "environment": "preview",
  "release": "1234567890ab",
  "operation": "interview_start",
  "errorCode": "interview_start_failed",
  "severity": "critical",
  "retryable": true,
  "requestId": "sfo1::request-123",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Allowed operations are `auth_callback`, `interview_token`, `interview_start`, `interview_end`, `feedback_queue`, `stripe_webhook`, `question_sync`, and `account_deletion`.

## Privacy boundary

The event is constructed from a closed schema. Callers cannot attach an exception, stack, message, arbitrary context, provider payload, user ID, email, transcript, token, room credential, payment identifier, or secret.

- `errorCode` is a bounded snake_case classification owned by Meelni.
- `requestId` accepts only a bounded Vercel-style opaque identifier.
- `correlationId` accepts only a branded interview-session correlation value.
- The correlation factory requires a discriminated `interview_session` source;
  a raw string or Supabase user reference is not a valid typed input. The
  factory also validates the session ID as a UUID at runtime.
- `environment` is an enum.
- `release` is a truncated validated Git commit SHA.
- invalid optional values become `null` rather than being normalized or logged.

Raw provider error text may still be used transiently to choose an internal classification, but it must not enter this event or an HTTP response.

Launch-critical instrumented boundaries must not write directly to the console.
This rule includes the start/join workflows invoked by the route boundary, not
only the route file. Failure telemetry across that call graph goes through this
closed schema so a future log drain cannot accidentally receive provider
identifiers, question text, raw errors, or user data.

Stripe webhook idempotency storage retains the provider event ID, event type,
one-way subject fingerprint, status, attempt count, and timestamps. New rows
store `{}` instead of the provider payload and a stable failure code instead of
raw exception text. Account deletion still redacts legacy rows that predate
this contract.

## Compatibility

Consumers must filter by `event` and `version`. Adding an operation or error code is backward compatible. Adding or removing fields requires a new version.
