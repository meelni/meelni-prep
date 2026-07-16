# Security Documentation

Meelni's database security contract is deployed only through the ordered
Drizzle journal in `lib/db/migrations/meta/_journal.json`. Do not copy ad hoc
RLS SQL into the Supabase SQL editor and do not use files under
`supabase/migrations/` as a deployment chain.

Current operational authority:

- [Database migrations](../operations/database-migrations.md) — guarded
  Preview and Production preflight, migration, verification, and rollback.
- [Runtime transcript ingest](../operations/runtime-transcript-ingest.md) —
  service-authenticated writer registration, transcript persistence, and
  writer-scoped integrity settlement.
- [Password protection](./PASSWORD_PROTECTION_GUIDE.md) — Supabase Auth
  password settings.

## Runtime transcript boundary

- Authenticated browser roles may read their own durable transcript turns.
- Authenticated and anonymous roles must not insert, update, or delete
  `transcript_turn` rows.
- `transcript_interruption_marker`, `transcript_runtime_writer`, and
  `transcript_runtime_settlement` are service-only.
- The LiveKit runtime writes through the signed internal ingest route. Direct
  browser transcript mutation is not a supported fallback or rollback.

Verify the committed chain locally with:

```bash
npm run test:database-migrations
npm run auth:doctor
```

For a configured shared environment, use the scoped preflight and guarded
migration commands documented in the database runbook. Only the user makes the
eventual live-mode decision.

## Historical material

The November 2025 audit predates the reconciled migration chain and is retained
only as historical context. Its manual master-script deployment model is
retired and must not be restored.
