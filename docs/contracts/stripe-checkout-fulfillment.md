# Stripe Checkout Fulfillment Contract

This contract owns one-time Interview Pass fulfillment. Stripe event payloads are triggers, not payment or catalog authority.

## Accepted triggers

- `checkout.session.completed` starts authoritative reconciliation. A completed but unpaid session is acknowledged as pending and creates no credit.
- `checkout.session.async_payment_succeeded` runs the same reconciliation and grant key after delayed payment settles.
- `checkout.session.async_payment_failed` is acknowledged without granting or revoking credit. Refund and dispute adjustments are separate workflows.

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

The ledger serializes the owning user, validates replay shape, and enforces unique grant and transaction keys. The handler then records the authoritative Checkout Session, PaymentIntent, grant, amount, currency, and catalog correlation in `payment_history`; a conflicting replay fails closed. A replay preserves a legitimate later `partially_refunded`, `refunded`, or `disputed` status while still requiring every immutable payment and grant field to match. `checkout.session.completed` and a later async-success event therefore converge on the same grant and payment row even when delivered repeatedly, concurrently, or out of order with a refund or dispute transition.

Account-deletion tombstones are checked before fulfillment and again under the ledger's user lock. This workflow never creates automatic prorations or card refunds.

## Privacy and operations

- Durable webhook logs retain operational metadata and stable error codes, not raw Stripe payloads.
- Error logs must not include user, customer, session, PaymentIntent, price, or line-item identifiers.
- Test fixtures use synthetic IDs only. Provider rehearsal is test-mode and isolated from Production.
