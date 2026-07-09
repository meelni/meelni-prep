# Durable Account Deletion

- Status: accepted
- Date: 2026-07-09

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
- Delete Supabase Auth first so Stripe outages cannot leave a tombstoned account
  authenticated; provider identifiers are already captured for later retries.
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

## Consequences

- A failed provider call leaves a recoverable tombstone rather than a live,
  partially recreated account.
- Account deletion now depends on the Inngest route and signing/event keys.
- Completed tombstones retain only the user UUID, status/timestamps, attempts,
  and one-way fingerprints for every provider subject until a separate retention
  decision defines safe removal.
- Stripe resource-missing and Auth user-not-found responses are treated as
  idempotent success during retries.
