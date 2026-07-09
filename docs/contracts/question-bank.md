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

## Data rollout

The public contract and all application decisions use the four canonical rounds. Until the historical migration baseline is reconciled, the storage adapter persists canonical Strategy questions with the database-compatible `Product Strategy` label. Reads normalize that label back to `Strategy` before it leaves the data boundary.

Historical subtype cleanup belongs with the provenance and deduplication work. It must preserve the original source category before any legacy label is collapsed, and it must not be added to the Drizzle journal until the existing manually applied migration history is reconciled safely.
