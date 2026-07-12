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

The durable tombstone is the entitlement cutoff. As soon as persistence
commits, middleware denies the authenticated session and every other existing
or future session with `account_deletion_pending`, even when provider cleanup is
still queued, retrying, or failed. Unused credits are not redeemable because the
deleted identity has no product access; no ledger compensation or refund is
created.

The unconfirmed `DELETE` method returns `405`. Provider/admin error details are
never returned to the client or stored in the tombstone; only stable categories
are persisted.

Application cleanup removes `user_insights` before its referenced interview
session because `user_insights.last_session_id` is a `NO ACTION` foreign key.
The account-deletion job normalizes provider, redaction, and application errors
inside the Inngest step boundary so raw database/provider messages do not enter
job history; the tombstone and job retain only a stable failure code.
Local webhook redaction and application-data cleanup run before Supabase Auth
and Stripe/LiveKit provider operations. Provider outages therefore retain only
the durable typed cleanup references, not the user's local product data.

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
and customer-mapping snapshot and committing the tombstone. The snapshot
contains the current subscription and every subscription/customer ID on every
historical mapping, sorted and deduplicated deterministically. Billing fulfillment
uses the same lock, so a local mapping/subscription either commits before the
snapshot or is denied after the tombstone; it cannot commit into the gap.

The same accepted transaction snapshots each room name belonging to a
nonterminal LiveKit interview. Session creation takes the account identity lock,
so it either commits before the snapshot or fails after the tombstone exists.
Because LiveKit provider creation happens after that database transaction, the
start workflow takes the identity lock again after provider creation and before
returning credentials. If deletion won that fence, the workflow durably
re-enrolls the room with a newer cleanup generation, terminates it, releases the
credit reservation, terminalizes the local session when it still exists, and
returns only `account_deletion_pending`. It never returns the room token or URL.
An older deletion worker that observed a pre-creation 404 can clear only its
own generation, so it cannot erase the later room's retry target. The fence
holds no database lock during LiveKit I/O.
Cleanup removes local interview data first, then actively calls LiveKit room
deletion, which disconnects current participants and ends that room. The HTTP
202 confirms durable acceptance, not synchronous disconnection; a connection
may persist until the background cleanup attempt reaches LiveKit. LiveKit
failures persist only the stable `livekit_provider_error` category and remain
recoverable. They never roll back the tombstone or restore product access.
Successful cleanup clears the raw room name and retains only its fingerprint;
raw room names never enter client responses, stable errors, or job step output.
Post-create termination failures follow the same rule: the raw room remains in
the tombstone for recovery, while workflow logs contain only a fixed cleanup
category and no room name, token, URL, or provider message.

Webhook fulfillment independently requires matching client-reference and
metadata user IDs. Credit and subscription writes serialize with deletion on
the local user row and fail closed when a tombstone exists. A completed Checkout
that arrives after deletion receives no credit, subscription entitlement, or
customer mapping. Its event payload is redacted; known late customer and
subscription subjects are folded into the tombstone as temporary cleanup IDs.
Late invoice, PaymentIntent, or charge references can be retained only while
provider cleanup is pending. Account deletion does not create a proration,
customer-balance credit, invoice refund, PaymentIntent refund, or charge refund.
After subscription cancellation and customer cleanup, Meelni clears every raw
ID, leaving fingerprints only. Any failure after subjects are recorded moves
the tombstone into retryable failure. Recovery repeats cancellation and customer
deletion with object-derived idempotency keys in that order.
Completion clears only the provider fingerprints present in the worker's
processed snapshot. Subjects appended by a concurrent webhook remain raw and
recoverable; even a completed tombstone containing a raw reference is selected
by recovery. Malformed persisted subject JSON fails closed rather than silently
discarding an unknown provider reference.

Stripe customer mapping and tombstone subject fingerprints are authoritative
provider-subject ownership evidence. Event metadata alone is never ownership
proof. A Checkout event may establish ownership only when its metadata and
`client_reference_id` are both present and identical. Any disagreement among
Checkout correlation, customer mapping, event metadata, or a tombstone subject
fingerprint fails before event logging, entitlement mutation, cancellation,
customer deletion, or tombstone mutation. The same ownership decision
gates active billing updates and deleted-account reconciliation.

Stripe event logs never persist raw webhook payloads, including for active
accounts. Signature-verified event data exists only in request memory; durable
logs retain the event ID/type, subject fingerprint, state, attempts, timestamps,
and stable error category. This removes the payload-insert race with deletion.

For a late completed Checkout, Meelni attempts deterministic reconciliation:

- expire it when it is still open;
- cancel a created subscription;
- delete a captured Stripe customer only after subscription cancellation.

Stripe does not guarantee that Checkout, subscription, and invoice webhooks
arrive in a useful order. A deleted account's `customer.subscription.created`
event therefore records its captured subscription/customer subjects, cancels
the subscription without proration, and deletes the customer. A deleted account's
`customer.subscription.updated` event cancels its subscription independently,
and an
`invoice.payment_succeeded` event independently cancels the referenced
subscription without granting entitlement or creating a refund. These paths share
provider-object-derived idempotency keys with Checkout reconciliation, so no
path relies on another event arriving first.

Historical invoices, charges, PaymentIntents, refunds, disputes, and legally
required processor records remain subject to Stripe and legal retention. A
support-approved exceptional refund is a separate manual decision and is not
performed, promised, or retried by deletion. Execution for an existing account
is paused until [SAV-231](https://linear.app/saviiii/issue/SAV-231/billing-truth-reconcile-stripe-refunds-and-retire-legacy-usage)
provides verified payment-to-credit-ledger reconciliation. Current
`charge.refunded` handling records payment-history status only, does not adjust
credits, and dispute events are unsupported.
Subscription-deleted and invoice success/failure state changes also lock the
user and fail closed on deletion. Stripe timestamps have second resolution, so
subscription deletion is the terminal tie-breaker for same-resource,
same-second events; invoice success/failure and subscription updates cannot
overwrite that canceled resource. A distinct `subscription.created` event may
replace a canceled subscription, while updates, invoices, and deletions for an
old provider subscription can never mutate the user's current subscription.
For a legacy canceled subscription row without a provider subscription ID, a
correlated `subscription.created` event may establish the replacement resource
identity. Other resource-specific events fail closed until billing
sync/backfill scopes the row.

Provider deletion and subscription cancellation are not transactional with local
deletion. When a provider operation fails, the webhook event remains failed
with a stable reconciliation code for retry/operator review. Cancellation and
customer-cleanup failures preserve the required provider references until
recovery succeeds. Meelni does not mark the event processed, grant an
entitlement, or claim a refund occurred.

Durable Stripe deletion subjects are validated as typed provider references:
customer IDs must use `cus_`, subscriptions `sub_`, invoices `in_`, PaymentIntents
`pi_`, and charges `ch_`. A kind/ID mismatch fails closed before any provider
operation or fingerprint clearing.

The accepted deletion exception removes product access immediately at durable
intent even when a paid period remains. Local/Auth identity cleanup proceeds
before provider cleanup, and provider failure cannot restore access because the
tombstone remains authoritative. Captured subscriptions are retried with the
same object-derived idempotency key and `prorate=false`; deletion never creates
a refund or customer-balance compensation. Ordinary cancellation remains
period-end.

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
