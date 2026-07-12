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
- Account deletion never automatically refunds historical payments. The current
  draft implementation also ends access immediately because the account is
  removed; that irreversible exception is not approved by this decision and is
  an explicit owner gate before merge.
- Provider refund and dispute webhooks continue to reconcile real manual or
  provider-originated adjustments with the credit ledger.

## Rollout

The relaunch flag remains off. Before launch, rehearse cancellation and
reactivation in Stripe test mode and confirm the subscription, invoice,
customer balance, payment history, access, and unused-credit states. Manual
refund handling requires a separate support runbook and evidence.
