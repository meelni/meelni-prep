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

`GET /api/questions` is always the active published projection. The retired `activeOnly` query parameter is ignored for backward compatibility and can never opt a public caller into inactive history. Round and search filters apply before `limit` and `offset`. The response has these invariants:

- `questions` contains only active published rows matching the complete filter.
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
usage, or LiveKit side effects. Runtime configuration is server-owned and
strips every conflicting round alias, so the resolved canonical session round
and top-level room metadata round remain the only round authorities. A
conflicting compatibility query is ignored; an active question whose stored
type cannot map to a canonical round fails with the stable
`selected_question_round_unavailable` response.
Question-free launches continue to use the candidate-selected or query-provided
round.

If selected intent becomes unavailable, setup presents explicit recovery. The
candidate can choose another question from the safe `returnTo` origin or remove
only `questionId` and continue with all other canonical and compatibility query
parameters intact. Session start repeats the active-record check so a question
deactivated after setup validation cannot be used.

Malformed, missing, inactive, and semantically invalid question intent is
terminal and uses the unavailable recovery state. A `5xx`, network failure, or
response parse failure is temporary. Verification has one bounded deadline
covering both the response and its body; a deadline expiry is also temporary.
Setup retains `questionId`, disables start, explains that verification is
paused, and offers Retry without changing the rest of the launch query. A URL
intent change cancels the superseded verification without presenting it as a
failure for the new question.

## Data rollout

The public contract and all application decisions use the four canonical rounds. Until the historical migration baseline is reconciled, the storage adapter persists canonical Strategy questions with the database-compatible `Product Strategy` label. Reads normalize that label back to `Strategy` before it leaves the data boundary.

The sync stores the original source category separately from the canonical storage label. Public APIs do not expose that category, the source fingerprint, quality status, or duplicate linkage. Existing rows begin with `source_kind = legacy`; a successful live sync adopts matching canonical rows in place so bookmarks, sessions, and selected-question IDs remain stable.

The question-provenance migration generated from the current mainline is provisional while [SAV-241](https://linear.app/saviiii/issue/SAV-241/database-integration-serialize-open-migration-stacks-and-regenerate) serializes open migration stacks. Its sequence, journal entry, snapshot, and schema fingerprint must be regenerated from the actual merged predecessor before this change can merge.

## Sync authorization and execution

- The scheduled route requires an exact `Authorization: Bearer <CRON_SECRET>` header. A missing, blank, placeholder, short, or otherwise weak `CRON_SECRET` fails closed before provider or database work begins.
- The manual route requires a separate `QUESTION_SYNC_OPERATOR_SECRET`. A signed-in Meelni user session, including an ordinary authenticated user, never authorizes a live sync.
- The only accepted manual option is an optional boolean `dryRun`. Unknown options and malformed payloads are rejected.
- Provider rows are fetched and validated before the database transaction opens. The workflow then holds a PostgreSQL transaction-scoped advisory lock while the same transaction reads existing questions, builds the mutation plan, inserts, reactivates, and deactivates. An overlapping request receives `409 question_sync_in_progress` before database reads or writes begin.
- Source provenance is internal-only: `source_kind` identifies the normalized provider class, `source_category` retains the upstream category before taxonomy mapping, and `source_fingerprint` is a SHA-256 digest of normalized non-private source fields. The fingerprint does not contain sheet IDs, URLs, comments, notes, credentials, or user identifiers. PostgreSQL grants anonymous and authenticated roles only the established public question columns; source, quality, and duplicate-link columns require the service role even for published rows.
- Exact duplicates share one source fingerprint and collapse deterministically before planning, independent of provider row order. Near-duplicate automation is intentionally conservative: prompts must have the same company and canonical PM round and differ only by source occurrence time or explicitly normalized quote, sentence-ending punctuation, case, or spacing variation. Normalization uses Unicode NFC, not compatibility folding. Dashes, superscripts, circled numbers, comparison operators, percentages, currency symbols, arithmetic signs, and other meaning-bearing notation remain part of identity. Semantic similarity and edit-distance matching are not automatic quarantine signals.
- One row per near-duplicate content group remains `published` and active. Additional occurrences are stored as inactive `quarantined_near_duplicate` rows linked to the canonical question. Legacy surplus rows become `retired_exact_duplicate`; rows absent upstream become `retired_source_missing`.
- An existing active canonical row wins over a new ID. This preserves bookmarks, session evidence, public question selection, and authentication handoff while its safe provenance fields are refreshed. If multiple legacy active rows match, the lexicographically lowest UUID remains canonical.
- Offset-less Google Forms timestamps are converted using `GOOGLE_SHEET_TIME_ZONE`, which accepts only `UTC` or a fixed `±HH:MM` offset; named zones are rejected to avoid daylight-saving ambiguity.
- `is_active` remains the publication projection and is database-constrained to `quality_status = published`. Public reads, by-ID lookup, new selected-question practice, filters, pagination totals, random selection, structured data, and company/question conversion continue to use that projection. Historical internal/session evidence can retain inactive IDs but must use an explicitly historical adapter. Quality and provenance fields are never added to public payloads.
- Inserts, reactivations, and deactivations are atomic. Any write or connection failure rolls back the complete mutation, and deactivation never proceeds after a failed insert. The bulk-removal safety ratio counts every active-to-inactive transition, including duplicate retirement as well as source-missing retirement.
- HTTP responses and structured audit events contain aggregate counts and stable error codes only. They must not include user identifiers, sheet identifiers, provider response bodies, credentials, or raw exception messages.

The operational configuration and rollout procedure are in [Question sync operations](../operations/question-sync.md).
