# Stripe Payment Flow Test Plan

**Status**: Test Mode
**Created**: 2025-11-17
**Stripe Docs**: https://docs.stripe.com/testing

---

## Overview

This document provides a comprehensive test plan for verifying the Stripe payment integration in Meelni. All tests use Stripe test mode with test card numbers.

## Prerequisites

1. **Stripe Dashboard**: Access to Stripe test mode dashboard
2. **Webhook CLI**: Install Stripe CLI for local webhook testing
3. **Environment**: Verify `.env.local` has test API keys (starts with `pk_test_` and `sk_test_`)
4. **Database**: Clean test database or ability to reset subscription data

## Test Card Numbers

### Success Scenarios

| Card Number | Description | Use Case |
|------------|-------------|----------|
| `4242 4242 4242 4242` | Visa (Success) | Standard successful payment |
| `5555 5555 5555 4444` | Mastercard (Success) | Alternative successful payment |
| `3782 822463 10005` | American Express | AMEX successful payment |
| `6011 1111 1111 1117` | Discover | Discover successful payment |

**Card Details for All Success Cards**:
- **Expiry**: Any future date (e.g., 12/34)
- **CVC**: Any 3 digits (e.g., 123)
- **ZIP**: Any 5 digits (e.g., 12345)

### Decline Scenarios

| Card Number | Error Code | Description |
|------------|------------|-------------|
| `4000 0000 0000 0002` | card_declined | Generic decline |
| `4000 0000 0000 9995` | insufficient_funds | Insufficient funds |
| `4000 0000 0000 9987` | lost_card | Card reported lost |
| `4000 0000 0000 9979` | stolen_card | Card reported stolen |
| `4000 0000 0000 0069` | expired_card | Expired card |
| `4000 0000 0000 0127` | incorrect_cvc | Incorrect CVC |
| `4000 0000 0000 0119` | processing_error | Generic processing error |

### Special Scenarios

| Card Number | Behavior | Use Case |
|------------|----------|----------|
| `4000 0025 0000 3155` | 3D Secure (Required) | Tests SCA authentication |
| `4000 0000 0000 3220` | 3D Secure (Optional) | Optional SCA |
| `4000 0082 6000 0000` | Charge succeeds, dispute later | Fraud simulation |
| `4000 0000 0000 0341` | Charge succeeds, attach fails | Setup intent failure |

---

## Test Scenarios

### 1. Pro Monthly Subscription (Happy Path)

**Goal**: Verify successful Pro monthly subscription with 7-day trial

**Steps**:
1. Navigate to `/pricing`
2. Select "Monthly" billing period
3. Click "Start 7-Day Free Trial" on Pro tier
4. Enter test email: `test+pro_monthly@meelni.com`
5. Enter card: `4242 4242 4242 4242`
6. Complete checkout

**Expected Results**:
- ✅ Redirected to `/pricing/success`
- ✅ Success message: "Welcome to Meelni Pro!"
- ✅ Database: `subscription.tier = 'pro'`
- ✅ Database: `subscription.status = 'trialing'`
- ✅ Database: `subscription.billingCycle = 'monthly'`
- ✅ Database: `subscription.trialEnd` set to 7 days from now
- ✅ Database: `subscription.proTrialUsed = true`
- ✅ Stripe Dashboard: Subscription created with 7-day trial
- ✅ Webhook received: `customer.subscription.created`
- ✅ `stripe_event_log` records event as "processed"

**Verification Queries**:
```sql
SELECT tier, status, billing_cycle, trial_end, pro_trial_used, stripe_subscription_id
FROM subscription
WHERE user_id = (SELECT id FROM app_user WHERE email = 'test+pro_monthly@meelni.com');

SELECT * FROM stripe_event_log
WHERE event_type = 'customer.subscription.created'
ORDER BY created_at DESC LIMIT 1;
```

---

### 2. Premium Annual Subscription (Happy Path)

**Goal**: Verify successful Premium annual subscription with 14-day trial

**Steps**:
1. Navigate to `/pricing`
2. Toggle to "Annual" billing period
3. Click "Start 14-Day Free Trial" on Premium tier
4. Enter test email: `test+premium_annual@meelni.com`
5. Enter card: `5555 5555 5555 4444` (Mastercard)
6. Complete checkout

**Expected Results**:
- ✅ Redirected to `/pricing/success`
- ✅ Database: `subscription.tier = 'premium'`
- ✅ Database: `subscription.status = 'trialing'`
- ✅ Database: `subscription.billingCycle = 'annual'`
- ✅ Database: `subscription.trialEnd` set to 14 days from now
- ✅ Database: `subscription.premiumTrialUsed = true`
- ✅ Stripe Dashboard: Annual subscription with 14-day trial
- ✅ Webhook: `customer.subscription.created` processed

