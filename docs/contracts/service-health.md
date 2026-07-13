# Service Health Contract

## Purpose

`GET /api/health` reports whether the deployed product can support the core
practice path. It is a public, no-store readiness contract, not a customer or
provider diagnostics endpoint.

## Version 1

```json
{
  "contract": "meelni_service_health",
  "version": 1,
  "checkedAt": "2026-07-10T20:00:00.000Z",
  "status": "healthy",
  "checks": [
    { "name": "web", "status": "healthy", "code": "web_ready" },
    {
      "name": "database",
      "status": "healthy",
      "code": "database_ready"
    },
    {
      "name": "livekit",
      "status": "healthy",
      "code": "livekit_ready"
    },
    {
      "name": "feedback_dispatch",
      "status": "healthy",
      "code": "feedback_dispatch_ready"
    },
    {
      "name": "stripe_webhook",
      "status": "healthy",
      "code": "stripe_webhook_ready"
    }
  ]
}
```

The check order and fields are fixed. The endpoint does not expose counts,
durations, last-customer-activity timestamps, row/event IDs, user/session IDs,
exception messages, provider payloads, environment-variable names, or secrets.

## Semantics

- `healthy`: all required configuration and bounded persistence evidence pass.
- `degraded`: practice may work, but feedback dispatch or billing-webhook
  evidence/configuration needs operator attention.
- `unavailable`: the database, LiveKit interview readiness, or a dependency
  needed to evaluate durable workflow evidence is unavailable.

`livekit_ready` means the configured core interview agent passes the static
environment boundary. It does not claim that the de-scoped public voice demo is
deployed, configured, or usable. Demo availability is outside version 1 of this
contract.

The HTTP response is exactly `200` for healthy or degraded and exactly `503`
for unavailable. Consumers must evaluate the JSON status; the synthetic rejects
any HTTP/body-status mismatch and treats degraded as failed during relaunch. It
also requires `checkedAt` to round-trip as an exact canonical UTC timestamp.
Each server instance coalesces concurrent checks and reuses a result for at most
ten seconds to bound database load without hiding sustained degradation.

Database evidence checks for feedback dispatches and Stripe webhook rows stuck
for more than ten minutes, plus any unresolved failed work. Failed evidence
outranks stale evidence. Failed Stripe rows are not also classified as stale.
The evidence query runs under a transaction-local PostgreSQL statement timeout;
the store retains one underlying in-flight operation after an application-level
timeout so cache expiry cannot start duplicate database work. It does not infer
health from customer traffic volume or reveal when the last customer event
occurred.

## Compatibility

Consumers must require the exact contract name, version, ordered check set, and
fixed result-code family. Adding or removing a field/check requires a new
version.
