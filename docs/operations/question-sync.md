# Question Sync Operations

This runbook is the canonical operator procedure for the Google Sheets question-bank sync. The routes fail closed: no provider read or database write is attempted unless the relevant server-only credential is strongly configured and supplied exactly.

## Credentials

Configure two independent server-only credentials in each environment:

- `CRON_SECRET` authorizes `GET /api/cron/sync-questions`.
- `QUESTION_SYNC_OPERATOR_SECRET` authorizes `POST /api/cron/sync-questions/manual`.

Set `GOOGLE_SHEET_TIME_ZONE` to the fixed timezone used by offset-less Google Forms timestamps. It defaults to `UTC` and accepts only `UTC` or a numeric `±HH:MM` offset. Named IANA zones are intentionally rejected because repeated or skipped wall-clock times at daylight-saving transitions cannot provide a stable source identity. If the form's offset changes seasonally, change the sheet to emit explicit timestamp offsets rather than using a named zone.

Do not reuse either credential for product authentication or for another integration. Values must be 32–256 non-whitespace characters, must not resemble a placeholder, and must contain at least eight distinct characters. Generate each value independently, for example:

```bash
openssl rand -base64 48 | tr -d '\n'
```

Store values only in the deployment secret manager and a password manager approved for operator access. Never place them in source, tickets, shell history, logs, screenshots, or chat. A missing or invalid configured value returns `503 question_sync_not_configured`.

## Invocation

Send credentials through environment variables so the literal value does not appear in the command. The scheduled route always performs a live sync:

```bash
curl --fail-with-body \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${MEELNI_BASE_URL}/api/cron/sync-questions"
```

Use the independent operator credential for a manual dry run:

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer ${QUESTION_SYNC_OPERATOR_SECRET}" \
  -H "Content-Type: application/json" \
  --data '{"dryRun":true}' \
  "${MEELNI_BASE_URL}/api/cron/sync-questions/manual"
```

After reviewing aggregate counts, omit the body or send `{"dryRun":false}` for a live manual sync. A browser session or Supabase access token is deliberately insufficient; only the operator bearer credential authorizes this route. Responses include `Cache-Control: no-store`.

The local operator command `npm run sync:questions -- --dry-run` and its live form use this same locked workflow. The CLI accepts only the optional `--dry-run` flag; verbose source logging is intentionally unsupported.

## Concurrency and retry behavior

Provider fetch and validation finish before the database transaction opens. The workflow then uses a PostgreSQL transaction-scoped advisory lock while that same transaction reads existing rows, builds the plan, inserts, reactivates, and deactivates. A connection or write failure rolls the complete mutation back. It works with transaction pooling and releases automatically when the transaction finishes. No schema migration is required.

An overlapping request may finish its provider fetch, but returns `409 question_sync_in_progress` with `Retry-After: 60` before database reads or writes begin. Wait until the active mutation finishes, then retry.

The provider has no durable row ID. The sync therefore hashes normalized non-private source fields into `source_fingerprint`, retains the original category in `source_category`, and records only the provider class in `source_kind`. Logs and responses expose aggregate counts, never those values.

Exact fingerprints collapse before planning. A near duplicate must have the same normalized prompt, company, and canonical PM round while differing only in provenance or harmless formatting. One existing active row remains canonical whenever possible; additional occurrences are stored inactive with `quality_status = quarantined_near_duplicate` and a canonical link. The database enforces that only `published` rows are active. Fuzzy semantic matching is intentionally out of scope and must not silently quarantine questions.

Dry-run and live responses report `invalidRows`, `exactDuplicateRows`, `nearDuplicateRowsQuarantined`, and `duplicateRecordsRetired` alongside the existing add/update/deactivate totals. Repeating the same source snapshot must produce no new rows or canonical IDs.

## Responses and audit events

Expected failures are intentionally terse:

| Status | Code                           | Operator action                                                                |
| ------ | ------------------------------ | ------------------------------------------------------------------------------ |
| `503`  | `question_sync_not_configured` | Configure a valid environment-specific secret and redeploy.                    |
| `401`  | `question_sync_unauthorized`   | Check the exact Bearer scheme and the route-specific credential.               |
| `400`  | `invalid_request`              | Send an empty body or JSON with only an optional boolean `dryRun`.             |
| `415`  | `unsupported_media_type`       | Use `application/json` when sending options.                                   |
| `409`  | `question_sync_in_progress`    | Wait for the active attempt, then retry.                                       |
| `503`  | `question_sync_unavailable`    | Check database connectivity and lock availability; no sync work was performed. |
| `500`  | `question_sync_failed`         | Inspect server-side aggregate audit events and provider/database health.       |

The server emits a `question_sync_audit` JSON event containing trigger, dry-run state, outcome, duration, aggregate counts, or a stable error code. It intentionally omits raw exceptions, provider bodies, source identifiers, credentials, and user data. Keep log access limited to operators.

## Relaunch rollout

1. Keep the global relaunch feature gate off while validating the sync path.
2. Generate independent Preview credentials and configure the Preview cron and operator secrets.
3. Deploy to Preview. Verify unauthenticated and ordinary signed-in manual requests fail, then run a manual dry run with the operator credential.
4. Run one Preview live sync in a disposable or approved non-production dataset. Start a second request concurrently and confirm it receives `409` before database work; confirm a sequential retry adds no rows, retains canonical IDs, and reports stable exact/near-duplicate aggregate counts.
5. Generate new, independent Production credentials, configure the Production schedule, deploy, and run a Production dry run. Review only aggregate counts before enabling the schedule.
6. Monitor the first scheduled Production outcome and question-bank quality. Turn on the relaunch feature gate only after the broader launch checklist is complete.

The current question-provenance migration number is provisional and blocked by SAV-241. Regenerate its SQL, journal entry, snapshot, preflight count, and schema fingerprint from the actual merged predecessor before any Preview or Production migration rehearsal.

The concurrency rehearsal and live data verification require an approved environment and operator authority; local automated tests cover the fail-closed and overlap branches without touching a provider or remote database.

## Rollback and rotation

To stop sync immediately, disable the deployment schedule and unset or replace both route credentials, then redeploy. Both routes will fail closed. No database rollback is required for the advisory lock because it creates no schema object. If a credential may have been exposed, rotate only that environment's credential, update the authorized caller, redeploy, and verify the old credential receives `401`.
