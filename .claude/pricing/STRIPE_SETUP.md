# Stripe Integration Setup Guide

**Phase 0.5B Implementation**
**Created**: 2025-11-13
**Status**: Ready for implementation

---

## Overview

This guide covers setting up Stripe for the three-tier subscription pricing model:
- **Free**: $0/month, 3 interviews/month
- **Pro**: $29/month or $249/year, unlimited interviews
- **Premium**: $79/month or $699/year, unlimited interviews + premium features

---

## Prerequisites

1. Stripe account (sign up at https://stripe.com)
2. Stripe CLI installed (for webhook testing): `brew install stripe/stripe-cli/stripe`
3. Environment variables configured (see below)

---

## Stripe Dashboard Configuration

### Step 1: Create Products and Prices

Navigate to **Products** → **Create product** in Stripe Dashboard

#### Product 1: Pro Plan
- **Name**: Meelni Pro
- **Description**: Unlimited mock interviews with AI coach
- **Pricing**:
  - Monthly: $29 USD, recurring, monthly
  - Annual: $249 USD, recurring, yearly
- **Metadata** (add to both prices):
  - `tier`: `pro`
  - `features`: `unlimited_interviews,detailed_feedback,all_interview_types`

#### Product 2: Premium Plan
- **Name**: Meelni Premium
- **Description**: Everything in Pro + AI coach, analytics, custom drills
- **Pricing**:
  - Monthly: $79 USD, recurring, monthly
  - Annual: $699 USD, recurring, yearly
- **Metadata** (add to both prices):
  - `tier`: `premium`
  - `features`: `unlimited_interviews,detailed_feedback,all_interview_types,ai_coach,analytics,custom_drills`

**Note**: Copy the price IDs (e.g., `price_xxxxxxxxxxxxx`) - you'll need these for environment variables.

### Step 2: Configure Customer Portal

Navigate to **Settings** → **Customer portal**

Enable:
- ✅ Cancel subscriptions (allow downgrade to Free)
- ✅ Update payment methods
- ✅ View invoice history
- ❌ Pause subscriptions (not supported for our model)

### Step 3: Set up Webhooks

Navigate to **Developers** → **Webhooks** → **Add endpoint**

- **Endpoint URL**: `https://your-domain.com/api/webhooks/stripe`
- **Description**: Meelni subscription webhooks
- **Events to listen to**:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `customer.subscription.trial_will_end`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `charge.refunded`

**Note**: Copy the webhook signing secret (starts with `whsec_`) - you'll need this for `STRIPE_WEBHOOK_SECRET`.

### Step 4: Enable Test Mode

For development:
1. Toggle **Test mode** ON (top-right of Stripe Dashboard)
2. Use test API keys (starts with `sk_test_`)
3. Use test webhook signing secret (starts with `whsec_test_`)

For production:
1. Toggle **Test mode** OFF
2. Use live API keys (starts with `sk_live_`)
3. Use live webhook signing secret (starts with `whsec_`)

---

## Environment Variables

Add these to `.env.local`:

```bash
# Stripe API Keys (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Stripe Webhook Secret (get from webhook endpoint settings)
STRIPE_WEBHOOK_SECRET=whsec_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Stripe Price IDs (get from Products page)
STRIPE_PRO_MONTHLY_PRICE_ID=price_xxxxxxxxxxxxxxxxxx
STRIPE_PRO_ANNUAL_PRICE_ID=price_xxxxxxxxxxxxxxxxxx
STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_xxxxxxxxxxxxxxxxxx
STRIPE_PREMIUM_ANNUAL_PRICE_ID=price_xxxxxxxxxxxxxxxxxx

# Customer Portal (optional - auto-generated)
# NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/session/xxxxx
```

---

## Testing Webhooks Locally

### Method 1: Stripe CLI (Recommended)

```bash
# Login to Stripe CLI
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# The CLI will output a webhook signing secret (whsec_xxx)
# Use this in .env.local as STRIPE_WEBHOOK_SECRET

# Test specific events
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
```

### Method 2: Ngrok (Alternative)

```bash
# Install ngrok
brew install ngrok

# Start ngrok tunnel
ngrok http 3000

# Use the HTTPS URL in Stripe webhook endpoint
# https://xxxx-xx-xx-xx-xx.ngrok-free.app/api/webhooks/stripe
```

---

## Testing Payment Flows

### Test Cards

Stripe provides test cards for various scenarios:

**Successful payment**:
- Card: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits

**Declined payment**:
- Card: `4000 0000 0000 0002`

**Requires authentication (3D Secure)**:
- Card: `4000 0025 0000 3155`

**Failed payment (insufficient funds)**:
- Card: `4000 0000 0000 9995`

Full list: https://stripe.com/docs/testing

### Test Scenarios

#### Scenario 1: Free → Pro Upgrade
1. User clicks "Upgrade to Pro" in dashboard
2. Redirect to Stripe Checkout with `priceId=STRIPE_PRO_MONTHLY_PRICE_ID`
3. Complete payment with test card `4242 4242 4242 4242`
4. Webhook `customer.subscription.created` fires → subscription table updated
5. Usage record initialized with `interviewsLimit = -1` (unlimited)

#### Scenario 2: Failed Payment (Grace Period)
1. User's subscription renewal fails (card declined)
2. Webhook `invoice.payment_failed` fires
3. Subscription status → `past_due`
4. Grace period set to 7 days from now
5. User can still access interviews during grace period
6. After 7 days: Stripe sends `customer.subscription.deleted` → status = `canceled`

#### Scenario 3: Trial Expiration
1. User starts 7-day Pro trial
2. 3 days before trial ends: Stripe sends `customer.subscription.trial_will_end`
3. Webhook handler logs event (email sent in Phase 1)
4. Trial expires: `customer.subscription.updated` with status change

#### Scenario 4: Refund
1. User requests refund via support
2. Admin issues refund in Stripe Dashboard
3. Webhook `charge.refunded` fires
4. Payment history updated: `status = 'refunded'`

---

## Webhook Idempotency Verification

### How It Works

1. **First webhook delivery**:
   - Event stored in `stripe_event_log` with `status = 'pending'`
   - Webhook handler processes event
   - Status updated to `processed`

2. **Duplicate webhook delivery** (Stripe retries):
   - Check `stripe_event_log` for existing `stripeEventId`
   - If `status = 'processed'`, return success immediately (no processing)
   - If `status = 'failed'`, retry processing (increment `attempts`)

3. **Failed webhook**:
   - Status set to `failed`, `lastError` logged
   - Stripe will retry webhook delivery (exponential backoff)
   - On retry, `attempts` incremented

### Testing Idempotency

```bash
# Send same event twice (should only process once)
stripe trigger customer.subscription.created
# Wait for webhook to process
stripe trigger customer.subscription.created --same-request-id

# Check database:
# SELECT * FROM stripe_event_log WHERE event_type = 'customer.subscription.created';
# Should see status = 'processed', attempts = 1
```

---

## Optimistic Locking Verification

### How It Works

1. **Concurrent webhook scenario**:
   - Webhook A: `customer.subscription.updated` arrives
   - Webhook B: `customer.subscription.updated` arrives (duplicate or late event)
   - Both read subscription version (e.g., `version = 5`)

2. **Webhook A updates first**:
   - UPDATE subscription SET version = 6 WHERE version = 5
   - Success (1 row updated)

3. **Webhook B tries to update**:
   - UPDATE subscription SET version = 6 WHERE version = 5
   - Failure (0 rows updated, version already 6)
   - Error thrown: "Optimistic lock failure"

### Testing Optimistic Locking

```bash
# Manually trigger concurrent updates (simulate race condition)
# This requires two terminal windows

# Terminal 1:
stripe trigger customer.subscription.updated

# Terminal 2 (immediately after):
stripe trigger customer.subscription.updated

# Check logs: One should succeed, one should fail with optimistic lock error
```

---

## Atomic Usage Increment Verification

### How It Works

**Unsafe pattern** (race condition):
```typescript
// DON'T DO THIS
const usage = await getUsage(userId);
if (usage.interviewsUsed < usage.limit) {
  await updateUsage(userId, usage.interviewsUsed + 1);
}
```

**Safe pattern** (atomic SQL):
```sql
-- This is what usage-service.ts does
UPDATE usage_record
SET interviews_used = interviews_used + 1
WHERE user_id = $1
  AND period_start = $2
  AND (interviews_used < interviews_limit OR interviews_limit = -1)
```

### Testing Atomic Increment

```bash
# Simulate concurrent interview starts (race condition test)
# Run this script with Node.js:

for (let i = 0; i < 10; i++) {
  fetch('http://localhost:3000/api/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'test-user', roundType: 'product_sense' }),
  });
}

# For free tier user (limit = 3):
# Expected: Exactly 3 interviews created, 7 rejected with quota error
# If race condition exists: More than 3 interviews created (BAD)
```

---

## Monitoring and Debugging

### Check Webhook Logs

```sql
-- All webhook events
SELECT
  stripe_event_id,
  event_type,
  status,
  attempts,
  last_error,
  created_at
FROM stripe_event_log
ORDER BY created_at DESC
LIMIT 20;

-- Failed events needing retry
SELECT * FROM stripe_event_log WHERE status = 'failed';

-- Duplicate events (idempotency working?)
SELECT stripe_event_id, COUNT(*)
FROM stripe_event_log
GROUP BY stripe_event_id
HAVING COUNT(*) > 1;
```

### Check Payment History

```sql
-- Recent payments
SELECT
  user_id,
  amount_in_cents,
  currency,
  status,
  tier,
  created_at
FROM payment_history
ORDER BY created_at DESC
LIMIT 10;

-- Failed payments needing attention
SELECT * FROM payment_history WHERE status = 'failed';
```

### Check Subscription State

```sql
-- Subscriptions in grace period
SELECT
  user_id,
  tier,
  status,
  grace_period_end,
  updated_at
FROM subscription
WHERE grace_period_end IS NOT NULL
  AND grace_period_end > NOW();

-- Subscriptions past grace period (should be canceled)
SELECT * FROM subscription
WHERE grace_period_end IS NOT NULL
  AND grace_period_end < NOW()
  AND status != 'canceled';
```

---

## Troubleshooting

### Issue: Webhook not firing locally

**Solution**:
```bash
# Ensure Stripe CLI is running
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Check firewall settings (port 3000 must be accessible)
```

### Issue: "Invalid signature" error

**Solution**:
- Verify `STRIPE_WEBHOOK_SECRET` matches Stripe CLI output or Stripe Dashboard
- If using ngrok, webhook secret must match endpoint in Stripe Dashboard

### Issue: Subscription not updating

**Solution**:
```sql
-- Check stripe_event_log for errors
SELECT * FROM stripe_event_log WHERE status = 'failed';

-- Check last_error column for details
```

### Issue: Quota bypass (race condition)

**Solution**:
- Verify atomic usage increment is being used (usage-service.ts)
- Check database constraint:
  ```sql
  SELECT conname, contype, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid = 'usage_record'::regclass
    AND conname = 'usage_record_limit_check';
  ```

---

## Production Checklist

Before launching:

- [ ] Switch Stripe to live mode (disable test mode)
- [ ] Update environment variables with live keys
- [ ] Configure production webhook endpoint (HTTPS required)
- [ ] Test all payment flows with real card (refund after testing)
- [ ] Verify webhook idempotency with production events
- [ ] Set up monitoring alerts for failed webhooks
- [ ] Configure Customer Portal with production branding
- [ ] Test trial flows (7-day Pro, 14-day Premium)
- [ ] Verify email notifications work (Phase 1 requirement)

---

## Reference

- **Stripe Docs**: https://stripe.com/docs/billing/subscriptions/overview
- **Webhook Best Practices**: https://stripe.com/docs/webhooks/best-practices
- **Testing Guide**: https://stripe.com/docs/testing
- **Customer Portal**: https://stripe.com/docs/customer-portal

---

**Last Updated**: 2025-11-13
**Next Review**: After Phase 0.5B testing complete
