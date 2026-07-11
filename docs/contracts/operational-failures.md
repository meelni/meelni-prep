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

- `operation`, `severity`, and `retryable` are runtime-validated against their
  closed enums/boolean contract before any write; TypeScript types are not the
  privacy boundary.
- `errorCode` must be a member of the versioned
  `OPERATIONAL_FAILURE_ERROR_CODES` catalog. Unknown, dynamic, and merely
  snake_case values fail before serialization.
- `requestId` accepts only a bounded Vercel-style opaque identifier.
- `correlationId` accepts only a branded interview-session correlation value.
- The correlation factory requires an ownership-validated interview-session
  record plus the authenticated user ID. It verifies the stored owner matches
  the authenticated user and rejects a session ID equal to either user ID. Raw
  request UUIDs, structurally relabeled Supabase user references, and
  pre-ownership failures therefore cannot become correlations.
- `environment` is an enum.
- `release` is a truncated validated Git commit SHA.
- invalid optional values become `null` rather than being normalized or logged.

Raw provider error text may still be used transiently to choose an internal classification, but it must not enter this event or an HTTP response.

Launch-critical instrumented boundaries must not write directly to the console.
This rule covers the recursively resolved local call graph, including provider,
evaluation, question-selection, billing-analytics, and source-preparation
callees rather than only route/workflow wrappers. Failure telemetry across that
graph goes through this closed schema so a future log drain cannot accidentally
receive provider identifiers, question text, raw errors, or user data.
Errors that cross durable Inngest step or function boundaries use stable,
identifier-free codes. They must not interpolate session IDs, user IDs, stored
owner IDs, provider IDs, or payload content because Inngest retains failure
history independently of the runtime-log event.

Stripe webhook idempotency storage retains the provider event ID, event type,
one-way subject fingerprint, status, attempt count, and timestamps. New rows
store `{}` instead of the provider payload and a stable failure code instead of
raw exception text. Account deletion still redacts legacy rows that predate
this contract.

## Compatibility

Consumers must filter by `event` and `version`. Adding an operation or error code is backward compatible. Adding or removing fields requires a new version.
