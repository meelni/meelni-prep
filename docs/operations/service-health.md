# Service Health Runbook

## Current Posture

The application exposes `GET /api/health` and a strict endpoint synthetic:

```bash
HEALTHCHECK_URL=https://preview.example/api/health npm run health:synthetic
```

The synthetic prints one closed JSON result and exits nonzero for degraded,
unavailable, malformed, oversized, redirected, or unreachable responses. It
accepts HTTPS, plus loopback HTTP for local tests, and rejects URLs containing
credentials, query strings, or fragments. It requires exact HTTP/body-status
pairings and a canonical UTC timestamp; transport or schema mismatches use the
fixed `health_endpoint_invalid` result.

No scheduler, alert receiver, status vendor, or receipt claim is configured by
this change. Production is owner-launched; service-health evidence and alert
receipt remain independently unproved and must not be inferred from launch
state.

The canonical staging alias returned HTTP 503 on 2026-08-08: web and LiveKit
were healthy while database, feedback dispatch, and Stripe webhook were
unavailable. Treat staging as rehearsal-ineligible until SAV-387 restores the
required dependencies and a fresh healthy result is recorded.

## Check Interpretation

| Check             | Healthy evidence                                     | Degraded/unavailable response                                      |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Web               | The dynamic route executed.                          | Transport failure is detected by the external synthetic.           |
| Database          | Bounded workflow-evidence queries completed in time. | `database_unavailable`; investigate connectivity/migrations.       |
| LiveKit           | Server credentials, URL, and interview agent name.   | `livekit_unavailable`; do not attempt a shared-provider rehearsal. |
| Feedback dispatch | Hosted Inngest config and no stale or failed work.   | Preserve rows; use the feedback recovery workflow.                 |
| Stripe webhook    | Signing config and no stale or failed work.          | Inspect Stripe delivery and redacted durable evidence.             |

Unresolved failed workflow evidence takes precedence over stale evidence. The
database evidence transaction has a PostgreSQL statement timeout shorter than
the route deadline, and one unresolved underlying read remains single-flight
across application timeout and cache expiry.

The endpoint intentionally does not call LiveKit or Stripe. Provider-backed
reachability and the full fresh-user path belong to the controlled Preview
rehearsal and SAV-186 golden-path verification.

## Controlled Preview Rehearsal

Prerequisites:

1. SAV-226 provides an isolated Preview Supabase project.
2. The target deployment, operator, schedule, and alert destination are approved.
3. The shared Production gate remains unchanged, Preview rehearsal authority
   remains inactive until separately authorized, and rollback ownership is
   recorded.

Then:

1. Record one healthy synthetic result.
2. Induce one safe Preview-only configuration or disposable-workflow degradation.
3. Verify the endpoint reports only fixed codes and no sensitive data.
4. Verify the synthetic exits nonzero and the alert is received/acknowledged.
5. Restore configuration, verify healthy recovery, and record timestamps/codes
   without copying raw logs into Linear.

Run this rehearsal only against the isolated staging/Preview identities proven
by SAV-226. Abort when the environment-identity preflight cannot prove that the
database and provider targets differ from Production.

## Initial Policy

- Page on `unavailable` during the relaunch window.
- Alert on the first `degraded` result during the relaunch window.
- After stable evidence exists, tune consecutive-failure thresholds separately
  for webhook/feedback degradation and core database/LiveKit unavailability.
