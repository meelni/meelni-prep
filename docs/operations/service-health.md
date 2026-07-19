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

Vercel Deployment Protection is expected on Preview. A redirect to Vercel login
is not health evidence and must fail closed; never disable protection or record
the returned HTML. The separately scoped protected-Preview command uses the
automation bypass secret only as an HTTP header and only when the target exactly
matches a configured Meelni branch Preview origin:

```bash
HEALTHCHECK_URL=https://meelni-git-branch-meelni.vercel.app/api/health \
MEELNI_HEALTHCHECK_PREVIEW_ORIGIN=https://meelni-git-branch-meelni.vercel.app \
npm run health:synthetic:protected-preview
```

Keep `VERCEL_AUTOMATION_BYPASS_SECRET` in the operator secret store. The
generic `health:synthetic` command never reads or sends it. The protected
command rejects arbitrary hosts, origin mismatches, hostname confusion,
credentials, ports, query strings, fragments, and redirects before a secret
can follow them.

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

Unresolved failed workflow evidence takes precedence over stale evidence. The
database evidence transaction has a PostgreSQL statement timeout shorter than
the route deadline, and one unresolved underlying read remains single-flight
across application timeout and cache expiry.

Before an isolated rehearsal, execute the exact evidence reader against the
canonical Preview database without writing provider or customer state:

```bash
npm run health:database:preflight
```

The command uses `.env.local`, applies the canonical Supabase Preview identity
guard, refuses Production or an unmarked/mismatched remote database, and emits
only `database_evidence_query_ready`, `database_evidence_query_failed`, or
`database_evidence_query_timeout`. A passing disposable-Postgres test proves
query/schema compatibility; only a real isolated-Preview run proves hosted
connectivity.

The July 2026 Staging 503 was reproduced locally: the evidence reader passed a
JavaScript `Date` directly through the postgres-js bind path, which throws
before PostgreSQL executes the query. The reader now serializes the stale cutoff
to canonical UTC text before binding it. Clean-install and historical-upgrade
migration tests execute the real reader so this driver/schema boundary cannot
silently regress behind SQL-compilation mocks.

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
6. Store the complete evidence bundle outside the repository as a regular,
   single-link, mode-0600 file and verify its sequence and canonical hash:

   ```bash
   HEALTH_REHEARSAL_EVIDENCE_PATH=/absolute/private/evidence.json \
   npm run health:rehearsal:verify
   ```

Run this rehearsal only against the isolated staging/Preview identities proven
by SAV-226. Abort when the environment-identity preflight cannot prove that the
database and provider targets differ from Production.

## Initial Policy

- Poll once per minute during the controlled relaunch window. More frequent
  polling does not improve the five-minute report-freshness contract.
- Page on `unavailable` during the relaunch window.
- Alert on the first `degraded` result during the relaunch window.
- Deduplicate repeated database operational events globally by environment,
  release, operation, and error code until recovery. The application also
  bounds each code to one emission per server isolate per five minutes; this
  is load control, not a replacement for receiver-side deduplication.
- After stable evidence exists, tune consecutive-failure thresholds separately
  for webhook/feedback degradation and core database/LiveKit unavailability.
