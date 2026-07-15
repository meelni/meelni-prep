# Security Audit — November 18, 2025

This document is a historical record. Its original manual SQL-editor
remediation was superseded by the accepted
[database reconciliation decision](../decisions/2026-07-09-reconcile-database-history-and-share-rate-limits.md)
and the canonical [database migration runbook](../operations/database-migrations.md).

## Historical finding

The November 2025 Supabase dashboard audit found missing RLS coverage and
disabled leaked-password protection. It led to early standalone policy files,
but those files were never a safe long-term migration authority and are now
retired.

## Current contract

- The ordered Drizzle journal is the only executable database history.
- RLS, ACLs, unsafe-policy absence, and negative authorization behavior are
  tested on clean and legacy-upgrade databases.
- Authenticated users may read their own transcript turns but cannot write
  them.
- Runtime writer registration, integrity markers, and writer-scoped settlement
  are service-only.
- The signed internal LiveKit ingest route is the only canonical transcript
  writer boundary.
- A rollback must not restore public or authenticated transcript writes.

## Current verification

Use `npm run test:database-migrations` for the disposable PostgreSQL rehearsal
and `npm run auth:doctor:db` for a configured environment. Follow the guarded
Preview/Production process in the database runbook; do not apply historical RLS
snippets manually.

Leaked-password protection is still managed separately in Supabase Auth. See
[PASSWORD_PROTECTION_GUIDE.md](./PASSWORD_PROTECTION_GUIDE.md).
