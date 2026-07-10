# Durable Account Deletion

- Status: accepted
- Date: 2026-07-09
- Amended: 2026-07-10

## Context

Account deletion spans Stripe, application data, and Supabase Auth. External
provider calls cannot participate in the Postgres transaction. The prior route
used an anonymous client for Auth Admin deletion, ignored failure, and could
report success while the authentication account remained active.

## Decision

- Persist an `account_deletion_request` tombstone before queueing work.
- Capture every subscription and every Stripe customer mapping, including
  pass-only and legacy multi-customer accounts, as a deduplicated subject list.
- Return `202 deletion_requested`; never claim synchronous completion.
- Process Stripe, application-data, and Auth deletion through an idempotent
  Inngest workflow with per-user concurrency and retries.
- Redact local provider logs and delete application data before calling Supabase
  Auth or Stripe. Provider outages must not extend retention of local product
  data; the tombstone keeps only the typed provider references needed for retry.
- Delete Supabase Auth after local cleanup and before Stripe reconciliation.
  Middleware rejects and signs out every tombstoned session, and OAuth/app-user
  recreation shares a transaction-scoped account identity lock with deletion
  intent, so changing the provider order does not restore product access or
  recreate local identity data.
- Keep the tombstone outside the `app_user` foreign-key graph so it survives
  application-data deletion and blocks user recreation.
- Enforce tombstone denial for password logins and existing sessions in the
  shared middleware, not only in the OAuth callback.
- Requeue pending, failed, or stale processing records every ten minutes.
- Use a server-only Supabase client with a distinct service-role key for Auth
  Admin operations.
- Keep provider error details out of the database; persist only stable failure
  categories.
- Replace raw Stripe identifiers with one-way fingerprints on completion and
  redact matching webhook payload/error data while retaining event idempotency
  metadata.
- Treat the persisted Stripe customer mapping as authoritative provider-subject
  ownership alongside a matching tombstone subject fingerprint. Event metadata
  alone is never ownership proof; Checkout correlation is accepted only when
  metadata and client reference match. Any metadata, Checkout client-reference,
  mapping, or tombstone-fingerprint disagreement fails before active billing or
  destructive cleanup.
- Reconcile invoices through every paginated paid InvoicePayment allocation.
  Exact partial-allocation refunds carry a one-way allocation fingerprint, and
  customer deletion waits for terminal allocation-specific or full-charge
  refund evidence. Unsupported PaymentRecords and ambiguous partial refunds
  remain recoverable for manual reconciliation.

## Consequences

- A failed provider call leaves a recoverable tombstone rather than a live,
  partially recreated account.
- A Supabase Auth or Stripe outage occurs only after local product data and
  matching legacy provider-log payloads have been removed.
- Account deletion now depends on the Inngest route and signing/event keys.
- Completed tombstones retain only the user UUID, status/timestamps, attempts,
  and one-way fingerprints for every provider subject until a separate retention
  decision defines safe removal.
- Stripe resource-missing and Auth user-not-found responses are treated as
  idempotent success during retries.
