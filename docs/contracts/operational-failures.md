# Operational Failure Event Contract

## Purpose

`meelni_operational_failure` is the provider-independent server event for launch-critical failures. It is operational telemetry for recovery and alerting, not marketing analytics.

## Version 1

```json
{
  "event": "meelni_operational_failure",
  "version": 1,
  "occurredAt": "2026-07-18T20:00:00.000Z",
  "environment": "preview",
  "release": "1234567890ab",
  "operation": "interview_start",
  "errorCode": "interview_start_failed",
  "severity": "critical",
  "retryable": true,
  "requestId": null,
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Allowed operations are `auth_callback`, `interview_token`, `interview_start`, `interview_end`, `feedback_dispatch`, `stripe_webhook`, `question_sync`, `account_deletion`, `interview_recovery`, `billing_read`, `billing_portal`, `checkout_confirmation`, and `service_health`.

Service-health database failures distinguish the application deadline from a
query/connection failure using only `service_health_database_timeout` or
`service_health_database_query_failed`. They never include the database error,
URL, relation/column name, or provider response. One server isolate emits each
code at most once per five minutes; an external receiver must still deduplicate
globally by environment, release, operation, and error code.

Billing read and portal failures use fixed route-level error codes. They do not
include Stripe customer identifiers, database messages, exception strings, or
request bodies. Subscription reads, provider customer lookups, portal-session
creation, and authenticated billing reads are retryable operational errors;
expected accounts without a subscription do not emit a failure event.

Checkout confirmation uses fixed codes for authentication and first-party
settlement reads. Expected unauthenticated requests and malformed, missing, or
foreign session correlations do not emit a failure event. All
checkout-confirmation events omit purchase and account identifiers.

## Privacy Boundary

The event is constructed from a closed schema. Callers cannot attach exceptions, stacks, messages, arbitrary context, provider payloads, user IDs, emails, transcripts, tokens, room credentials, question text, or payment identifiers.

- Operation, error code, severity, and retryability are runtime validated before serialization.
- Error codes come only from the versioned `OPERATIONAL_FAILURE_ERROR_CODES` catalog.
- `requestId` remains `null`; incoming headers are caller-controlled and are not trusted operational identifiers.
- `correlationId` accepts only a branded interview-session value produced after stored ownership agrees with the authenticated user.
- Pre-authentication, pre-ownership, configuration, and malformed-request failures deliberately omit correlation.
- Environment is a fixed enum and release is a validated, truncated Git commit SHA.
- Reporter clock or sink failure returns a fixed redacted fallback and never replaces the product failure.

Durable provider/workflow stores retain only their separately documented stable identifiers and fixed error codes. This runtime event does not expand those retention contracts.

Deployed API routes and launch-critical server modules must not write caught
exception values directly to `console.*`. Fixed cause-free codes are allowed,
as is the shared `toSafeErrorLog` classifier because it returns only a closed
error-class enum. A project-wide raw log drain is not an operational-failure
receiver: a future receiver must consume only this closed event boundary or
pass a separately reviewed equivalent privacy boundary before transmission.

## Compatibility

Consumers filter by `event` and `version`. Adding an operation or error code is backward compatible. Adding or removing fields requires a new version.
