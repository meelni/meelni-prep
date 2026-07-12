# Period-End Subscription Cancellation

Status: accepted on 2026-07-12

## Decision

Meelni schedules subscription cancellation for the end of the current paid
billing period. The customer keeps subscription access and every otherwise
valid unused interview credit through that date. The cancellation request does
not create a proration, Stripe customer-balance credit, or card refund.

Exceptional refund requests are separate manual support decisions. They are
not offered, promised, or automated by the cancellation or account-deletion
workflows.

## Product Contract

- The public cancellation API exposes only period-end cancellation.
- The dashboard shows one cancellation action and the paid-through date.
- A repeated request is idempotent and does not call Stripe again.
- Reactivation clears `cancel_at_period_end` before the paid period ends.
- Account deletion ends access immediately because the account is removed, but
  it does not automatically refund historical payments.
- Provider refund and dispute webhooks continue to reconcile real manual or
  provider-originated adjustments with the credit ledger.

## Rollout

The relaunch flag remains off. Before launch, rehearse cancellation and
reactivation in Stripe test mode and confirm the subscription, invoice,
customer balance, payment history, access, and unused-credit states. Manual
refund handling requires a separate support runbook and evidence.
