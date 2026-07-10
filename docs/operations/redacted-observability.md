# Redacted Observability Runbook

## Current posture

Meelni emits one-line JSON operational-failure events to server stderr. Vercel captures them in Runtime Logs. No external drain, incident vendor, or alert receiver is configured by this code change.

The relaunch gate must remain off until a controlled isolated-Preview failure proves that the selected operator can receive and act on alerts. Do not generate that failure against the current shared Production database.

## Finding failures

Filter Runtime Logs for:

```text
"event":"meelni_operational_failure"
```

Then group by `environment`, `release`, `operation`, and `errorCode`. Use
`requestId` to correlate a single Vercel invocation. `correlationId` is present
only after a stored interview session is authenticated as owned by the caller;
pre-lookup configuration, rate-limit, authorization, and malformed-request
failures deliberately omit it.

On plans without Drains, use the Vercel deployment Logs view or a bounded CLI query:

```bash
vercel logs <deployment-url> --level error --since 1h --json
```

Never paste complete logs into tickets. Record counts, error codes, release, environment, and opaque IDs only.

## Initial alert policy

| Signal                                                | Initial policy                                           | Response                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `severity=critical` in Production                     | Page on the first event during relaunch                  | Inspect the release and operation; disable the relaunch flag if the golden path is affected. |
| `feedback_dispatch_exhausted`                         | Page on the first event                                  | Preserve the failed lifecycle row; do not regenerate manually without the dispatch runbook.  |
| `stripe_webhook_failed`                               | Page on the first event                                  | Check Stripe delivery status and the redacted idempotency row before retrying.               |
| `question_sync_failed` or `question_sync_unavailable` | Alert after 2 consecutive scheduled runs                 | Keep the existing public corpus; do not run an unguarded manual mutation.                    |
| `auth_code_exchange_failed`                           | Alert on a sustained increase, not a single cancellation | Verify provider callback configuration without logging codes or user data.                   |

Tune thresholds only after isolated Preview and early Production evidence. A zero-history threshold is an operational starting point, not a product SLO.

Stripe idempotency rows contain no provider payload or raw exception text for
new deliveries. Operators can use event type, status, attempts, timestamps,
and the one-way subject fingerprint; Stripe remains the source for delivery
payload details. Migration `0008_redact_stripe_event_observability` scrubs
existing rows; account deletion keeps a legacy-row redaction fallback.

## Controlled Preview rehearsal

Prerequisites:

1. SAV-226 isolated Preview Supabase is complete.
2. A named operator and alert destination are approved.
3. The Preview release and relaunch flag state are recorded.

Rehearse one safe configuration failure that cannot mutate Production or incur a customer charge. Verify:

- exactly one expected structured event;
- environment and release match Preview;
- request/correlation IDs are opaque;
- no transcript, email, user ID, auth code, token, provider payload, or secret appears;
- the alert is received and acknowledged;
- recovery produces no new error event.

## Drain/integration decision

Vercel Drains require a supported plan and an approved destination. If a drain is selected later, verify its signature at the raw-body boundary and store the signing secret only in environment configuration. Do not create a drain until retention, access, destination, and cost are approved.
