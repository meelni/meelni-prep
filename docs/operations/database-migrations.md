# Database Migrations

Meelni uses one forward-only Drizzle chain. The relaunch reconciliation supports
both an empty database after 0000/0001 and the manually evolved Supabase state.
See [migration history](./migration-history.md) for the retired orphan SQL files.

Open PRs do not reserve sequence numbers independently. Before merging a
migration-bearing PR, require the stable GitHub Actions
`Migration Collision Publisher` job and inspect its exact-head
`Migration Collision / Verify` audit record, then serialize it behind the
actual latest merged migration. Rebase,
regenerate the SQL, `_journal.json`, and snapshot from that predecessor, and
record the exact migration predecessor in the PR body. A green collision check
proves unique open ownership only; it does not prove that a journal or snapshot
was generated from the merged predecessor. See
[Stacked Pull Requests](./stacked-pull-requests.md#cross-pr-migration-ownership).

## Connection rules

- Runtime serverless clients use `prepare: false` and at most one connection per
  instance.
- Drizzle migrations require a direct or session connection. Do not migrate
  through a port-6543 transaction-pooler URL.
- `.env.local` normally contains Preview values. Production operations must set
  `MEELNI_ENV_FILE=.env.production.local` explicitly.
- Shared env files must contain `MEELNI_ENV_PULL_ENVIRONMENT` and the non-secret
  `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF`. Preview database refs must differ
  from the declared Production ref; Production database refs must match it.
  Loopback databases are exempt so local workflows remain independent of
  provider metadata.
- Never run `db:push` against Preview or Production.
- Repository wrappers refuse remote `db:push`, transaction-pooler migrations,
  and ambiguous remote migration/Studio commands.

## Preflight

The preflight uses a read-only transaction, prints only redacted counts and
states, verifies migration hashes, and refuses transaction-pooler URLs. At six
migrations it also previews lifecycle backfill counts by the projected legacy
status after migration, proposed state, and proposed reason; at seven and eight
it reports the applied counts:

```bash
npm run db:preflight:preview
npm run db:preflight:production
```

Use the bare `npm run db:preflight` command only when an intentionally selected
disposable/local `DATABASE_URL` is already in the shell. Shared Preview and
Production checks must use the scoped aliases above so ambient credentials
cannot redirect the check. Successful output includes the verified
`environmentIdentity` (`local`, `preview`, or `production`).

Expected pre-migration status is `ready_to_reconcile` with two ledger entries,
zero unsupported tiers, zero historical `premium_trial_used=true` rows, and
zero duplicate uniqueness groups. Historical premium-trial rows intentionally
block migration until they are archived or backfilled. Expected intermediate
status after the relaunch reconciliation is `ready_for_session_lifecycle` with
six ledger entries. Expected post-migration status is `reconciled` with ten
ledger entries, 23 RLS-enabled tables, three unique contracts, zero unsafe
entitlement/feedback/transcript policies, and the exact committed schema, RLS,
ACL, limiter-function, interview-lifecycle, atomic-completion, and reconnect
contract fingerprint.

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
It also runs ten real completion transactions over independent connections,
proves one feedback/event identity, verifies one dispatch lease winner with
fenced acknowledgements, and repairs terminal-without-feedback state without
changing terminal truth. The reconnect migration rehearsal additionally proves
database-clock provisioning and timeout fences, exact cutoff ownership, and
fair progress beyond a 250-row poison recovery page.

## Preview and Production rollout

1. Keep the public relaunch gate paused.
2. Pull the intended environment into a gitignored env file.
   Preview uses `npm run env:pull:preview`; Production uses
   `npm run env:pull:production`. A failed or mismatched refresh leaves the
   prior file untouched. Never substitute credentials from another
   environment. Before either pull, configure the same non-secret
   `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF` in Vercel Preview and Production.
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
   MEELNI_ALLOW_REMOTE_MIGRATION=1 npm run db:migrate:production
   ```

   Preview rehearsal uses the distinct alias and applies the same explicit
   confirmation:

   ```bash
   MEELNI_ALLOW_REMOTE_MIGRATION=1 npm run db:migrate:preview
   ```

7. Run preflight again; it must report `reconciled`.
8. Deploy application code that uses the lifecycle and completion fields only
   after the migration reports `reconciled`.
9. Verify billing reads, session start/reconnect, transcript capture, feedback,
   question browsing, and account deletion.
10. Monitor limiter 429/503 rates, database connections, query latency, and lock
    waits before activating the relaunch gate.

## Rollback

- Application code may be rolled back while leaving the additive limiter table,
  function, and canonical interview lifecycle columns in place. Preserve
  lifecycle versions and terminal outcomes; do not rewrite them during rollback.
- Do not restore public feedback/transcript writes, authenticated subscription
  updates, the old tier constraint, or non-unique indexes.
- If reconnect code is rolled back to process-local enforcement, keep the public
  relaunch gate paused until shared enforcement is restored.
- Use provider point-in-time recovery only for an actual migration incident;
  validate row counts and policy state before reopening traffic.
