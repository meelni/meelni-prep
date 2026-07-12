# Period-End Subscription Cancellation

Status: accepted on 2026-07-12

## Decision

Meelni schedules subscription cancellation for the end of the current paid
billing period. The customer keeps subscription access and every otherwise
valid unused interview credit through that date. The cancellation request does
not create a proration, Stripe customer-balance credit, or card refund.

The cutoff is an entitlement policy, not a destructive rewrite of ledger
history. Only `subscription_renewal` and `rollover` grants are unavailable when
`now >= current_period_end` while cancellation is scheduled or the subscription
has ended. Trial, Interview Pass/checkout, admin, refund, and migration grants
retain their own expiry rules. Reactivation before the cutoff removes the
restriction without changing any grant's original expiry.

Exceptional refund requests are separate manual support decisions. They are
not offered, promised, or automated by the cancellation or account-deletion
workflows.

## Product Contract

- The public cancellation API exposes only period-end cancellation.
- The dashboard shows one cancellation action and the paid-through date.
- A repeated request is idempotent and does not call Stripe again.
- Reactivation clears `cancel_at_period_end` before the paid period ends.
- A scheduled active/trialing subscription cannot open a second subscription
  Checkout. The customer must reactivate the current provider resource or wait
  until it has ended before starting another subscription.
- Subscription invoice credits are granted only when the invoice belongs to the
  currently locked provider subscription and passes resource, billing-reason,
  and period checks. The exact current period remains eligible across reordered
  or same-second subscription updates; older periods and replaced resources
  remain payment history but grant and roll zero credits.
- Stripe event creation time is the webhook ordering fence. Direct provider
  observations preserve that fence and use a version-checked local mutation;
  accepting a reordered current-period invoice never moves the fence backward.
- Cancellation and reactivation take the immediate per-account mutation lock
  before checking state or calling Stripe. A concurrent loser receives retry
  backpressure; an exact later replay observes committed state and makes no
  provider mutation. Provider mutations use deterministic user/version/action
  idempotency.
- Subscription Checkout is serialized by the same per-user advisory and row
  locks as webhook and cancellation work. Lock acquisition is immediate so
  waiters do not occupy pooled connections. Each new creation attempt has a
  deterministic user/plan/price/nonce idempotency scope, while a mapped Stripe
  customer lets concurrent calls reuse the winning open session. Provider
  active/trialing state and local state are both rechecked after create/reuse;
  drift expires and withholds the candidate session.
- Renewal and rollover analytics are emitted only after the outer ledger and
  subscription transaction commits.
- Credit and cancellation read truth use one user-fenced database-time snapshot;
  equality with `current_period_end` is unavailable even if an application clock
  rolls backward.
- Account deletion is the approved exception to period-end access. Once its
  irreversible intent is durably persisted, the tombstone immediately denies
  product access, unused credits are no longer redeemable, and captured
  subscriptions are canceled without proration, refund, or customer-balance
  compensation. Ordinary cancellation remains period-end.
- Deletion acceptance snapshots the current subscription plus every historical
  customer mapping's subscription/customer IDs in deterministic order. It also
  snapshots every nonterminal LiveKit room. Session creation serializes with
  that snapshot and provider creation is followed by a second identity-lock
  fence before credentials are returned. If deletion won between persistence
  and provider creation, the newly created room is durably re-enrolled with a
  newer cleanup generation, terminated, and its credentials are withheld.
  Older cleanup attempts cannot clear the newer generation. A room captured
  while its session is created/connecting remains a provisioning subject after
  a missing-room result, and duplicate deletion requests monotonically union
  subjects without lowering generations or dropping unresolved raw targets.
  If the post-create fence and direct termination both fail, that provisioning
  subject remains durable for retry. No database lock spans provider I/O.
- Local data removal remains irreversible and does not wait for LiveKit. Room
  deletion disconnects participants and is retryable from the tombstone; a
  provider outage cannot roll back deletion acceptance or restore access. Raw
  room names are cleared after provider confirmation, leaving fingerprints.
- An exceptional-refund decision is human-owned, but execution for an existing
  account remains paused until [SAV-231](https://linear.app/saviiii/issue/SAV-231/billing-truth-reconcile-stripe-refunds-and-retire-legacy-usage)
  provides verified payment-to-credit-ledger reconciliation. Today,
  `charge.refunded` updates payment history only, no refund webhook adjusts
  credits, and dispute events are unsupported.

## Rollout

The relaunch flag remains off. Before launch, rehearse cancellation and
reactivation in Stripe test mode and confirm the subscription, invoice,
customer balance, payment history, access, and unused-credit states. Rehearse
the approved deletion exception separately: access denial begins at durable
intent, while provider cancellation remains retryable and non-compensating.
Confirm separately that an already-connected LiveKit room is disconnected and
that a retryable room-deletion failure leaves durable cleanup pending without
restoring product access.
Manual refund execution additionally requires SAV-231, an updated support
runbook, and test-mode evidence.
