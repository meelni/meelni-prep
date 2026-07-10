# Google Sheets Question Source

The question-bank source supports either a published CSV URL or an authenticated Google Sheets API source. Configure exactly one source path in the deployment secret manager.

## Published CSV source

- `GOOGLE_SHEET_CSV_URL`

The sheet must expose the expected columns for timestamp, company, question text, question type, interview type, comments, and notes. Treat the URL as operational configuration even when the sheet is published; do not paste it into tickets, logs, or chat.

## Authenticated API source

- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_NAME`
- `GOOGLE_SHEET_TIME_ZONE` (`UTC` or a fixed `±HH:MM` offset for offset-less Google Forms timestamps)
- One supported credential mechanism: `GOOGLE_SHEETS_API_KEY`, `GOOGLE_SHEETS_CREDENTIALS_BASE64`, `GOOGLE_SHEETS_CREDENTIALS`, or the service-account email/private-key pair.

Keep credentials server-only and grant the source identity read access only. Provider errors and source identifiers are redacted from sync responses and outcome logs.

Named timezones are not accepted because daylight-saving overlaps make offset-less timestamps ambiguous. Prefer timestamps that include their own offset. Otherwise configure the fixed offset used by the source sheet; the safe default is `UTC`.

## Operations

Do not invoke sync from this integration note. Use [Question sync operations](../operations/question-sync.md) as the sole executable runbook for dry runs, live sync, authorization, concurrency verification, rollout, and rollback. Ordinary Meelni sessions and cookies never authorize manual sync.
