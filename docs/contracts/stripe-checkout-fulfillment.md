# Stripe Checkout Fulfillment Contract

This contract owns one-time Interview Pass fulfillment. Stripe event payloads are triggers, not payment or catalog authority.

## Accepted triggers

- `checkout.session.completed` starts authoritative reconciliation. A completed but unpaid session is acknowledged as pending and creates no credit.
- `checkout.session.async_payment_succeeded` runs the same reconciliation and grant key after delayed payment settles.
- `checkout.session.async_payment_failed` retrieves and validates the authoritative Checkout Session, authenticates its owner binding, and records failed payment truth without granting or revoking credit. A delayed failure never downgrades provider-paid or locally succeeded truth. Refund and dispute adjustments are separate workflows.

Every request must pass Stripe webhook signature verification before it reaches this workflow.

## Authoritative evidence

Before granting, the server retrieves the current Checkout Session from Stripe with line items expanded. Fulfillment requires all of the following:

- the retrieved ID equals the trigger's Checkout Session ID;
- session status is `complete`, mode is `payment`, and payment status is `paid`;
- `metadata.userId` and `client_reference_id` are present and equal;
- any existing Stripe customer mapping belongs to that same user;
- `metadata.catalogId` is `interview_pass`;
- the line-item collection is complete and contains exactly one item;
- that item uses `STRIPE_INTERVIEW_PASS_PRICE_ID` with quantity `1`;
- the session currency and the line-item currency are both `usd`.
- the paid session has a PaymentIntent reference and a nonnegative integer total suitable for durable payment history.

`no_payment_required`, unknown prices, subscriptions, multiple or paginated line items, missing quantities, and conflicting owner evidence do not grant credit. Invalid durable evidence fails with a stable non-identifying error; transient provider failures remain retryable.

## Exactly-once mutation

The workflow grants through the credit ledger with:

```text
source: checkout
source_id: <Checkout Session ID>
idempotency_key: stripe:checkout:<Checkout Session ID>:interview_pass
```

The ledger serializes the owning user, validates replay shape, and enforces unique grant and transaction keys. The handler then records the authoritative Checkout Session, PaymentIntent, grant, amount, currency, and catalog correlation in `payment_history`; a conflicting replay fails closed. A validated async failure and later success use the globally unique Checkout Session ID to converge atomically on one canonical payment row. Success promotes that row from `failed` to `succeeded` with grant truth; a delayed failure cannot downgrade `succeeded`, `partially_refunded`, `refunded`, or `disputed` truth. The same rule applies to a `subscription_create` invoice after its exact Checkout Session is listed and validated. Durable grant source and idempotency identifiers remain unchanged.

Account-deletion tombstones are checked before fulfillment and again under the ledger's user lock. This workflow never creates automatic prorations or card refunds.

## Checkout return-page truth

`/pricing/success` is a confirmation surface, not fulfillment authority. A
route visit, query string, client authentication state, or current aggregate
credit balance never proves that the referenced purchase added credits.

The browser-facing status endpoint never reads Stripe. Signed webhooks are the
only provider authority and mutation path. The signed-in return flow requires
owner-scoped durable settlement evidence linked to the exact Checkout Session:

- Interview Pass confirmation uses the Checkout Session ID recorded in
  `payment_history` and requires a succeeded row linked to the matching credit
  grant.
- Starter and Pro `subscription_create` handling lists the completed Checkout
  Sessions for the authoritative subscription, requires exactly one complete
  result, validates its invoice, subscription, customer, client reference,
  owner metadata, catalog, configured price, quantity, and currency, then
  records that existing Checkout Session ID on the succeeded invoice payment.
  Confirmation requires that payment plus its invoice-correlated renewal grant.

Only that evidence renders the purchase-confirmed state and says that credits
were added. This is historical fulfillment evidence; it does not claim that
the granted credits remain currently available. A valid purchase awaiting its
webhook transaction remains pending. Reversal or dispute evidence takes
precedence over success evidence, and inconsistent mixed evidence fails closed.
Missing, malformed, foreign, failed, reversed, or internally inconsistent
evidence renders a safe recovery state without exposing provider identifiers
or errors. Reordered failed-then-succeeded invoice delivery recovers to the
single valid success; a refund or dispute still takes precedence.

The authenticated Checkout-creation route creates a cryptographically random
opaque return handle before it calls Stripe, stores it in Checkout Session
metadata, and uses the queryless Session `success_url` `/pricing/success`. The
JSON response contains the hosted Checkout URL and opaque handle but no Checkout
Session ID. Both pricing clients validate that response and store the handle in
same-tab `sessionStorage` before leaving for Stripe. Stripe therefore returns to
a queryless application URL. The legacy public return route discards every
query, mints no cookie, and redirects queryless.

Creation stores the provider ID in one of exactly eight deterministic
`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` cookie slots. The cookie value
binds the handle, provider ID, and creation time. A slot collision overwrites
one slot and the
status route fails closed when the submitted handle does not match that value;
it never selects another Checkout. The success client reads the handle only
after hydration and sends it only in the JSON body of an authenticated `POST`
to the status endpoint. If same-tab storage is gone, the authenticated status
route scans only those eight fixed slots and selects the newest valid
correlation with durable first-party evidence server-side, falling back to the
newest valid pending correlation when none has settled. Authentication handoff
remains queryless.

The slotted cookie expires after 30 days. This bounded window covers
supported delayed methods that can settle several business days after Checkout
and allows a manual revisit after automatic polling stops or the original tab
closes. A pending or retryable state retains the selected cookie and same-tab
storage. Confirmed and
definitive non-retryable results clear both. Because only eight deterministic
cookie names can exist, concurrent starts cannot exceed the cap or exert
unbounded eviction pressure on authentication cookies.

PostHog redacts Checkout IDs recursively at both browser and server transmission
boundaries, including billing `source_id`, embedded `idempotency_key`, nested
properties, event names, distinct IDs, and opaque return handles. Durable
database source and idempotency values remain unchanged. Statsig automatic
capture and session replay remain disabled. PostHog session recording is also
disabled globally until it has a separately verified privacy boundary;
explicit feature-gate evaluation and explicit events continue.

Checkout confirmation runs regardless of the relaunch feature gate. When the
gate is off, even a confirmed purchase offers only dashboard and billing
settings navigation; it never offers an interview-start action.

Status reads are private and non-cacheable. They do not grant, revoke, refund,
prorate, cancel, or otherwise mutate billing state. Ordinary subscription
cancellation remains period-end, and exceptional refunds remain a separate
manual support decision.

Missing or expired Supabase authentication is an ordinary `401` and preserves
the selected correlation through sign-in. Only authentication infrastructure
failures produce the fixed retryable `503` operational state. Reversal copy
states that a payment was refunded or disputed and that related credits may
have been adjusted; it never falsely claims credits were never added.

Authentication-infrastructure and settlement-read failures emit only the closed
`checkout_confirmation` operational event with a fixed error code. They never
log exception text or checkout, payment, customer, user, or grant IDs. Missing
or expired authentication remains an ordinary `401`, not an operational event.

## Privacy and operations

- Durable webhook logs retain operational metadata and stable error codes, not raw Stripe payloads.
- Error logs must not include user, customer, session, PaymentIntent, price, or line-item identifiers.
- Test fixtures use synthetic IDs only. Provider rehearsal is test-mode and isolated from Production.
