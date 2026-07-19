# Redacted Observability Runbook

## Current Posture

Meelni emits one-line JSON operational-failure events to server stderr. Vercel captures them in Runtime Logs. The application code does not configure a drain or incident vendor, and it does not claim alert-receipt evidence.

The reporter accepts only fixed classifications plus environment, release, and an ownership-derived interview-session correlation. It never accepts exception text, payloads, transcripts, email, provider IDs, user IDs, tokens, or secrets. Inngest final-failure hooks also emit only the closed event before durable retry/recovery behavior continues.

The relaunch gate remains off until a controlled isolated-Preview failure proves the selected operator receives, acknowledges, and recovers the paired SAV-215 event and SAV-216 health alert.

## Finding Failures

Filter Runtime Logs for:

```text
"event":"meelni_operational_failure"
```

Group only by `environment`, `release`, `operation`, `errorCode`, `severity`, and `retryable`. An owned `correlationId` may connect failures from one interview session; it is not a user or provider identifier.

For a bounded query:

```bash
vercel logs <deployment-url> --level error --since 1h --json
```

Never paste complete logs into tickets. Record the fixed code, release, environment, count, and an opaque correlation only when needed.

## Initial Relaunch Policy

| Signal                                                | Initial policy                                     | Response                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Any `critical` Production event                       | Page on the first event during controlled relaunch | Identify the operation and release; disable the relaunch gate when the core practice path is affected. |
| `feedback_generation_failed`                          | Page on final retry exhaustion                     | Preserve the failed lifecycle row and use the feedback recovery workflow.                              |
| `feedback_dispatch_failed`                            | Page on the first durable failed dispatch          | Preserve the dispatch attempt and retry through the owner-scoped feedback endpoint.                    |
| `stripe_webhook_failed`                               | Page on the first event                            | Check Stripe delivery and the redacted idempotency row before replay.                                  |
| `billing_portal_session_failed`                       | Alert on the first event during relaunch           | Verify Stripe mode and portal configuration without recording customer or provider identifiers.        |
| `billing_portal_subscription_read_failed`             | Alert on the first event during relaunch           | Check the authenticated subscription read using only environment, release, and fixed code.             |
| `billing_portal_customer_lookup_failed`               | Alert on a sustained increase                      | Check provider reachability and account/mode alignment using authenticated tools; do not copy IDs.     |
| `billing_read` failures                               | Alert on a sustained increase                      | Check database and billing-read health using only the fixed route error code and release.              |
| `question_sync_failed` or `question_sync_unavailable` | Alert after two consecutive scheduled runs         | Keep the existing public corpus; do not run an unguarded mutation.                                     |
| `auth_code_exchange_failed`                           | Alert on a sustained increase                      | Verify provider callback configuration without capturing codes or user data.                           |
| `interview_recovery` failures                         | Page on final retry exhaustion during relaunch     | Preserve durable session/credit state and inspect the matching recovery workflow.                      |

Tune thresholds only after isolated Preview and early controlled traffic evidence.

## Controlled Preview Rehearsal

Prerequisites:

1. Use the isolated Preview Supabase/provider identities from SAV-226.
2. Name the target deployment, operator, and alert destination.
3. Record the Preview release and confirm the relaunch gate remains off.

Then induce one safe Preview-only failure that cannot touch Production or incur a customer charge. Verify exactly one expected event, matching environment/release, null request ID, only ownership-valid correlation, absence of sensitive content, alert receipt/acknowledgement, and healthy recovery.

## Rollback

Instrumentation is additive. If the sink becomes noisy or unavailable, remove or disable the external receiver before changing product workflows. Reporter failure is already isolated and cannot change API or workflow outcomes.
