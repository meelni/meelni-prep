# Payment Reversal Credit Truth

Date: 2026-07-10
Status: accepted

## Context

Meelni grants prepaid interview credits from one-time Checkout sessions and paid subscription invoices. The current webhook records `charge.refunded` in payment history but does not reconcile the correlated credit grant. Subscription payment history also omits payment-intent correlation, disputes are unhandled, and the ledger's existing `refund` transaction means restoring a failed interview reservation rather than reversing a payment.

## Decision

- A refund or dispute revokes the remaining unspent credits funded by the correlated payment source exactly once.
- Partial monetary reversals use cumulative floor rounding against the original payment: `floor(cumulative_reversed_amount / original_payment_amount * source_credits)`. Multiple Refund or Dispute objects cannot revoke more than the source grant, and a small goodwill refund may revoke zero credits.
- A full cumulative reversal durably revokes the exact paid grant and immediately excludes it from balances and new reservations. A partial reversal deducts or freezes only the proportional credit quantity; the rest of that source remains spendable.
- An active reservation is not force-canceled. Its existing allocation may settle, but a later release or session refund cannot make the revoked quantity spendable again.
- Credits already consumed are not clawed from unrelated grants and are not represented as a hidden negative balance.
- Adjustment evidence records the source quantity, immediately revoked quantity, reserved quantity, consumed quantity, and any quantity that could not be recovered.
- Credits transferred into a rollover grant retain payment-source provenance in durable source lots. Each lot records one source grant's remaining, reserved, consumed, and revoked quantities; each rollover reservation allocation is split into durable lot allocations. A pooled rollover credit can therefore be consumed by exactly one payment source, never counted against every source that contributed to the pool.
- Cancellation without a payment reversal does not revoke credits already granted. Immediate cancellation requests use Stripe's provider-side proration behavior, and the resulting refund/dispute event is the authority for credit revocation.
- A failed or canceled refund and disputed funds that Stripe reinstates reverse the freeze exactly once. Released-but-frozen allocation value may become spendable again; credits consumed while frozen are never recreated.
- Refund and dispute lifecycle deliveries converge on provider object plus direction (`withdraw` or `reinstate`), not Stripe delivery event ID. Same-direction updates replay, opposite directions compensate, and reinstatement arriving before withdrawal prevents a later stale freeze.
- Payment history status is derived from every active withdrawal for the payment. Reinstating one refund cannot mark the payment succeeded while another refund or dispute remains active.
- Credit freeze ownership is payment-aggregate rather than provider-event-owned. A dedicated payment state computes `target = floor(active reversed amount / original payment amount * source credits)`, `unrecoverable = min(target, source-attributable consumed credits)`, and `revoked = target - unrecoverable`. Provider adjustment rows remain immutable historical evidence while the payment state reconciles the physical grant/allocation freeze exactly to that aggregate target.
- A consumed allocation remains source-consumed evidence when later session settlement changes its status to `refunded` and its persistent revoked quantity is nonzero. Reconciliation must never recreate that frozen-and-consumed quantity.
- Ambiguous legacy payment/grant correlation fails closed for support review. A legacy rollover grant without complete source lots also fails strict preflight; the system does not infer lot ownership from aggregate consumption or backfill it heuristically.

## Consequences

- Credit grants need durable revocation state, and reservation allocations need a revoked quantity so terminal settlement cannot resurrect credits.
- Payment history needs stable Checkout, PaymentIntent, Charge, Invoice, grant, and catalog correlation where available.
- A dedicated immutable billing-adjustment record is required even when zero credits can be recovered. It retains the first delivery event, provider lifecycle identity, direction, and before/after aggregate snapshots.
- A separate versioned payment state retains the current proportional target, revoked/unrecoverable composition, and affected grant/allocation evidence. Preflight verifies that its physical evidence sums exactly to its revoked quantity and that full-source markers match the aggregate target.
- Rollover payment-state evidence names the exact source lot or lot allocation it froze. Grant-only evidence is valid only for the original paid grant, so two source payments can never claim the same pooled freeze.
- Stripe event normalization stays outside core ledger behavior; all grant and evidence mutations commit under the existing per-user PostgreSQL lock.
- Legacy monthly-usage and unlimited-plan read models are no longer authoritative for entitlement or customer-facing usage.
- Authentication and billing GETs do not create synthetic free subscription periods. Provider sync is an explicit paid-subscription recovery path only.
