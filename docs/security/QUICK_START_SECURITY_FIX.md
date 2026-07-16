# Security Quick Start

There is no safe five-minute copy/paste RLS repair. Meelni uses one canonical,
forward-only Drizzle journal so schema, policies, grants, runtime transcript
integrity, and rollback remain consistent.

Start with the [database migration runbook](../operations/database-migrations.md):

```bash
npm run test:database-migrations
npm run auth:doctor
```

For Preview or Production, use only the scoped preflight and guarded migration
commands documented in that runbook. Never paste a legacy master RLS script
into Supabase and never grant authenticated users transcript-write access.

Supabase Auth password protection remains a separate dashboard setting; see
[PASSWORD_PROTECTION_GUIDE.md](./PASSWORD_PROTECTION_GUIDE.md).
