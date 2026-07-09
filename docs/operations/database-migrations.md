# Database Migrations

Meelni uses one forward-only Drizzle chain. The relaunch reconciliation supports
both an empty database after 0000/0001 and the manually evolved Supabase state.
See [migration history](./migration-history.md) for the retired orphan SQL files.

## Connection rules

- Runtime serverless clients use `prepare: false` and at most one connection per
  instance.
- Drizzle migrations require a direct or session connection. Do not migrate
  through a port-6543 transaction-pooler URL.
- `.env.local` normally contains Preview values. Production operations must set
  `MEELNI_ENV_FILE=.env.production.local` explicitly.
- Never run `db:push` against Preview or Production.
- Repository wrappers refuse remote `db:push`, transaction-pooler migrations,
  and ambiguous remote migration/Studio commands.

## Preflight

The preflight uses a read-only transaction, prints only redacted counts and
states, verifies migration hashes, and refuses transaction-pooler URLs:

```bash
npm run db:preflight:preview
npm run db:preflight:production
```

Use the bare `npm run db:preflight` command only when an intentionally selected
disposable/local `DATABASE_URL` is already in the shell. Shared Preview and
Production checks must use the scoped aliases above so ambient credentials
cannot redirect the check.

Expected pre-migration status is `ready_to_reconcile` with two ledger entries,
zero unsupported tiers, zero historical `premium_trial_used=true` rows, and
zero duplicate uniqueness groups. Historical premium-trial rows intentionally
block migration until they are archived or backfilled. Expected post-migration
status is `reconciled` with six ledger entries, 23 RLS-enabled tables, three
unique contracts, zero unsafe entitlement/feedback/transcript policies, and the
exact committed schema, RLS, ACL, and limiter-function contract fingerprint.

## Rehearsal

Before any shared environment:

```bash
npm run test:database-migrations
```

This command accepts only a loopback `*_test` maintenance database. It creates
and removes fresh clean/upgrade databases on every run. CI runs it against a
pinned PostgreSQL 17 container and proves the guarded CLI bootstrap, independent
legacy-fixture upgrade, idempotency, row preservation, exact schema contract,
least-privilege RLS, and shared limiter concurrency.

## Preview and Production rollout

1. Keep the public relaunch gate paused.
2. Pull the intended environment into a gitignored env file.
   Preview uses `npm run env:pull:preview`; Production uses
   `npm run env:pull:production`. A failed or mismatched refresh leaves the
   prior file untouched. Never substitute credentials from another
   environment.
3. Run `npm run db:preflight:preview` or
   `npm run db:preflight:production` and retain its redacted output in the
   Linear issue. These commands explicitly select the file so an ambient shell
   `DATABASE_URL` cannot redirect the check.
4. Confirm the provider backup/point-in-time recovery window and capture a
   schema-only dump outside the repository.
5. Rehearse the upgrade against a disposable clone or the migration test.
6. Run the guarded migration wrapper with the same explicitly selected
   direct/session connection:

   ```bash
   MEELNI_ENV_FILE=.env.production.local \
   MEELNI_ALLOW_REMOTE_MIGRATION=1 \
   npm run db:migrate
   ```

7. Run preflight again; it must report `reconciled`.
8. Deploy application code that calls the new rate-limit function.
9. Verify billing reads, session start/reconnect, transcript capture, feedback,
   question browsing, and account deletion.
10. Monitor limiter 429/503 rates, database connections, query latency, and lock
    waits before activating the relaunch gate.

## Rollback

- Application code may be rolled back while leaving the additive limiter table
  and function in place.
- Do not restore public feedback/transcript writes, authenticated subscription
  updates, the old tier constraint, or non-unique indexes.
- If reconnect code is rolled back to process-local enforcement, keep the public
  relaunch gate paused until shared enforcement is restored.
- Use provider point-in-time recovery only for an actual migration incident;
  validate row counts and policy state before reopening traffic.
