# Account Deletion Operations

Account deletion is asynchronous and durable. The API stores a tombstone, sends
`account/deletion.requested`, clears the local session, and returns HTTP 202.

The request route accepts only `POST` with exact `DELETE` confirmation and a
Supabase `last_sign_in_at` no more than ten minutes old. Stale or missing
server-verified authentication fails closed with `reauthentication_required`;
the user must sign in again and confirm again. Refreshed token timestamps or
client claims are not accepted as proof of recent authentication.

`deletion_requested` means the request is durable and initially queued.
`deletion_retry_scheduled` means the request is durable but the initial enqueue
failed; the recovery cron will retry. Neither status claims provider completion.

The `account-deletion` Inngest function performs these idempotent stages:

1. delete the Supabase Auth user through the server-only service-role client;
2. cancel every captured Stripe subscription when present;
3. delete every captured Stripe customer, including pass-only and historical
   mapped customers;
4. redact matching Stripe webhook payloads and errors while preserving event
   IDs, types, statuses, attempts, and timestamps;
5. remove application data in a database transaction while preserving the
   tombstone, deleting `user_insights` before its `last_session_id` target;
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

- Confirm unconfirmed `DELETE` returns 405 and invalid confirmation returns 400.
- Confirm a sign-in older than ten minutes returns 409 without a tombstone.
- Confirm the API returns 202 and stores a pending tombstone.
- Simulate enqueue failure after persistence and confirm the API returns 202
  `deletion_retry_scheduled`, signs the user out, and recovery requeues it.
- Confirm a second sign-in is rejected with `account_deletion_pending`.
- Confirm an existing second-device session receives the same denial on product
  pages and API calls.
- Confirm the Inngest run reaches completed and the Auth user is absent.
- Confirm application rows are removed while the tombstone remains.
- Simulate a provider failure and verify the record becomes failed and is
  requeued by recovery without duplicate billing or completion side effects.
- Confirm matching Stripe event payload/error fields are redacted and late
  events for a deleted subject are stored without raw payloads.
- Seed an account with an interview session and `user_insights.last_session_id`;
  confirm deletion removes both without a foreign-key failure.
- Confirm a tombstone present before Checkout causes no Stripe list/create call.
- Simulate a tombstone committed immediately after Checkout creation; confirm
  the URL is withheld and the session-expiry call uses a deterministic
  idempotency key. The app requests an approximately 31-minute provider expiry,
  but this is not evidence that a payment cannot complete during the race
  window.
- Replay `checkout.session.completed` with matching user metadata and client
  reference after deletion. Confirm no credit, subscription row, or customer
  mapping is created; the event payload is `{}`; and subscription cancellation
  plus refundable payment reversal are attempted idempotently.
- Replay `customer.subscription.created` or `.updated` without a Checkout
  event. Confirm the subscription is canceled with no local entitlement or raw
  event payload retained.
- Replay `invoice.payment_succeeded` without a Checkout event. Confirm the
  referenced subscription is canceled, the paid PaymentIntent/charge is
  refunded, and the event payload remains `{}`. Checkout, subscription, and
  invoice events must reconcile safely in any order using shared idempotency
  keys.
- Simulate a paid late Checkout without a refundable PaymentIntent/charge.
  Confirm the event remains failed with
  `deleted_checkout_manual_reconciliation_required`, no entitlement is granted,
  and an operator reconciles the payment in Stripe before treating it as done.
- Confirm an API retry that receives `401 account_deletion_pending` is displayed
  as an already-durable request, while an ordinary 401 offers sign-in again.
- Inspect Inngest failure history and confirm provider/database/transcript detail
  is absent; only the stable tombstone failure code is present.

Never manually delete the tombstone before Supabase Auth deletion is confirmed.
Never mark a failed deleted-billing reconciliation processed merely to stop
retries. Resolve or refund the provider payment first, then replay the event.
Completed tombstone retention remains intentionally undefined beyond the
accepted durable-deletion requirement. Do not promise a removal date for the
tombstone, provider records, logs, or backups until an owner/legal decision is
recorded.
