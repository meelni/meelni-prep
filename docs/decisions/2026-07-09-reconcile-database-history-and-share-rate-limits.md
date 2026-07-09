# Reconcile Database History And Share Rate Limits

- Status: accepted
- Date: 2026-07-09

## Context

The pre-relaunch Supabase database evolved through a mix of two journaled
Drizzle migrations, manual SQL, and schema pushes. Three later SQL files were
not present in Drizzle's journal and could not be replayed safely because their
tables and policies already existed under different names. A clean migration
created only 13 of the 21 application tables and no complete RLS contract.

LiveKit reconnect-token issuance also needs one authoritative per-user budget
across Vercel instances and cold starts. Process-local memory cannot provide
that guarantee.

## Decision

- Keep journaled migrations 0000 and 0001 unchanged.
- Retire the three unjournaled SQL files from the executable directory and
  preserve their hashes and rationale in operations history.
- Use one forward-only `0002_relaunch_reconciliation` migration that supports
  both a clean 0000/0001 database and the manually evolved Supabase state.
- Treat RLS roles, grants, and negative authorization behavior as a tested
  contract rather than relying on Drizzle snapshots to represent them.
- Store LiveKit reconnect attempts in Supabase Postgres and consume them through
  one specialized, atomic, exact 10-in-60-seconds database function keyed only
  by the authenticated user UUID.
- Fail reconnect authorization closed with 503 when the shared limiter is
  unavailable. Do not fall back to process-local enforcement.
- Configure runtime Postgres clients with prepared statements disabled and one
  connection per serverless instance. Migrations continue to require a direct
  or session connection rather than a transaction-pooler URL.
- Explicit environment selection fails closed, overrides ambient database
  variables, and prints only a non-secret target fingerprint.
- Reconciliation blocks rather than dropping historical premium-trial values,
  and postflight validates the exact schema, constraint, index, policy, ACL, and
  limiter-function contract.

## Consequences

- Clean bootstrap and legacy upgrade must both pass the disposable PostgreSQL
  verification in CI.
- Database migration and application rollout are ordered: migrate the target
  environment before deploying code that requires the limiter function.
- Rollback may revert application code while keeping the additive limiter table
  and repaired policies. Restoring the unsafe policies or old tier constraint
  is not a valid rollback.
- Network-level abuse controls remain complementary; Postgres is the authority
  for the authenticated-user budget.
