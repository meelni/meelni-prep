# Stripe Credit Billing Test Plan

**Status**: Test mode
**Updated**: 2026-06-29
**Stripe docs**: https://docs.stripe.com/testing

## Overview

This plan verifies Meelni's credit-based Stripe integration:

- Interview Pass: $9 one-time Checkout payment, 1 credit, expires after 30 days.
- Starter: $19/month subscription, 4 credits per paid invoice, rollover cap 4, rollover expires after 60 days.
- Pro: $49/month subscription, 12 credits per paid invoice, rollover cap 12, rollover expires after 60 days.

The free full-interview experience is deprecated. Trial access is local product state: 2 credits for 7 days. Stripe Checkout should not create a separate subscription trial for Starter or Pro.

## Prerequisites

1. Stripe test keys are configured with `pk_test_` and `sk_test_`.
2. Webhook secret is configured in `STRIPE_WEBHOOK_SECRET`.
3. Stripe price env vars are configured:

```bash
STRIPE_INTERVIEW_PASS_PRICE_ID=price_...
STRIPE_STARTER_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
```

Create or reuse test-mode Stripe products and prices:

```bash
npm run stripe:setup-catalog -- --dry-run
STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup-catalog
```

4. Local webhook forwarding is running:

```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

## Test Cards

| Card number           | Result                        |
| --------------------- | ----------------------------- |
| `4242 4242 4242 4242` | Successful Visa payment       |
| `5555 5555 5555 4444` | Successful Mastercard payment |
| `3782 822463 10005`   | Successful Amex payment       |
| `4000 0000 0000 0002` | Generic decline               |
| `4000 0000 0000 9995` | Insufficient funds            |
| `4000 0025 0000 3155` | 3D Secure required            |

Use any future expiry, any CVC, and any ZIP in test mode.

## Checkout Return-Page Truth

For every catalog item, verify the return page independently from webhook
fulfillment:

1. Visit `/pricing/success` without same-tab correlation, then visit the legacy
   return endpoint with arbitrary query input.
2. Confirm neither path claims that credits were added and the browser-visible
   success URL contains no Checkout Session ID.
3. Start two valid Checkouts in separate tabs. Confirm the start response has a
   different validated opaque handle, each client stores it in same-tab
   `sessionStorage`, and Stripe returns to queryless `/pricing/success`. Confirm
   the start JSON omits the Checkout Session ID. Each authenticated status read
   must be a queryless `POST` whose JSON body contains the handle and whose
   deterministic cookie slot contains that same handle plus Session ID.
   Complete authentication and confirm the handoff is queryless.
4. Delay the relevant webhook and confirm the page remains pending.
5. Process the exact owner-correlated webhook transaction and confirm the page
   confirms the purchase and says credits were added only after
   `payment_history` links the purchase to the durable credit grant. Do not
   interpret this historical grant evidence as the current remaining balance.
6. Exercise failed-then-succeeded, refunded, disputed, success-plus-reversal,
   ambiguous, foreign-owner, grant-mismatch, and database-unavailable fixtures
   and confirm the UI shows only first-party recovery copy.
7. Keep relaunch access off and confirm status resolution still runs, while a
   confirmed purchase offers dashboard and billing settings rather than an
   interview-start action.
8. Stop automatic polling, revisit queryless `/pricing/success` in the same tab,
   and manually check again. Correlation must remain valid for 30 days to cover delayed
   methods that settle over several business days. Confirm only the selected
   cookie is cleared after confirmation or a definitive terminal result.
9. Confirm a missing or expired Supabase session returns `401` and preserves
   the auth handoff, while a simulated auth-infrastructure failure returns the
   fixed retryable `503`. Confirm refund/dispute copy acknowledges reversal and
   does not claim credits were never added.
10. Send repeated raw-session and fake-handle requests to the public return
    route and confirm it creates no cookies and always redirects queryless.
    Simulate concurrent authenticated starts and confirm only the eight fixed
    correlation-cookie names can exist. Force a slot collision and confirm the
    older handle fails closed without selecting or clearing the newer value.

The confirmation endpoint is read-only. These checks must not create refunds,
prorations, cancellations, grants, or any other billing mutation.

## Scenario 1: Interview Pass Purchase

**Goal**: Verify one-time Checkout grants exactly one credit.

Steps:

1. Start Checkout with `catalogId = "interview_pass"`.
2. Complete payment with `4242 4242 4242 4242`.
3. Confirm redirect to `/pricing/success`.
4. Confirm the signed `checkout.session.completed` trigger caused the server to retrieve and validate the authoritative Checkout Session.

Expected:

- Checkout Session mode is `payment`.
- Checkout Session status is `complete` and payment status is `paid`.
- Checkout metadata includes `userId` and `catalogId = "interview_pass"`.
- The complete line-item collection contains exactly one configured Interview Pass price with quantity 1.
- One `credit_grant` row exists with `catalog_id = 'interview_pass'`.
- Grant has `original_credits = 1`, `remaining_credits = 1`, source `checkout`, and an expiration about 30 days after purchase.
- Replaying the same event does not create another grant.

For a delayed payment method, the completed event remains unpaid and creates no grant. A validated `checkout.session.async_payment_failed` creates one canonical failed payment row keyed by the Checkout Session and no grant. A later `checkout.session.async_payment_succeeded` atomically promotes that same row to succeeded grant truth; a delayed failure after success cannot downgrade it.

Verification:

```sql
SELECT catalog_id, source, source_id, original_credits, remaining_credits, expires_at, idempotency_key
FROM credit_grant
WHERE user_id = '...'
ORDER BY created_at DESC
LIMIT 5;
```

## Scenario 2: Starter Subscription Purchase

**Goal**: Verify Starter subscription status and monthly credit grant.

Steps:

1. Start Checkout with `catalogId = "starter"`.
2. Complete payment with `4242 4242 4242 4242`.
3. Confirm `customer.subscription.created` or `customer.subscription.updated` processed.
4. Confirm `invoice.payment_succeeded` processed.

Repeat with the paid invoice delivered before
`customer.subscription.created`, including a run where the durable customer
mapping exists but the local subscription row does not yet exist.

Expected:

- Checkout Session mode is `subscription`.
- `subscription.tier = 'starter'`.
- `subscription.status` is `active` or another mapped Stripe status.
- One subscription renewal grant exists with `catalog_id = 'starter'`, `original_credits = 4`, source `subscription_renewal`.
- Any eligible unused Starter credits are rolled over up to 4 credits with source `rollover`.
- A valid `subscription_create` invoice establishes the same subscription and
  customer-mapping state from an authoritative provider snapshot, then grants
  once without waiting for a manual resend.
- A `subscription_cycle` invoice never invents missing or unscoped local
  subscription state. Missing, unrecognized-resource, customer, price, or plan
  conflicts remain failed/retryable without payment or credit mutation. A
  delayed invoice for an explicitly retired subscription may retain provider
  payment truth but cannot grant credits or move the current subscription.

Verification:

```sql
SELECT tier, status, billing_cycle, stripe_price_id, stripe_subscription_id
FROM subscription
WHERE user_id = '...';

