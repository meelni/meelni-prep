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

1. redact matching Stripe webhook payloads and errors while preserving event
   IDs, types, statuses, attempts, and timestamps;
2. remove application data in a database transaction while preserving the
   tombstone, deleting `user_insights` before its `last_session_id` target;
3. delete the Supabase Auth user through the server-only service-role client;
4. cancel captured Stripe subscriptions and refund any typed late
   invoice/PaymentIntent/charge references;
5. delete every captured Stripe customer, including pass-only and historical
   mapped customers, only after financial reconciliation;
6. clear only processed raw provider IDs and mark the tombstone completed, or
   leave concurrent late references recoverable.

Local data and legacy provider-log payloads are removed before external Auth or
Stripe calls. A provider outage therefore does not extend local retention: the durable
tombstone preserves only the typed provider references needed for retries.

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
- Confirm every new Stripe event log stores `{}` rather than a raw webhook
  payload, including when deletion commits between the initial tombstone check
  and fulfillment.
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
- For each late Checkout/subscription/invoice event, confirm financial
  reconciliation finishes before the Stripe customer deletion call. On cleanup
  failure, confirm the tombstone retains raw cleanup IDs and becomes recoverable;
  on retry success, confirm only fingerprints remain.
- Fail cancellation, invoice lookup, and refund before customer deletion.
  Confirm each failure retains explicit typed subscription/invoice/payment/
  customer references, marks the tombstone recoverable, and that the recovery
  worker retries cancel → refund → customer delete before clearing raw IDs.
- Pause a deletion worker after it reads its subject snapshot, append late
  invoice/payment/customer subjects, then complete the worker. Confirm only the
  original snapshot is fingerprint-only, the late subjects remain recoverable,
  and a recovery pass clears them only after ordered provider reconciliation.
- Seed a malformed subject kind/value in a disposable database and confirm the
  deletion read fails closed with a stable error; it must not complete after
  silently dropping the corrupt reference.
- Manually model a partially refunded PaymentIntent and charge, then replay the
  event. Confirm Stripe is asked to refund the remaining amount, provider state
  is retrieved, and customer cleanup proceeds only after the total is fully
  refunded. Model a response that remains partial and confirm the event stays
  failed, cleanup does not run, and the retry reference remains.
- Model a full-amount refund with Stripe status `pending`. Confirm the event and
  tombstone remain recoverable and customer cleanup does not run. After a
  `refund.updated` transition to `succeeded`, allow the ten-minute recovery
  worker or an operator replay of the original billing event to confirm the
  succeeded total and finish cleanup without another refund. After a transition
  to `failed`, confirm replay requests the remainder with a new deterministic
  attempt key and still requires terminal `succeeded` evidence before cleanup.
- Replay older subscription-deleted and invoice success/failure events after a
  newer subscription state. Confirm payment history remains idempotent and the
  older event cannot overwrite the newer subscription state.
- Replay subscription deletion and invoice/update events for the same provider
  subscription with the exact same timestamp in both arrival orders. Confirm
  cancellation wins the tie and no same-second invoice/update can reactivate
  that resource. Then create a distinct subscription at the same timestamp and
  confirm it can replace the canceled resource in either arrival order, while
  the old subscription's delayed deletion/update cannot mutate the new one.
- For a legacy subscription row with a null Stripe subscription ID, confirm a
  correlated `subscription.created` event scopes and reactivates the row.
  Confirm delete/update/invoice events with a specific subscription ID fail
  closed until the billing sync route backfills the current resource identity.
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
