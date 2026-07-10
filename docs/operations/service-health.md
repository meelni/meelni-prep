# Service Health Runbook

## Current Posture

The application exposes `GET /api/health` and a strict endpoint synthetic:

```bash
HEALTHCHECK_URL=https://preview.example/api/health npm run health:synthetic
```

The synthetic prints one closed JSON result and exits nonzero for degraded,
unavailable, malformed, oversized, redirected, or unreachable responses. It
accepts HTTPS, plus loopback HTTP for local tests, and rejects URLs containing
credentials, query strings, or fragments.

No scheduler, alert receiver, status vendor, or receipt claim is configured by
this change. The relaunch gate remains off until a controlled isolated-Preview
degradation is received and acknowledged by an approved operator destination.

## Check Interpretation

| Check             | Healthy evidence                                     | Degraded/unavailable response                                      |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Web               | The dynamic route executed.                          | Transport failure is detected by the external synthetic.           |
| Database          | Bounded workflow-evidence queries completed in time. | `database_unavailable`; investigate connectivity/migrations.       |
| LiveKit           | Server credentials, URL, and interview agent name.   | `livekit_unavailable`; do not attempt a shared-provider rehearsal. |
| Feedback dispatch | Hosted Inngest config and no stale or failed work.   | Preserve rows; use the feedback recovery workflow.                 |
| Stripe webhook    | Signing config and no stale or failed work.          | Inspect Stripe delivery and redacted durable evidence.             |

The endpoint intentionally does not call LiveKit or Stripe. Provider-backed
reachability and the full fresh-user path belong to the controlled Preview
rehearsal and SAV-186 golden-path verification.

## Controlled Preview Rehearsal

Prerequisites:

1. SAV-226 provides an isolated Preview Supabase project.
2. The target deployment, operator, schedule, and alert destination are approved.
3. The relaunch flag remains off and rollback ownership is recorded.

Then:

1. Record one healthy synthetic result.
2. Induce one safe Preview-only configuration or disposable-workflow degradation.
3. Verify the endpoint reports only fixed codes and no sensitive data.
4. Verify the synthetic exits nonzero and the alert is received/acknowledged.
5. Restore configuration, verify healthy recovery, and record timestamps/codes
   without copying raw logs into Linear.

Do not run this rehearsal against the currently shared Production database.

## Initial Policy

- Page on `unavailable` during the relaunch window.
- Alert on the first `degraded` result during the relaunch window.
- After stable evidence exists, tune consecutive-failure thresholds separately
  for webhook/feedback degradation and core database/LiveKit unavailability.
