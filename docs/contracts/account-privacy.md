# Account Privacy Contract

## Account export

`GET /api/user/export` requires a server-verified authenticated user and returns
one JSON attachment scoped to that user. The payload version is `1.0.0` and is
defined by `ACCOUNT_EXPORT_SCHEMA_VERSION` in `@meelni/core`.

The export includes:

- account identity, profile, preferences, and practice streak;
- mock interviews, selected questions, transcripts, and feedback;
- bookmarks, practice sets, achievements, and saved progress insights;
- subscription, usage, payment summaries, and credit-ledger summaries.

The export excludes:

- passwords, tokens, API keys, Supabase service-role credentials, and auth
  session material;
- Stripe, Supabase, and LiveKit resource identifiers that exist only for
  provider operations;
- raw Stripe webhook payloads, provider/admin errors, receipt URLs, metadata,
  idempotency keys, and background dispatch state;
- rate-limit state, deletion tombstones, one-way provider fingerprints, logs,
  and backup contents;
- other users and the full shared question bank.

The database adapter selects allowed fields rather than selecting whole rows and
then trying to remove sensitive values. User-authored/generated JSON is also
recursively stripped of sensitive operational key names before serialization.
The response is `private, no-store`, uses `nosniff`, and has a server-selected
attachment filename.

Generating an export is a read-only operation. It does not delete data or create
a durable export artifact on the server.

## Account deletion request

`POST /api/user/delete` accepts only the exact body:

```json
{ "confirmation": "DELETE" }
```

The route requires:

1. a user verified by server-side Supabase `getUser()`;
2. `last_sign_in_at` no more than ten minutes old at request time; and
3. the exact destructive confirmation.

Missing, invalid, future, or stale authentication timestamps fail closed with
HTTP `409` and `reauthentication_required`. The client must complete a fresh
sign-in and collect confirmation again. Client-provided timestamps, access-token
refresh time, and UI state are not authentication-freshness evidence.

After persistence:

- HTTP `202 deletion_requested` means the durable tombstone exists and cleanup
  was queued. It does not mean provider cleanup is complete.
- HTTP `202 deletion_retry_scheduled` means the durable tombstone exists but the
  initial enqueue failed; the recovery workflow owns automatic retry.
- A non-202 failure means the request was not confirmed as durable and the UI
  must offer a retry without claiming deletion.
- A later HTTP `401 account_deletion_pending` is also durable-request truth. It
  can occur when the original 202 response was lost after tombstone commit; the
  UI must show cleanup pending rather than claim that the request was not saved.
- An ordinary HTTP 401 for export or deletion is an expired/absent session and
  must offer a safe sign-in path back to Data & privacy.

The unconfirmed `DELETE` method returns `405`. Provider/admin error details are
never returned to the client or stored in the tombstone; only stable categories
are persisted.

Application cleanup removes `user_insights` before its referenced interview
session because `user_insights.last_session_id` is a `NO ACTION` foreign key.
The account-deletion job normalizes provider, redaction, and application errors
inside the Inngest step boundary so raw database/provider messages do not enter
job history; the tombstone and job retain only a stable failure code.

## Checkout and deletion concurrency

Checkout is bound to the server-verified user in both
`client_reference_id` and metadata. A durable deletion tombstone blocks provider
Checkout calls. Because a database check cannot be atomic with Stripe, the app
checks again after acquiring a Checkout Session; when deletion won that race,
the URL is withheld and the session is expired with a deterministic idempotency
key. New sessions also request an approximately 31-minute expiry, one minute
above Stripe's documented minimum so request latency cannot invalidate it. That
expiry narrows exposure but is not treated as a guarantee against completion.

The deletion request locks the local user row before taking its subscription
and customer-mapping snapshot and committing the tombstone. Billing fulfillment
uses the same lock, so a local mapping/subscription either commits before the
snapshot or is denied after the tombstone; it cannot commit into the gap.

Webhook fulfillment independently requires matching client-reference and
metadata user IDs. Credit and subscription writes serialize with deletion on
the local user row and fail closed when a tombstone exists. A completed Checkout
that arrives after deletion receives no credit, subscription entitlement, or
customer mapping. Its event payload is redacted; known late customer and
subscription subjects are folded into the tombstone as temporary cleanup IDs or
completed-tombstone fingerprints.

For a late completed Checkout, Meelni attempts deterministic reconciliation:

- expire it when it is still open;
- cancel a created subscription;
- refund a directly referenced PaymentIntent/charge or the paid payment exposed
  by the initial invoice.

Stripe does not guarantee that Checkout, subscription, and invoice webhooks
arrive in a useful order. A deleted account's `customer.subscription.created`
or `.updated` event therefore cancels its subscription independently, and an
`invoice.payment_succeeded` event independently cancels the referenced
subscription and refunds its paid PaymentIntent/charge. These paths share
provider-object-derived idempotency keys with Checkout reconciliation, so no
path relies on another event arriving first.

Provider deletion, cancellation, and refunds are not transactional with local
deletion. When Stripe does not expose a refundable reference, or a provider
operation fails, the webhook event remains failed with a stable reconciliation
code for retry/operator review. Meelni does not mark the event processed, grant
an entitlement, or claim a refund occurred.

## Retention boundary

The accepted durable-deletion decision retains completed tombstones containing
the user UUID, status/timestamps, attempts, and one-way provider fingerprints
until a separate retention decision approves removal. This contract does not
invent a deletion period for those records.

Payment processors, backups, security logs, and legally required records can
have separate retention obligations. Product copy must not promise immediate
erasure from every system or an exact retention period until owner/legal policy
defines it. The relaunch flag remains default-off independently of this
contract.