SELECT catalog_id, source, original_credits, remaining_credits, expires_at, idempotency_key
FROM credit_grant
WHERE user_id = '...'
ORDER BY created_at DESC;
```

## Scenario 3: Pro Subscription Purchase

**Goal**: Verify Pro is no longer unlimited and grants 12 monthly credits.

Steps:

1. Start Checkout with `catalogId = "pro"`.
2. Complete payment with `5555 5555 5555 4444`.
3. Confirm subscription and invoice webhooks process.

Expected:

- `subscription.tier = 'pro'`.
- One subscription renewal grant exists with `catalog_id = 'pro'`, `original_credits = 12`, source `subscription_renewal`.
- Any eligible unused Pro credits are rolled over up to 12 credits with source `rollover`.
- No `usage_record` row is created as the access source for this billing period.

## Scenario 4: Card Decline

**Goal**: Verify failed Checkout does not grant credits.

Steps:

1. Start Starter or Pro Checkout.
2. Pay with `4000 0000 0000 0002`.

Expected:

- Stripe displays a card declined error.
- User does not reach `/pricing/success`.
- No new `subscription` row is activated from this attempt.
- No new `credit_grant` row is created.

## Scenario 5: 3D Secure

**Goal**: Verify Checkout handles SCA and still grants credits after successful completion.

Steps:

1. Start Pro Checkout.
2. Pay with `4000 0025 0000 3155`.
3. Complete the 3D Secure challenge.

Expected:

- Stripe displays the challenge.
- Checkout succeeds after the challenge.
- Subscription and invoice webhooks process normally.
- Pro credit grant appears once.

## Scenario 6: Webhook Idempotency

**Goal**: Verify duplicate Stripe events do not duplicate billing state or credits.

Steps:

1. Complete an Interview Pass purchase.
2. Find the `checkout.session.completed` event ID.
3. Replay it:

```bash
stripe events resend <evt_id> --webhook-endpoint=<endpoint_id>
```

Expected:

- `stripe_event_log` has one processed row for the event ID.
- `credit_grant` still has one row for the purchase idempotency key.
- A distinct Event ID for the same immutable invoice transition creates no
  second payment-history row and does not move the failed-payment grace date.
- Deliver a failed and successful event for one invoice in both orders. For
  `subscription_create`, require the exact validated Checkout Session on the
  failed row and atomically promote that same canonical row on success. The
  final subscription is active with no grace date; delayed failure cannot
  downgrade succeeded truth.
- Deliver the initial successful invoice and subscription-created event in
  both orders and concurrently. Every permutation must converge to one
  subscription, one customer mapping, one succeeded payment, and one linked
  credit grant. The later subscription-created reconciliation may enrich the
  same resource but must not duplicate entitlement.

Verification:

```sql
SELECT stripe_event_id, event_type, status, attempts, processed_at
FROM stripe_event_log
WHERE stripe_event_id = 'evt_...';

