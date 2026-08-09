# Analytics Events - Credit Billing

Updated: 2026-06-29

This document describes analytics events relevant to the credit-based billing catalog. Client-side events still use the consent-aware analytics service. Credit lifecycle events are emitted server-side from the credit ledger and are skipped when PostHog keys are not configured.

## Credit Lifecycle Events

| Event                             | Trigger                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `billing_credit_granted`          | A trial, Checkout, subscription renewal, admin, migration, or refund grant is created or replayed idempotently. |
| `billing_credit_reserved`         | A session start reserves credit from one or more grants.                                                        |
| `billing_credit_consumed`         | A successful session start consumes a reservation.                                                              |
| `billing_credit_released`         | A failed system start releases a reservation back to the grant.                                                 |
| `billing_credit_refunded`         | A consumed reservation is refunded.                                                                             |
| `billing_credit_expired`          | Expired remaining credits are zeroed.                                                                           |
| `billing_credit_rollover_created` | Eligible subscription credits roll into a rollover grant.                                                       |
| `billing_no_credits`              | A user attempts to start an interview without enough credits.                                                   |

## Common Properties

- `catalog_id`: `trial`, `interview_pass`, `starter`, `pro`, or `admin_grant`.
- `credit_source`: `trial`, `checkout`, `subscription_renewal`, `rollover`, `admin`, `refund`, or `migration`.
- `transaction_type`: `grant`, `reserve`, `consume`, `release`, `refund`, `expire`, `adjustment`, or `rollover`.
- `credits`: Number of credits in the event.
- `balance_after`: Remaining balance on the affected grant when available.
- `idempotency_key`: Ledger idempotency key.
- `source_id`: Stripe session/invoice/event ID or other source reference.
- `session_id`: Interview session ID when the event is tied to session start.
- `grant_id`: Credit grant ID.
- `reservation_id`: Credit reservation ID.
- `duplicate`: `true` when an idempotent replay was observed.
- `reason`: Error or no-credit reason.

## Funnel Questions

- Trial activation: users with `billing_credit_granted` where `catalog_id = trial`.
- Purchase activation: users with `billing_credit_granted` from `checkout` or `subscription_renewal`.
- Credit consumption: `billing_credit_consumed` by `catalog_id`.
- No-credit pressure: `billing_no_credits` by user, catalog context, and time since signup.
- Rollover health: `billing_credit_rollover_created` versus `billing_credit_expired`.
- Stripe replay health: `billing_credit_granted` or `billing_credit_rollover_created` where `duplicate = true`.

## Client-Side Purchase Intent Events

The older upgrade-modal events may still appear while compatibility UI exists:

- `Setup Page Viewed`
- `Upgrade Modal Viewed`
- `Upgrade Modal Dismissed`
- `Upgrade Modal CTA Clicked`
- `Quota Exceeded Modal Viewed`
- `Quota Exceeded Modal Dismissed`
- `Quota Exceeded Modal CTA Clicked`

Treat these as UI intent events only. Use server-side credit events as the source of truth for billing grants and consumption.

## Testing

Local tests should not require PostHog keys. When keys are configured in preview, trigger the flows below and confirm events in PostHog:

1. Buy Interview Pass: expect `billing_credit_granted` with `catalog_id = interview_pass`, `credit_source = checkout`, `credits = 1`.
2. Start an interview: expect `billing_credit_reserved` and `billing_credit_consumed`.
3. Start with zero credits: expect `billing_no_credits`.
4. Replay a Stripe Checkout event: expect `billing_credit_granted` with `duplicate = true`.
5. Renewal with unused subscription credits: expect `billing_credit_rollover_created` followed by `billing_credit_granted`.
