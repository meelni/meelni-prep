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

4. Local webhook forwarding is running:

```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

## Test Cards

| Card number | Result |
| --- | --- |
| `4242 4242 4242 4242` | Successful Visa payment |
| `5555 5555 5555 4444` | Successful Mastercard payment |
| `3782 822463 10005` | Successful Amex payment |
| `4000 0000 0000 0002` | Generic decline |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0025 0000 3155` | 3D Secure required |

Use any future expiry, any CVC, and any ZIP in test mode.

## Scenario 1: Interview Pass Purchase

**Goal**: Verify one-time Checkout grants exactly one credit.

Steps:

1. Start Checkout with `catalogId = "interview_pass"`.
2. Complete payment with `4242 4242 4242 4242`.
3. Confirm redirect to `/pricing/success`.
4. Confirm `checkout.session.completed` processed.

Expected:

- Checkout Session mode is `payment`.
- Checkout metadata includes `userId` and `catalogId = "interview_pass"`.
- One `credit_grant` row exists with `catalog_id = 'interview_pass'`.
- Grant has `original_credits = 1`, `remaining_credits = 1`, source `checkout`, and an expiration about 30 days after purchase.
- Replaying the same event does not create another grant.

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

Expected:

- Checkout Session mode is `subscription`.
- `subscription.tier = 'starter'`.
- `subscription.status` is `active` or another mapped Stripe status.
- One subscription renewal grant exists with `catalog_id = 'starter'`, `original_credits = 4`, source `subscription_renewal`.
- Any eligible unused Starter credits are rolled over up to 4 credits with source `rollover`.

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

## Scenario 9: Customer Mapping Fallback

**Goal**: Verify webhooks can recover `userId` when Stripe metadata is missing.

Steps:

1. Complete Starter or Pro checkout.
2. Remove `metadata.userId` from the Stripe customer or subscription in test mode.
3. Trigger `customer.subscription.updated` or replay a subscription event.

Expected:

- Webhook resolves the user through `stripe_customer_mapping`.
- Subscription update processes successfully.

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

## Production Checklist

- [ ] Live `STRIPE_*_PRICE_ID` values are configured for Interview Pass, Starter monthly, and Pro monthly.
- [ ] Live webhook endpoint is configured for Checkout, subscription, invoice, and refund events.
- [ ] Webhook signing secret is correct.
- [ ] Customer Portal is configured for Starter and Pro subscription management.
- [ ] A real low-value payment has been tested and refunded.
- [ ] Stripe webhook failures are monitored through `stripe_event_log`.
- [ ] Product analytics distinguish trial grants, checkout grants, subscription renewals, and rollover grants.
