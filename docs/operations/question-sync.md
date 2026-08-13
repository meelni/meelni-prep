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

Send credentials through environment variables so the literal value does not appear in the command. The scheduled route performs a live sync only for an exact non-Production target; Production requests remain inert until owner-authorized activation exists:

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

After reviewing aggregate counts, Preview may omit the body or send
`{"dryRun":false}` for a live rehearsal. Production live sync is deliberately
denied on this HTTP route even with the operator bearer credential; use the
exact owner-authorized CLI below. A browser session or Supabase access token is
deliberately insufficient. Responses include `Cache-Control: no-store`.

The local operator command `npm run sync:questions -- --dry-run` and its live
form use this same locked workflow. Production live CLI sync additionally
requires `MEELNI_ENV_FILE=.env.production.local` and an external signed
`production-question-sync-manual` artifact. Its configuration and target hashes
bind the source selection and database without logging either. The CLI accepts
only the optional `--dry-run` flag; verbose source logging is intentionally
unsupported.

## Concurrency and retry behavior

Provider fetch and validation finish before the database transaction opens. The workflow then uses a PostgreSQL transaction-scoped advisory lock while that same transaction reads existing rows, builds the plan, inserts, reactivates, and deactivates. A connection or write failure rolls the complete mutation back. It works with transaction pooling and releases automatically when the transaction finishes. Migration `0027_question_provenance` supplies the internal provenance and quality columns, publication constraint, and safe column-level grants required by this workflow.

An overlapping request may finish its provider fetch, but returns `409 question_sync_in_progress` with `Retry-After: 60` before database reads or writes begin. Wait until the active mutation finishes, then retry.

The provider has no durable row ID. The sync therefore hashes normalized non-private source fields into `source_fingerprint`, retains the original category in `source_category`, and records only the provider class in `source_kind`. Logs and responses expose aggregate counts, never those values.

Exact fingerprints collapse deterministically before planning, regardless of provider row order. Sheet fingerprinting and runtime planning use one shared Unicode NFC vocabulary. A near duplicate must have the same normalized prompt, company, and canonical PM round while differing only in provenance, quote style, terminal sentence punctuation, case, or spacing. Compatibility folding is forbidden: dashes, superscripts, circled numbers, comparison operators, percentages, currency, arithmetic signs, and other meaning-bearing symbols remain distinct. One existing active row remains canonical whenever possible; additional occurrences are stored inactive with `quality_status = quarantined_near_duplicate` and a canonical link. The database enforces that only `published` rows are active. Fuzzy semantic matching is intentionally out of scope and must not silently quarantine questions.

Migration `0027_question_provenance` fails closed for historical data: every previously active row without deterministic source evidence becomes inactive `quarantined_unverified`, while an already inactive row becomes `retired_source_missing`. The first approved live sync can adopt matching rows in place, attach a source fingerprint, and publish the canonical occurrence without changing its ID. Do not enable public activation between applying the migration and completing the reviewed sync.

The 25% bulk-removal guard counts every active row that would become inactive, whether it is source-missing or retired as a duplicate. A dry run that exceeds the guard fails instead of treating duplicate cleanup as exempt.

Source preparation also requires at least one valid question in Product Sense, Behavioral, Execution, and Strategy. A missing round fails with the fixed internal code `question_sync_round_coverage_abort` before the database transaction opens. This prevents a large but categorically incomplete spreadsheet from silently removing an interview round.

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
3. Deploy to Preview and apply the canonical migration chain through `0032_dimension_evidence_coverage`. Confirm strict preflight reports 33 migrations and the dimension-coverage schema fingerprint recorded in the migration runbook. The question-sync behavior continues to depend specifically on `0027_question_provenance`.
4. Verify unauthenticated and ordinary signed-in manual requests fail, then run a manual dry run with the operator credential.
5. Run one Preview live sync in a disposable or approved non-production dataset. Start a second request concurrently and confirm it receives `409` before database work; confirm a sequential retry converges without duplicate composite identities and an inactive unverified identity is adopted and published in place.
6. Generate new, independent Production credentials and run a Production dry
   run. `vercel.json` declares the trigger, but the Production route returns
   `403 production_question_sync_activation_required` before the workflow.
   Enable live scheduled mutation only after the controlled owner-authorized
   adapter exists; do not bypass this through a direct dashboard or CLI mutation.
7. Monitor the first scheduled Production outcome and question-bank quality. Turn on the relaunch feature gate only after the broader launch checklist is complete.

After every approved live sync, require `/api/health` to report `question_bank_ready` and rerun Production deployment preflight. Both Production checks fail closed unless every canonical interview round has at least one published question. Preview builds do not require a copied corpus in their isolated database; Preview runtime health still reports an unavailable question bank until approved non-production data is synced.

The question-sync migration is `0027_question_provenance`; the canonical chain now continues through `0032_dimension_evidence_coverage`. If any migration's predecessor changes or another migration lands first, regenerate the affected SQL, journal entry, snapshot, preflight count, and schema fingerprint before Preview rehearsal. Production application requires a separate exact owner authorization; this runbook does not grant it.

The concurrency rehearsal and live data verification require an approved environment and operator authority; local automated tests cover the fail-closed and overlap branches without touching a provider or remote database.

Manual Production live sync is enforced through the exact owner-authorized CLI;
the HTTP live mutation path returns
`403 production_question_sync_cli_required`. Production scheduled requests
return `403 production_question_sync_activation_required`; a cron declaration
and long-lived bearer secrets alone are not owner authorization. Routine
scheduled sync after a future explicit activation remains a runtime operation
and will not require a new launch decision for every schedule tick.

## Rollback and rotation

To stop sync immediately, disable the deployment schedule and unset or replace both route credentials, then redeploy. Both routes will fail closed. No database rollback is required for the advisory lock because it creates no schema object. If a credential may have been exposed, rotate only that environment's credential, update the authorized caller, redeploy, and verify the old credential receives `401`.