---

### 3. Card Declined (Generic)

**Goal**: Test payment failure with generic decline

**Steps**:
1. Navigate to `/pricing`
2. Select Pro Monthly
3. Enter card: `4000 0000 0000 0002`
4. Complete checkout

**Expected Results**:
- ❌ Stripe shows error: "Your card was declined."
- ❌ User remains on Stripe Checkout page
- ❌ No redirect to `/pricing/success`
- ❌ No subscription created in database
- ❌ No webhook events processed

---

### 4. Insufficient Funds

**Goal**: Test payment failure due to insufficient funds

**Steps**:
1. Select Pro Annual
2. Enter card: `4000 0000 0000 9995`
3. Complete checkout

**Expected Results**:
- ❌ Error: "Your card has insufficient funds."
- ❌ No subscription created
- ❌ User can retry with different card

---

### 5. 3D Secure Authentication (SCA)

**Goal**: Verify Strong Customer Authentication flow

**Steps**:
1. Select Premium Monthly
2. Enter card: `4000 0025 0000 3155`
3. Complete checkout
4. Complete 3D Secure challenge (test mode auto-succeeds)

**Expected Results**:
- ✅ 3D Secure modal appears
- ✅ After completing, payment succeeds
- ✅ Subscription created with `status = 'trialing'`
- ✅ Webhook processed successfully

---

### 6. User Cancels Checkout

**Goal**: Test cancellation during checkout

**Steps**:
1. Start Pro Monthly checkout
2. Click browser back button or close tab
3. Or click "Back" link in Stripe Checkout

**Expected Results**:
- ✅ Redirected to `/pricing/canceled`
- ✅ Message: "Checkout Canceled"
- ✅ No subscription created
- ✅ No database changes
- ✅ User can click "Back to Pricing" to retry

---

### 7. Webhook Idempotency

**Goal**: Verify duplicate webhooks don't create duplicate records

**Steps**:
1. Complete successful Pro Monthly subscription
2. In Stripe Dashboard → Webhooks, find the `customer.subscription.created` event
3. Click "Resend webhook" 3 times
4. Check database

**Expected Results**:
- ✅ Only 1 subscription record exists
- ✅ `stripe_event_log` shows 1 event with `status = 'processed'`
- ✅ Console logs: "Event {id} already processed, skipping"
- ✅ No duplicate payment records

**Verification**:
```sql
SELECT COUNT(*) FROM subscription WHERE user_id = '...'; -- Should be 1

SELECT stripe_event_id, status, attempts, processed_at
FROM stripe_event_log
WHERE stripe_event_id = 'evt_xxx'; -- Should show 1 row, status = 'processed'
```

---

### 8. Failed Payment (Past Due)

**Goal**: Test subscription status when payment fails after trial

**Steps**:
1. Create Pro Monthly subscription
2. Wait for trial to end OR manually trigger `invoice.payment_failed` webhook
3. Use Stripe CLI:
   ```bash
   stripe trigger invoice.payment_failed
   ```

**Expected Results**:
- ✅ Database: `subscription.status = 'past_due'`
- ✅ Database: `subscription.gracePeriodEnd` set to 7 days from now
- ✅ `payment_history` record created with `status = 'failed'`
- ✅ Webhook: `invoice.payment_failed` processed
- ✅ User retains access during 7-day grace period

**Verification**:
```sql
SELECT status, grace_period_end FROM subscription WHERE user_id = '...';

SELECT status, failure_reason FROM payment_history
WHERE user_id = '...'
ORDER BY created_at DESC LIMIT 1;
```

---

### 9. Payment Recovery After Failure

**Goal**: Test status update when failed payment succeeds

