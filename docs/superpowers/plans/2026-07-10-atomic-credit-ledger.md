# Atomic Credit Ledger

Date: 2026-07-10  
Linear: SAV-228  
Status: implemented and locally verified; Preview rehearsal remains blocked by SAV-226

## Intent

Make every credit grant, reservation, completion, refund, expiration, and
rollover commit completely once or leave no partial state. This is the billing
foundation for SAV-229 and SAV-230; it does not change when an interview becomes
chargeable or how Stripe refunds affect purchased credits.

## Slice Gate

- User outcome: balances cannot lose or invent credits under concurrent starts,
  provider retries, webhook replays, or database failures.
- Workflow owner: the provider-neutral credit ledger service in
  `lib/billing/credits.ts`.
- In scope: transaction-scoped stores, per-user serialization, strict replay
  validation, safe audit-transaction repair, PostgreSQL concurrency and rollback
  tests, and redacted legacy-integrity reporting.
- Out of scope: stable interview start identity and usable-signal consumption
  (SAV-229), terminal provider refunds (SAV-230), and Stripe refund/cancellation
  policy (SAV-231).
- Provider changes: none. No Stripe, Preview, or Production mutation.
- Schema changes: none expected. Existing foreign keys, uniqueness, balance
  checks, and indexes are sufficient for this slice.

## Transaction Contract

Every mutation runs inside `withUserTransaction(userId, callback)`:

1. Begin a PostgreSQL transaction.
2. Lock the owning `app_user` row with `FOR UPDATE` before any ledger row.
3. Re-read and validate the idempotent result inside that transaction.
4. Lock reservations and grants in deterministic order when they participate.
5. Apply balances, allocations, statuses, and audit transactions together.
6. Commit, then emit analytics from the committed result.

Subscription renewal is one composite mutation: eligible prior-cycle credits
are rolled first, then the new cycle grant and explicit completion evidence are
written in the same transaction. The completion evidence records the rollover
key, destination, expiry, source grant, and exact source allocations. A
committed zero-rollover outcome is therefore replayable without treating the
new cycle grant as an old source grant.

The user row is the serialization boundary because every ledger row already
requires an existing user. It also coordinates naturally with account deletion
and avoids advisory-lock key conventions or collision risk. A ledger operation
must never hold more than one user lock.

The memory adapter uses a mutex plus a full snapshot/rollback so unit tests model
transaction failure instead of preserving partial writes.

## Replay And Reconciliation Rules

- Idempotency replays validate owner, catalog/action, source/session, amount,
  explicit expiration, and the persisted result. A key collision never returns
  an unrelated row.
- A missing grant audit transaction may be repaired only when the persisted
  grant proves one exact result. Missing or malformed terminal settlement
  evidence fails closed; reservation status and reserved totals alone cannot
  prove that consume, release, or refund balances were applied.
- A complete pre-transaction legacy rollover may create its missing renewal
  only after exact expiry, source, transaction, and current source-balance
  evidence proves that the rollover debit actually happened.
- Partial or cross-user allocations, unexplained reserved balances, conflicting
  settlement actions, and unreconciled rollover transfers fail closed as
  `credit_ledger_reconciliation_required`.
- Legacy integrity reporting contains counts only. It never logs user IDs,
  Stripe IDs, balances, or other customer data.

## Verification

- Focused in-memory tests for atomic rollback, collision validation, and
  identical replay.
- Real PostgreSQL tests on clean and legacy-upgrade databases for concurrent
  last-credit reservation, grant/rollover replay, consume-versus-release,
  refund replay, and complete snapshot rollback at injected write boundaries.
- `npm run test:billing`
- `npm run test:database-migrations`
- `npm run check:ci`
- `npm run build`
- Independent P0/P1 audit before merge.

Local verification completed with 47 billing tests, application and test
typechecks, the clean and legacy-upgrade PostgreSQL migration suite, a real
concurrent last-credit race, a real composite-renewal rollback injection, and
an unchanged schema fingerprint of
`db50dd715e13bcc70277b98e182c743293d5e6681d30c3d1e84ec24813476500`.
The independent audit found no remaining P0/P1 issue.

## Rollout And Rollback

The relaunch flag remains default-off. Deploying this slice does not migrate or
rewrite existing credit rows. Before relaunch, run the read-only integrity audit
against an isolated Preview database after SAV-226. Ambiguous legacy state must
be reviewed rather than automatically credited or debited.

Rollback reverts application code only. Do not delete ledger rows created while
the transactional implementation was active; their contracts remain compatible
with the existing schema.
