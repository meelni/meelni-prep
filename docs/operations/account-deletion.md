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
Durable persistence is also the immediate product-access cutoff: middleware
denies current and future sessions with `account_deletion_pending` while every
cleanup stage remains retryable.

The `account-deletion` Inngest function performs these idempotent stages:

1. redact matching Stripe webhook payloads and errors while preserving event
   IDs, types, statuses, attempts, and timestamps;
2. remove application data in a database transaction while preserving the
   tombstone, deleting `user_insights` before its `last_session_id` target;
3. cancel captured Stripe subscriptions without proration and never create an
   automatic invoice, PaymentIntent, charge, or customer-balance refund;
4. delete the Supabase Auth user through the server-only service-role client;
5. terminate every captured LiveKit room with durable, retryable cleanup;
6. delete every captured Stripe customer, including pass-only and historical
   mapped customers, only after subscription cancellation;
7. clear only processed raw provider IDs and mark the tombstone completed, or
   leave concurrent late references recoverable.

Local data and legacy provider-log payloads are removed before external Auth or
Stripe calls. A provider outage therefore does not extend local retention: the durable
tombstone preserves only the typed provider references needed for retries.

Failed work is marked with a stable error category and retried. The
`account-deletion-recovery` cron runs every ten minutes and requeues pending,
failed, or processing records stale for at least fifteen minutes.

Tombstone creation and Stripe event ingestion serialize on every hashed
provider-subject fingerprint. Database triggers redact payload and error fields
before insertion whenever a matching tombstone exists; the deletion transaction
also redacts any event that committed immediately before the tombstone. This is
the invariant that closes the late-webhook race, rather than delivery timing.

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
- Immediately after tombstone persistence, confirm all product pages and API
  calls deny the original and second-device sessions even while the worker is
  paused or failed; unused credits must not be readable or redeemable.
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
  mapping is created; the event payload is `{}`; subscription cancellation and
  customer cleanup are attempted idempotently; and no refund API is called.
- Replay a signed Checkout event with mismatched metadata and
  `client_reference_id`, and replay a subscription/invoice event whose metadata
  disagrees with the persisted customer mapping. Confirm both fail before any
  event-log, tombstone, entitlement, cancellation, or customer mutation.
- Replay `customer.subscription.created` or `.updated` without a Checkout
  event. Confirm the subscription is canceled without proration, the customer
  is cleaned up, and no local entitlement, raw event payload, or automatic
  refund is created.
- Replay `invoice.payment_succeeded` without a Checkout event. Confirm the
  referenced subscription is canceled without proration, no refund API is
  called, no entitlement is granted, and the event payload remains `{}`.
- For each late Checkout/subscription/invoice event, confirm subscription
  cancellation finishes before the Stripe customer deletion call. On cleanup
  failure, confirm the tombstone retains raw cleanup IDs and becomes recoverable;
  on retry success, confirm only fingerprints remain.
- Fail cancellation and customer deletion. Confirm each failure retains the
  required typed subscription/customer references, marks the tombstone
  recoverable, and that recovery retries cancel → customer delete before
  clearing raw IDs.
- Pause a deletion worker after it reads its subject snapshot, append late
  invoice/payment/customer subjects, then complete the worker. Confirm only the
  original snapshot is fingerprint-only, the late subjects remain recoverable,
  and a recovery pass clears them only after ordered provider reconciliation.
- Seed a malformed subject kind/value in a disposable database and confirm the
  deletion read fails closed with a stable error; it must not complete after
  silently dropping the corrupt reference.
- Seed a validly fingerprinted subject whose kind does not match its provider
  prefix (for example, a `sub_` ID labeled as a customer) and confirm parsing
  fails closed before any provider call.
- Hold the account identity lock while a callback upsert races deletion intent;
  commit the tombstone and local-user removal, then confirm the waiting upsert
  is denied and cannot recreate `app_user`.
- Replay a paid late Checkout and invoice event after deletion intent. Confirm
  the related subscription is canceled without proration, no refund API is
  called, no entitlement is granted, and customer cleanup completes.
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
- Simulate a paid late Checkout without a PaymentIntent/charge reference.
  Confirm it completes without granting entitlement or creating a refund.
- Confirm an API retry that receives `401 account_deletion_pending` is displayed
  as an already-durable request, while an ordinary 401 offers sign-in again.
- Inspect Inngest failure history and confirm provider/database/transcript detail
  is absent; only the stable tombstone failure code is present.
- Exercise both transaction orders (webhook first and tombstone first) and
  confirm no committed matching row retains payload or error content.

Never manually delete the tombstone before Supabase Auth deletion is confirmed.
Never issue an automatic refund from account-deletion recovery. Any exceptional
refund decision follows [Manual Exceptional Refunds](./manual-exceptional-refunds.md),
but execution for an existing account remains paused until SAV-231 provides
verified payment-to-credit-ledger reconciliation.
The accepted deletion exception ends paid product access at durable intent,
before provider cleanup completes. Rehearse access denial and retryable
`prorate=false` cancellation together; never delay denial until Stripe succeeds
and never convert a cleanup retry into compensation.
Completed tombstone retention remains intentionally undefined beyond the
accepted durable-deletion requirement. Do not promise a removal date for the
tombstone, provider records, logs, or backups until an owner/legal decision is
recorded.