**Steps**:
1. Have subscription in `past_due` state (from Test #8)
2. Trigger successful payment webhook:
   ```bash
   stripe trigger invoice.payment_succeeded
   ```

**Expected Results**:
- ✅ Database: `subscription.status = 'active'`
- ✅ Database: `subscription.gracePeriodEnd = NULL`
- ✅ `payment_history` record with `status = 'succeeded'`
- ✅ Webhook processed

---

### 10. Subscription Cancellation

**Goal**: Test subscription cancellation flow

**Steps**:
1. Create active Pro subscription
2. Navigate to Stripe Customer Portal (future feature) OR
3. Manually trigger webhook:
   ```bash
   stripe trigger customer.subscription.deleted
   ```

**Expected Results**:
- ✅ Database: `subscription.status = 'canceled'`
- ✅ Database: `subscription.canceledAt` set to current timestamp
- ✅ Webhook: `customer.subscription.deleted` processed
- ✅ User retains access until `currentPeriodEnd`

---

### 11. Optimistic Locking (Race Condition)

**Goal**: Verify concurrent webhook handling doesn't corrupt data

**Steps**:
1. Create subscription
2. Send 2 simultaneous `customer.subscription.updated` webhooks with different data
3. Use Stripe CLI or webhook testing tool

**Expected Results**:
- ✅ Only one update succeeds
- ✅ Second update fails with "Optimistic lock failure" error
- ✅ `subscription.version` increments by 1 (not 2)
- ✅ Database remains consistent

**Verification**:
```sql
SELECT version, updated_at FROM subscription WHERE user_id = '...';
-- Version should be 2, not 3
```

---

### 12. Trial Tracking Per Tier

**Goal**: Verify users can't reuse trials for same tier

**Steps**:
1. Create Pro trial subscription
2. Cancel subscription
3. Try to create another Pro trial

**Expected Results**:
- ✅ Database: `subscription.proTrialUsed = true` (remains true)
- ✅ Second Pro subscription should NOT have trial
- ✅ User CAN still use Premium trial (different tier)

**Verification**:
```sql
SELECT pro_trial_used, premium_trial_used FROM subscription WHERE user_id = '...';
-- pro_trial_used = true, premium_trial_used = false
```

---

### 13. Stripe Customer Mapping Fallback

**Goal**: Verify userId recovery when metadata is lost

**Steps**:
1. Create subscription
2. Manually delete `metadata.userId` from Stripe Customer in Dashboard
3. Trigger webhook: `customer.subscription.updated`

**Expected Results**:
- ✅ Webhook handler checks `stripe_customer_mapping` table
- ✅ userId successfully retrieved from mapping
- ✅ Subscription updated correctly
- ✅ No errors in logs

**Verification**:
```sql
SELECT stripe_customer_id, user_id FROM stripe_customer_mapping
WHERE stripe_customer_id = 'cus_xxx';
```

---

### 14. Refund Processing

**Goal**: Test refund handling

**Steps**:
1. Create paid subscription (skip trial or complete it)
2. Trigger refund webhook:
   ```bash
   stripe trigger charge.refunded
   ```

**Expected Results**:
- ✅ `payment_history` record updated to `status = 'refunded'`
- ✅ Webhook: `charge.refunded` processed
- ✅ Subscription status unchanged (refund ≠ cancellation)

---

### 15. Usage Record Initialization

**Goal**: Verify usage records created for new billing periods

**Steps**:
1. Create Pro subscription
2. Webhook: `customer.subscription.created` fires
3. Check database

**Expected Results**:
- ✅ `usage_record` created with:
  - `userId` = user ID
  - `periodStart` = subscription start
  - `periodEnd` = subscription end
  - `interviewsUsed = 0`
  - `interviewsLimit = -1` (unlimited for Pro)
  - `tierSnapshot = 'pro'`

**Verification**:
```sql
SELECT * FROM usage_record WHERE user_id = '...' ORDER BY created_at DESC LIMIT 1;
```

---

### 16. Promotion Code Application

**Goal**: Test Stripe promotion codes

**Steps**:
1. Create promotion code in Stripe Dashboard (e.g., `SAVE50` for 50% off)
2. Start Pro Monthly checkout
3. Click "Add promotion code" in Stripe Checkout
4. Enter `SAVE50`
5. Complete checkout

**Expected Results**:
- ✅ Discount applied in checkout UI
- ✅ Subscription created with reduced price
- ✅ Stripe invoice shows discount
- ✅ Webhook processed normally

---

### 17. Expired Card

**Goal**: Test expired card handling

**Steps**:
1. Select Pro Monthly
2. Enter card: `4000 0000 0000 0069`
3. Enter expiry: `12/20` (past date)
4. Complete checkout

**Expected Results**:
- ❌ Error: "Your card has expired."
- ❌ No subscription created

---

### 18. Incorrect CVC

**Goal**: Test CVC validation

**Steps**:
1. Select Premium Annual
2. Enter card: `4000 0000 0000 0127`
3. Enter CVC: `123` (will fail)
4. Complete checkout

**Expected Results**:
- ❌ Error: "Your card's security code is incorrect."
- ❌ No subscription created

---

## Webhook Testing (Local Development)

### Setup Stripe CLI

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

### Trigger Test Webhooks

```bash
# Subscription created
stripe trigger customer.subscription.created

# Payment succeeded
stripe trigger invoice.payment_succeeded

# Payment failed
stripe trigger invoice.payment_failed

# Trial ending soon (3 days before)
stripe trigger customer.subscription.trial_will_end

# Subscription deleted
stripe trigger customer.subscription.deleted

# Refund processed
stripe trigger charge.refunded
```

---

## Database Verification Queries

### Check Subscription State
```sql
SELECT
  u.email,
  s.tier,
  s.status,
  s.billing_cycle,
  s.trial_end,
  s.current_period_start,
  s.current_period_end,
  s.stripe_subscription_id,
  s.pro_trial_used,
  s.premium_trial_used,
  s.version
FROM subscription s
JOIN app_user u ON s.user_id = u.id
WHERE u.email LIKE 'test+%'
ORDER BY s.created_at DESC;
```

### Check Payment History
```sql
SELECT
  u.email,
  ph.amount_in_cents,
  ph.currency,
  ph.status,
  ph.tier,
  ph.failure_reason,
  ph.created_at
FROM payment_history ph
JOIN app_user u ON ph.user_id = u.id
ORDER BY ph.created_at DESC
LIMIT 10;
```

### Check Webhook Events
```sql
SELECT
  stripe_event_id,
  event_type,
  status,
  attempts,
  last_error,
  processed_at,
  created_at
FROM stripe_event_log
ORDER BY created_at DESC
LIMIT 20;
```

### Check Usage Records
```sql
SELECT
  u.email,
  ur.tier_snapshot,
  ur.interviews_used,
  ur.interviews_limit,
  ur.period_start,
  ur.period_end
FROM usage_record ur
JOIN app_user u ON ur.user_id = u.id
ORDER BY ur.created_at DESC
LIMIT 10;
```

---

## Edge Cases

### 1. Multiple Rapid Clicks on Checkout Button

**Test**: Click "Start Trial" button 5 times rapidly

**Expected**: Only 1 checkout session created, subsequent clicks show loading state

---

### 2. Browser Back During Checkout

**Test**: Click browser back button mid-checkout

**Expected**: Redirected to `/pricing/canceled`, no subscription created

---

### 3. Checkout Session Expired

**Test**: Get checkout URL, wait 24 hours, try to access

**Expected**: Stripe shows "Session expired" error, no charge

---

### 4. Webhook Arrives Before User Redirects

**Test**: Complete checkout with slow network, webhook arrives first

**Expected**: Database updated, user sees correct state on `/pricing/success`

---

### 5. Duplicate Email (Existing Customer)

**Test**: Create subscription with `test@example.com`, try again with same email

**Expected**: Stripe uses existing customer, updates subscription

---

## Production Checklist

Before deploying to production:

- [ ] Replace test API keys with live keys in `.env.production`
- [ ] Configure live webhook endpoint in Stripe Dashboard
- [ ] Verify webhook signing secret is correct
- [ ] Test at least one successful payment with real card (then refund)
- [ ] Verify SSL certificate valid for webhook endpoint
- [ ] Set up Stripe webhook monitoring/alerts
- [ ] Configure Stripe email notifications for customers
- [ ] Test Customer Portal for subscription management
- [ ] Verify tax calculations if applicable
- [ ] Set up fraud prevention (Stripe Radar)

---

## Known Issues & Fixes

### Issue: Webhook Not Received Locally

**Fix**: Ensure Stripe CLI is running:
```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

### Issue: "Invalid signature" Error

**Fix**: Verify `STRIPE_WEBHOOK_SECRET` in `.env.local` matches CLI output

### Issue: Database Shows Old Subscription

**Fix**: Check `stripe_event_log` for failed events, retry them

---

## Test Execution Log

| Test # | Scenario | Status | Date | Notes |
|--------|----------|--------|------|-------|
| 1 | Pro Monthly Happy Path | ⏳ Pending | | |
| 2 | Premium Annual Happy Path | ⏳ Pending | | |
| 3 | Card Declined | ⏳ Pending | | |
| 4 | Insufficient Funds | ⏳ Pending | | |
| 5 | 3D Secure | ⏳ Pending | | |
| 6 | Checkout Cancel | ⏳ Pending | | |
| 7 | Webhook Idempotency | ⏳ Pending | | |
| 8 | Failed Payment | ⏳ Pending | | |
| 9 | Payment Recovery | ⏳ Pending | | |
| 10 | Subscription Cancel | ⏳ Pending | | |

---

## Contact

**Questions?** Ask in #stripe-testing channel or contact your lead engineer.
