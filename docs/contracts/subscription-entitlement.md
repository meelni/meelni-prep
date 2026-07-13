# Subscription Entitlement Convergence

Meelni must not make paid access depend on Stripe webhook delivery order.

## Initial paid invoice

A `subscription_create` invoice may establish missing local subscription state
only from a freshly retrieved authoritative Stripe subscription. Before any
billing mutation, the workflow binds all of the following evidence:

- invoice subscription ID to retrieved subscription ID;
- invoice customer ID to retrieved subscription customer ID;
- subscription metadata owner to any durable local customer mapping;
- exactly one supported recurring subscription item and price;
- the item service period to the selected paid invoice service-line period.

Missing, paginated, unsupported, conflicting, or ambiguous evidence fails
closed. An invoice cannot replace a different current subscription resource.

The subscription state, customer mapping, succeeded payment, linked credit
grant, and invoice event outcome converge exactly once. A later
`customer.subscription.created` event may reconcile the same resource with its
higher event-order cursor without granting again.

## Renewal invoice

A `subscription_cycle` invoice requires an existing resource-scoped local
subscription row. It cannot bootstrap missing or unscoped state. The current
resource must match the invoice customer, price, and catalog before entitlement
can apply. An unrecognized different resource remains retryable and creates no
payment-history or credit mutation until the required evidence is available.

A delayed invoice for a provider subscription already recorded in the row's
retired-resource history may preserve exact provider payment truth, but it
cannot move current subscription state or grant current-period credits.

## Deletion and cancellation

Account-deletion tombstones take precedence over invoice reconciliation and
immediately end access without automatic proration or refund. Ordinary
subscription cancellation remains period-end and does not revoke otherwise
valid unused credits before the paid-through timestamp.
