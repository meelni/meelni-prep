# Credit-Based Billing Catalog

Date: 2026-06-29
Status: accepted

## Context

Meelni currently has product and code assumptions around a free authenticated experience, a seven-day Pro trial, and a Pro plan that is described as unlimited in some UI. The billing implementation also has scattered references to `free`, `pro`, and removed or stale `premium` behavior.

Voice interviews have meaningful variable cost. An unlimited Pro plan creates poor margin control and makes it hard to support serious users without either raising price sharply or throttling after the fact.

## Decision

Meelni will move to a credit-based billing catalog:

- No ongoing free full-interview allowance.
- Every authenticated account, including an account created before relaunch, is
  eligible for exactly one trial grant of 2 full-interview credits for 7 days.
- The trial starts only when the user first asks to start a full interview. A
  signup, login, page visit, or credit-balance read must not start the clock.
- `trial:<user_id>` is the canonical grant idempotency key. Its presence makes
  the account permanently ineligible for another trial, including after the
  original trial is consumed or expires.
- Interview Pass sells 1 full-interview credit for $9, expiring after 30 days.
- Starter is $19/month for 4 credits/month.
- Pro is $49/month for 12 credits/month.
- Monthly subscription credits roll over for one extra month, capped at one month of the plan allowance.
- Starter can carry up to 4 rollover credits.
- Pro can carry up to 12 rollover credits.
- Rollover credits expire after 60 days.
- Trial credits do not roll over.
- Future top-up credits should expire after 90 days.

Any active, non-expired credit-bearing state should unlock all PM round types. Access is limited by credit balance and billing state, not by interview type.

## Consequences

The implementation needs a canonical billing catalog and credit ledger. Product rules should not live independently in checkout routes, setup UI, billing modals, structured data, and webhook handlers.

Session start should reserve and consume credits with idempotency. Failed starts should release the reservation. Support and recovery paths should be able to refund credits when Meelni fails the user.

Session start creates or repairs the canonical trial grant after the user row
exists and immediately before reserving a credit. Replaying that activation
must also ensure the matching grant transaction exists. Billing GET routes are
read-only and report eligibility from the canonical idempotency key.

Existing free/pro/premium entitlement code, public pricing copy, structured data, checkout mapping, usage quota code, and billing tests need to be reconciled with this decision.

## Not Decided

- Whether post-launch top-ups should be sold, and at what price/package size, after subscriber credit exhaustion data is available.
- Whether longer interviews will eventually consume more than one credit.
- Exact migrated treatment for any active existing paid users at launch.
