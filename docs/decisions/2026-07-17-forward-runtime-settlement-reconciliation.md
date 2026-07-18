# Forward Runtime-Settlement Reconciliation

- Status: accepted
- Date: 2026-07-17

## Context

Preview recorded an earlier `0013_runtime_settlement` migration whose SQL and
schema differ materially from the canonical migration now in Git. The ledger
timestamp is canonical, but its hash is historical. Preview has no runtime
writer registry or writer-generation relationships. Read-only inspection proved
that the affected settlement table, canonical version-2 transcript population,
and interruption-marker population are all empty; generic historical transcript
rows may still exist.

Changing the ledger hash would falsely claim that canonical SQL ran. Applying
the canonical migration blindly would infer writer generations from data that
is not present and could accept an unknown partial state.

## Decision

- Keep every existing migration ledger row immutable.
- Accept the historical hash only at the exact `0013` timestamp and only at
  migration counts 23, 24, or the reconciled count 25.
- Pair that lineage identity with exact schema fingerprints in preflight.
- Reconcile through new forward migration
  `0024_runtime_settlement_reconciliation`.
- Let the migration itself classify the exact canonical or exact historical
  shape and fail closed for mixed or unknown states.
- Permit the historical transformation only when all affected evidence tables
  have zero rows. Do not synthesize writer generations.
- Preserve generic transcript rows, recreate the service-only canonical
  runtime tables and relationships, and require the canonical postflight.
- Keep Production and relaunch activation outside this authorization.

## Consequences

- Clean and canonical environments record `0024` as a verified no-op.
- The proven Preview lineage converges without falsifying history.
- Any future nonempty historical runtime evidence requires a separate reviewed
  data-reconciliation decision; this migration will refuse it.
- Migration-bearing PRs stacked after this decision must use `0025` or later.
