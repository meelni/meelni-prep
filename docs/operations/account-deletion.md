# Account Deletion Operations

Account deletion is asynchronous and durable. The API stores a tombstone, sends
`account/deletion.requested`, clears the local session, and returns HTTP 202.

The `account-deletion` Inngest function performs these idempotent stages:

1. delete the Supabase Auth user through the server-only service-role client;
2. cancel every captured Stripe subscription when present;
3. delete every captured Stripe customer, including pass-only and historical
   mapped customers;
4. redact matching Stripe webhook payloads and errors while preserving event
   IDs, types, statuses, attempts, and timestamps;
5. remove application data in a database transaction while preserving the
   tombstone;
6. clear raw provider IDs and mark the tombstone completed.

Failed work is marked with a stable error category and retried. The
`account-deletion-recovery` cron runs every ten minutes and requeues pending,
failed, or processing records stale for at least fifteen minutes.

## Required configuration

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` distinct from the anonymous key
- `STRIPE_SECRET_KEY` when a stored Stripe resource must be removed
- `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`

## Verification

- Confirm the API returns 202 and stores a pending tombstone.
- Confirm a second sign-in is rejected with `account_deletion_pending`.
- Confirm an existing second-device session receives the same denial on product
  pages and API calls.
- Confirm the Inngest run reaches completed and the Auth user is absent.
- Confirm application rows are removed while the tombstone remains.
- Simulate a provider failure and verify the record becomes failed and is
  requeued by recovery without duplicate billing or completion side effects.
- Confirm matching Stripe event payload/error fields are redacted and late
  events for a deleted subject are stored without raw payloads.

Never manually delete the tombstone before Supabase Auth deletion is confirmed.
