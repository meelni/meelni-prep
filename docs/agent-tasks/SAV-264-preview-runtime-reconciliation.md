# SAV-264 — Preview runtime-settlement reconciliation

## Intent

Restore the isolated Preview database to the canonical runtime-settlement
contract without rewriting migration history or inferring missing transcript
writer evidence.

## Slice

- Recognize only the exact historical Preview `0013_runtime_settlement` ledger
  hash at its canonical timestamp and the exact legacy schema fingerprints at
  counts 23 and 24.
- Add one forward-only `0024_runtime_settlement_reconciliation` migration.
- Require zero historical settlement rows, zero canonical version-2 transcript
  turns, and zero interruption markers before changing the legacy shape.
- Preserve generic transcript rows and converge to the canonical count-25
  schema contract.
- Reject unknown, partial, mixed, or nonempty shapes atomically.

Production, application behavior, provider configuration, and the relaunch
feature flag are out of scope.

## Validation

- `npm run test:database-migrations`
- `node --test scripts/migration-docs-contract.test.mjs`
- `npm run db:check`
- `npm run typecheck`
- Preview diagnostic preflight before migration and strict Preview preflight
  after migration, with only redacted evidence retained.

The disposable-database suite proves clean-chain no-op behavior, exact legacy
hash and schema recognition, consent-first reconciliation, mixed-state
rollback, ledger preservation, strict postflight, and preservation of generic
historical transcript rows.

## Rollout

1. Keep the relaunch gate off.
2. Confirm a current Preview backup and retain a schema-only dump outside the
   repository.
3. Require the exact legacy count-23 or count-24 preflight result.
4. Apply the guarded Preview migration from the reviewed exact commit.
5. Require strict count-25 preflight and the converged schema fingerprint.

Do not run this migration in Production without separate owner authorization.
Rollback is provider recovery from the captured Preview backup only if the
atomic migration itself succeeds but an independent postflight later exposes a
provider-level incident.