SELECT idempotency_key, COUNT(*)
FROM credit_grant
WHERE idempotency_key LIKE 'stripe:checkout:%'
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
```

The second query should return zero rows.

Also deliver `checkout.session.completed` and `checkout.session.async_payment_succeeded` for the same synthetic session in both orders. Paid reconciliation must converge on the same grant key and canonical payment row. Deliver `checkout.session.async_payment_failed` before success and verify the single row is promoted; deliver it after success and verify no downgrade. Failure must never grant or revoke credits.

## Scenario 7: Subscription Renewal

**Goal**: Verify renewal invoices roll over eligible credits before granting new credits.

Steps:

1. Create an active Starter or Pro subscription.
2. Leave some subscription-granted credits unused.
3. Trigger or replay `invoice.payment_succeeded` for the next invoice.

Expected:

- Rollover grant is created first when there are eligible remaining credits.
- New renewal grant is created with the plan's included credits.
- Rollover does not exceed the plan cap.
- Replaying the invoice event does not duplicate either grant.

Verification:

```sql
SELECT catalog_id, source, original_credits, remaining_credits, rollover_source_grant_id, expires_at
FROM credit_grant
WHERE user_id = '...'
ORDER BY created_at DESC;
```

## Scenario 8: Failed Renewal Payment

**Goal**: Verify dunning state without granting credits.

Steps:

1. Trigger `invoice.payment_failed` for an active subscription.

```bash
stripe trigger invoice.payment_failed
```

Expected:

- `payment_history.status = 'failed'`.
- `subscription.status = 'past_due'`.
- `subscription.grace_period_end` is about 7 days in the future.
- No new `credit_grant` row is created.

Then deliver `invoice.payment_succeeded` for the same invoice, and repeat with
the delivery order reversed. Both runs must converge on active subscription
state with no grace date; the failed attempt may remain as internal audit
evidence but must not appear in customer payment history.

## Scenario 9: Customer Mapping Fallback

**Goal**: Verify webhooks can recover `userId` when Stripe metadata is missing.

Steps:

1. Complete Starter or Pro checkout.
2. Remove `metadata.userId` from the Stripe customer or subscription in test mode.
3. Trigger `customer.subscription.updated` or replay a subscription event.

Expected:

- Webhook resolves the user through `stripe_customer_mapping`.
- Subscription update processes successfully.
- If metadata and the durable mapping name different users, processing fails
  closed without changing the mapping, subscription, payment, or credits.

Verification:

```sql
SELECT stripe_customer_id, stripe_subscription_id, user_id
FROM stripe_customer_mapping
WHERE stripe_customer_id = 'cus_...';
```

## Scenario 10: Billing Sync

**Goal**: Verify `/api/billing/sync` uses catalog price IDs and never defaults unknown prices to Pro.

Steps:

1. Create a Starter or Pro subscription in Stripe.
2. Call `/api/billing/sync` as that user.
3. Temporarily test an unknown price in a disposable Stripe subscription.

Expected:

- Known Starter and Pro prices sync to `starter` and `pro`.
- Unknown prices are logged and preserve existing local tier if one exists.
- Unknown prices do not silently become `pro`.

## Scenario 11: Refund And Dispute Convergence

**Goal**: Verify provider payment truth and usable-credit truth remain reversible and proportional.

Use Stripe test-mode fixtures only. Exercise `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`, and `charge.dispute.closed` for won and lost outcomes.

Expected:

- Provider object plus direction converges despite distinct delivery event IDs.
- Reinstatement-before-withdrawal prevents a later stale freeze.
- Cumulative partial reversals use floor rounding against original payment amount and cap at the source grant.
- Existing reservations remain settleable; release cannot resurrect a frozen quantity, and reinstatement never recreates a quantity consumed while frozen.
- A failed refund or won dispute reinstates only eligible correlated quantity.
- Payment history remains `partially_refunded` or `disputed` while another active reversal exists.
- Two full withdrawals keep the full source frozen when either one is reinstated; freeze ownership transfers to the remaining active provider object and restores only after the last active withdrawal is reinstated.
- `billing_adjustment` records source, remaining, reserved, consumed, revoked, and unrecoverable quantities without hidden negative balances.

### Pooled rollover provenance regression

Create two Starter renewal grants with four credits each. Consume three from
the first, temporarily dispute its last credit, consume three from the second,
reinstate the first, and renew so the two remaining credits form one rollover
grant. Consume one rollover credit, then fully refund both original payments in
both orders and with concurrent duplicate delivery.

Expected:

- The remaining balance is four credits from the new renewal, not five.
- The two original payment states total seven unrecoverable credits and one
  revoked credit.
- The consumed rollover credit belongs to exactly one source lot.
- Replay and delivery order do not change the result.
- A rollover grant without complete durable source lots blocks strict
  preflight for support review; it is never attributed heuristically.

## Production Checklist

- [ ] Complete the credit billing launch runbook in `docs/operations/credit-billing-launch.md`.
- [ ] Snapshot existing production subscription and credit state before any backfill.
- [ ] Confirm any active legacy paid users have an explicit migration treatment.
- [ ] Live `STRIPE_*_PRICE_ID` values are configured for Interview Pass, Starter monthly, and Pro monthly.
- [ ] Live webhook endpoint is configured for Checkout, subscription, invoice, and refund events.
- [ ] Webhook signing secret is correct.
- [ ] Customer Portal is configured for Starter and Pro subscription management.
- [ ] A real low-value payment has been tested and refunded.
- [ ] Stripe webhook failures are monitored through `stripe_event_log`.
- [ ] Product analytics distinguish trial grants, checkout grants, subscription renewals, and rollover grants.
- [ ] First top-up pricing decision checkpoint is scheduled after two weeks of launch data or 100 paid credit-consuming sessions.
