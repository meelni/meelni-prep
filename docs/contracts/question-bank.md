# Question Bank Contract

Meelni exposes one question taxonomy aligned to the four PM interview rounds.

| API round key   | Canonical question label |
| --------------- | ------------------------ |
| `product_sense` | `Product Sense`          |
| `behavioral`    | `Behavioral`             |
| `execution`     | `Execution`              |
| `strategy`      | `Strategy`               |

## Boundary normalization

- Public question APIs accept the canonical round keys and common label aliases, including snake case, spaces, and hyphens.
- Google Sheets ingestion maps source categories to one of the four canonical labels before writing a question.
- Question API responses always return a canonical label, even while reading a legacy database row.
- During rollout, reads remain compatible with these legacy labels:
  - `Product design/strategy` maps to `Product Sense`.
  - `A/B Testing`, `Estimation`, and `Pricing` map to `Execution`.
  - `Product Strategy` maps to `Strategy`.

Unknown types are rejected at the API boundary or skipped by ingestion; they are not silently assigned to a round.

## List and pagination semantics

`GET /api/questions` applies round and `activeOnly` filters before `limit` and `offset`. The response has these invariants:

- `questions` contains only rows matching the complete filter.
- `pagination.total` is the count of the complete filtered set, not the count of the current page.
- `pagination.hasMore` is true when the current offset and returned row count have not reached that total.

## Selected-question launch semantics

`GET /api/questions/[id]` accepts a UUID and returns only an active question.
Malformed IDs return `400`; deleted, missing, and inactive records share the
same `404` response. The practice setup surface validates a non-empty selected
question before enabling interview start and renders its question text,
company tag, and canonical round label for confirmation.

For a selected question, the active database record is authoritative for the
round. Setup disables round changes while that intent is attached, and session
start normalizes the persisted question type before user, credit, session,
usage, or LiveKit side effects. A conflicting compatibility query is ignored;
an active question whose stored type cannot map to a canonical round fails with
the stable `selected_question_round_unavailable` response. Question-free
launches continue to use the candidate-selected or query-provided round.

If selected intent becomes unavailable, setup presents explicit recovery. The
candidate can choose another question from the safe `returnTo` origin or remove
only `questionId` and continue with all other canonical and compatibility query
parameters intact. Session start repeats the active-record check so a question
deactivated after setup validation cannot be used.

Malformed, missing, inactive, and semantically invalid question intent is
terminal and uses the unavailable recovery state. A `5xx`, network failure, or
response parse failure is temporary: setup retains `questionId`, disables
start, explains that verification is paused, and offers Retry without changing
the rest of the launch query.

## Data rollout

The public contract and all application decisions use the four canonical rounds. Until the historical migration baseline is reconciled, the storage adapter persists canonical Strategy questions with the database-compatible `Product Strategy` label. Reads normalize that label back to `Strategy` before it leaves the data boundary.

Historical subtype cleanup belongs with the provenance and deduplication work. It must preserve the original source category before any legacy label is collapsed, and it must not be added to the Drizzle journal until the existing manually applied migration history is reconciled safely.

## Sync authorization and execution

- The scheduled route requires an exact `Authorization: Bearer <CRON_SECRET>` header. A missing, blank, placeholder, short, or otherwise weak `CRON_SECRET` fails closed before provider or database work begins.
- The manual route requires a separate `QUESTION_SYNC_OPERATOR_SECRET`. A signed-in Meelni user session, including an ordinary authenticated user, never authorizes a live sync.
- The only accepted manual option is an optional boolean `dryRun`. Unknown options and malformed payloads are rejected.
- Provider rows are fetched and validated before the database transaction opens. The workflow then holds a PostgreSQL transaction-scoped advisory lock while the same transaction reads existing questions, builds the mutation plan, inserts, reactivates, and deactivates. An overlapping request receives `409 question_sync_in_progress` before database reads or writes begin.
- Until the schema gains a provider row identifier, stable source identity is the normalized composite of question text, company, canonical storage type, and `askedAt` instant. Offset-less Google Forms timestamps are converted using `GOOGLE_SHEET_TIME_ZONE`, which accepts only `UTC` or a fixed `±HH:MM` offset; named zones are rejected to avoid daylight-saving ambiguity. Only exact composite duplicates collapse. An inactive exact match is reactivated; changed provenance creates a new row and retires the prior active identity. If legacy data contains multiple active rows for one composite identity, the lexicographically lowest UUID remains active and the surplus rows are deactivated atomically.
- Inserts, reactivations, and deactivations are atomic. Any write or connection failure rolls back the complete mutation, and deactivation never proceeds after a failed insert.
- HTTP responses and structured audit events contain aggregate counts and stable error codes only. They must not include user identifiers, sheet identifiers, provider response bodies, credentials, or raw exception messages.

The operational configuration and rollout procedure are in [Question sync operations](../operations/question-sync.md).
