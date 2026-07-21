# Database Migrations

Meelni uses one forward-only Drizzle chain. The relaunch reconciliation supports
both an empty database after 0000/0001 and the manually evolved Supabase state.
See [migration history](./migration-history.md) for the retired orphan SQL files.
The current committed journal contains twenty-eight entries, from
`0000_many_nocturne` through `0027_question_provenance`. The migration-history
inventory is checked against `_journal.json` in the local operations suite so
documentation cannot silently drift from the executable chain.

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

These commands are diagnostic and continue to exit successfully for supported
rolling migration states when the schema is valid but launch-readiness counts
are nonzero. The relaunch decision must use strict mode, which prints the same
redacted report and exits nonzero unless the ledger has the exact latest
committed migration count and all stable-start, credit-recovery, and billing
adjustment readiness checks are clean:

```bash
MEELNI_LAUNCH_STRICT=1 npm run db:preflight:preview
MEELNI_LAUNCH_STRICT=1 npm run db:preflight:production
```

Use the bare `npm run db:preflight` command only when an intentionally selected
disposable/local `DATABASE_URL` is already in the shell. Shared Preview and
Production checks must use the scoped aliases above so ambient credentials
cannot redirect the check. Successful output includes the verified
`environmentIdentity` (`local`, `preview`, or `production`).

An environment with no Drizzle migration ledger is eligible for the diagnostic
`ready_for_clean_bootstrap` status only when the catalog also proves that the
public application schema has exactly zero non-extension objects. A partial
schema, an unexpected public object, an ambiguous catalog result, or a catalog
query failure blocks preflight. A present but empty migration ledger stays on
the normal ledger path and is not treated as pristine. Clean-bootstrap status
does not mean launch-ready: strict mode remains red until the canonical chain
has been applied and all post-migration integrity checks pass.

Expected pre-migration status is `ready_to_reconcile` with two ledger entries,
zero unsupported tiers, zero historical `premium_trial_used=true` rows, and
zero duplicate uniqueness groups. Historical premium-trial rows intentionally
block migration until they are archived or backfilled. Expected intermediate
status after the relaunch reconciliation is `ready_for_session_lifecycle` with
six ledger entries. Expected post-migration status is `reconciled` with twenty-eight
ledger entries, 32 RLS-enabled tables, three unique contracts, zero unsafe
entitlement/feedback/transcript policies, and the exact committed schema, RLS,
ACL, limiter-function, interview-lifecycle, atomic-completion, reconnect,
transcript-privacy, runtime-settlement, stable-start, provider-credit-recovery,
billing-truth, webhook-convergence, invoice-convergence,
subscription-resource-convergence, durable LiveKit deletion, feedback-v2,
server-owned billing privilege, explicit-analytics-consent,
runtime-settlement-reconciliation, public-demo-limit, and question-provenance
contract fingerprints.
The four server-owned
billing provenance tables must expose zero table privileges to `PUBLIC`,
`anon`, and `authenticated`, while `service_role` retains all seven PostgreSQL
table privileges on each table. Preflight keeps distinct accepted fingerprints
for every supported migration state so a rolling deployment is diagnosable
without weakening an earlier contract.

The exact historical Preview lineages are also diagnosable without rewriting
history. The original `0013_runtime_settlement` timestamp/hash remains
supported for its guarded forward reconciliation. At counts 26 and 27, the
preflight also accepts the exact original Preview hashes for migrations
0023–0025 as one indivisible triple. Mixed or unknown hashes are rejected.
Migration `0026_preview_lineage_reconciliation` validates that complete triple
before changing data, appends its own ledger row, and converges the historical
and canonical paths to the same schema contract. On the historical path it
refuses to start while any `provisioning` or `ready` public-demo session still
has an active deadline; wait for the old three-minute token window to drain and
rerun. Shortening a database deadline cannot revoke an already-issued LiveKit
token. Never edit, delete, or replace an existing migration ledger row.

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
database-clock provisioning and timeout fences, exact cutoff ownership for rows
staged between migrations 0008 and 0009, and fair progress beyond a 250-row
poison recovery page. The 0009 upgrade mirrors runtime duration normalization:
only numeric JSON values `15`, `30`, and `45` are canonical; missing or legacy
config shapes use the 30-minute fallback, and equality belongs to the hard
deadline.

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
   `DATABASE_URL` cannot redirect the check. For a truly pristine dedicated
   environment, retain the `ready_for_clean_bootstrap` result; do not seed the
   ledger manually or introduce a separate reconciliation history.
4. Confirm the provider backup/point-in-time recovery window and capture a
   schema-only dump outside the repository.
5. Rehearse the upgrade against a disposable clone or the migration test.
6. Run the guarded migration wrapper with the same explicitly selected
   direct/session connection:

   ```bash
   export MEELNI_PRODUCTION_ACTION_AUTHORIZATION=/absolute/external/path/authorization.json
   MEELNI_ALLOW_REMOTE_MIGRATION=1 npm run db:migrate:production
   ```

   The allow flag is necessary but insufficient. Production migration also
   consumes one signed `production-database-migrate` artifact bound to the
   exact Git candidate, migration-set hash, database target fingerprint, and
   enrolled executor before Drizzle starts. Owner tooling now exists, but no
   owner key is enrolled yet, so this Production command currently fails
   closed. Preview migrations do not require owner Production authorization.

   Preview rehearsal uses the distinct alias and applies the same explicit
   confirmation:

   ```bash
   MEELNI_ALLOW_REMOTE_MIGRATION=1 npm run db:migrate:preview
   ```

7. Run strict preflight again; it must report `reconciled`,
   `migrationCount: 28`, and question-provenance schema fingerprint
   `6089186d1df02b3d47f78d9926859a3f6b2aac90e935c9e3d7e56f88fed36af3`.
8. Deploy application code that uses the lifecycle and completion fields only
   after that exact strict preflight passes. A diagnostic rolling-state
   `reconciled` result alone is not deployment authorization.
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
