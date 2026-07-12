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
  webhook conflicts require a bounded authoritative provider reread and retry.
- Subscription Checkout is serialized by the same per-user advisory and row
  locks as webhook and cancellation work. A user plus locked billing-state
  version supplies one deterministic idempotency scope across plan choices, and
  a post-create state change expires and withholds the provider session.
- Renewal and rollover analytics are emitted only after the outer ledger and
  subscription transaction commits.
- Credit and cancellation read truth use one user-fenced database-time snapshot;
  equality with `current_period_end` is unavailable even if an application clock
  rolls backward.
- Account deletion never automatically refunds historical payments. The current
  draft implementation also ends access immediately because the account is
  removed; that irreversible exception is not approved by this decision and is
  an explicit owner gate before merge.
- An exceptional-refund decision is human-owned, but execution for an existing
  account remains paused until [SAV-231](https://linear.app/saviiii/issue/SAV-231/billing-truth-reconcile-stripe-refunds-and-retire-legacy-usage)
  provides verified payment-to-credit-ledger reconciliation. Today,
  `charge.refunded` updates payment history only, no refund webhook adjusts
  credits, and dispute events are unsupported.

## Rollout

The relaunch flag remains off. Before launch, rehearse cancellation and
reactivation in Stripe test mode and confirm the subscription, invoice,
customer balance, payment history, access, and unused-credit states. Manual
refund execution additionally requires SAV-231, an updated support runbook, and
test-mode evidence.
