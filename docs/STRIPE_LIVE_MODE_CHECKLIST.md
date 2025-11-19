# Stripe Live Mode Migration Checklist

**Date**: 2025-01-18
**Status**: In Progress

---

## ✅ Completed Steps

### 1. Stripe Dashboard Configuration
- [x] Created "Meelni Pro" product in live mode
- [x] Created monthly price ($29/month): `price_1SV4xXCdoT5hfbsF9dYbpWGD`
- [x] Created annual price ($249/year): `price_1SV4yICdoT5hfbsFD6F9fIAa`
- [x] Created webhook endpoint: `https://meelni.com/api/webhooks/stripe`
- [x] Selected 7 required webhook events
- [x] Copied webhook signing secret: `whsec_0yeofyUU1jHRnoSLds8N5ZkeDwG4qJEl`

### 2. Environment Variables
- [x] Updated `.env.local` with live keys
- [x] Updated `.env.example` documentation
- [x] Committed `.env.example` changes to git

### 3. Code Fixes
- [x] Added test/live mode detection in `/api/billing/portal`
- [x] Added test/live mode detection in `/api/customer-portal`
- [x] Added graceful error handling for mode mismatch
- [x] Verified no hardcoded test values in codebase

---

## 🔄 Next Steps

### 4. Vercel Environment Variables
- [ ] Go to Vercel dashboard → Project Settings → Environment Variables
- [ ] Add for **Production** environment:
  ```
  STRIPE_SECRET_KEY=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
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51SSreECdoT5hfbsFYo75ci42SJ4tFivSb803PiphuNTfQAu12NsEfoSQbeuCENyd3cRZ98ySm0R0VQCANAQ77kHE00tQ0kaB37
  STRIPE_WEBHOOK_SECRET=whsec_0yeofyUU1jHRnoSLds8N5ZkeDwG4qJEl
  STRIPE_PRO_MONTHLY_PRICE_ID=price_1SV4xXCdoT5hfbsF9dYbpWGD
  STRIPE_PRO_ANNUAL_PRICE_ID=price_1SV4yICdoT5hfbsFD6F9fIAa
  ```

### 5. Clean Up Test Data (Optional)
- [ ] Review test subscriptions: Run `scripts/clean-test-stripe-data.sql` (SELECT query)
- [ ] Backup database before deletion
- [ ] Delete test subscriptions (uncomment DELETE queries in script)
- [ ] Verify cleanup completed

### 6. Deploy to Production
- [ ] Merge `fix-stripe-customer-mismatch` branch to main
- [ ] Push to GitHub
- [ ] Verify Vercel deployment succeeds
- [ ] Check deployment logs for errors

### 7. Testing in Production
- [ ] **Checkout Flow**:
  - [ ] Go to https://meelni.com/pricing
  - [ ] Click "Start 7-Day Trial" for Pro plan
  - [ ] Complete checkout (use real card or test card in live mode)
  - [ ] Verify redirect to success page
  - [ ] Check subscription appears in dashboard

- [ ] **Webhook Events**:
  - [ ] Go to Stripe Dashboard → Webhooks
  - [ ] Verify `customer.subscription.created` event received
  - [ ] Check webhook response is 200 OK
  - [ ] Verify subscription record created in database

- [ ] **Customer Portal**:
  - [ ] Go to dashboard → Billing section
  - [ ] Click "Manage Subscription"
  - [ ] Verify portal opens successfully
  - [ ] Test updating payment method
  - [ ] Test canceling subscription

- [ ] **Trial Expiration**:
  - [ ] Wait 7 days OR manually trigger `customer.subscription.trial_will_end` in Stripe
  - [ ] Verify webhook processed correctly
  - [ ] Check user receives trial ending notification (if implemented)

### 8. Monitoring
- [ ] Monitor Stripe webhook logs for failed events
- [ ] Check application logs for Stripe errors
- [ ] Set up alerts for failed payments
- [ ] Monitor subscription churn rate

---

## 🐛 Known Issues & Fixes

### Issue 1: "No such customer" Error
**Symptom**: Error when clicking "Manage Subscription" - `Error: No such customer: 'cus_TRWQAvzRQmsufn'`

**Root Cause**: Database contains test mode customer IDs (`cus_*` from test mode), but app is now using live mode keys.

**Fix Applied**: ✅
- Added customer validation in `/api/billing/portal/route.ts`
- Added customer validation in `/api/customer-portal/route.ts`
- Returns helpful error: "Your subscription was created in test mode. Please create a new subscription to access the customer portal."

**User Action**: Users with test subscriptions must create new subscriptions in live mode.

---

## 📊 Testing Scenarios

### Scenario 1: New User Upgrade (Happy Path)
1. User signs up (free tier)
2. Clicks "Upgrade to Pro"
3. Completes checkout with trial
4. Subscription created in live mode
5. Can access customer portal ✅

### Scenario 2: Existing Test User (Mode Mismatch)
1. User has test mode subscription in DB
2. Clicks "Manage Subscription"
3. Receives clear error message: "Your subscription was created in test mode..."
4. Must create new subscription in live mode
5. Old test subscription can be cleaned up via SQL script

### Scenario 3: Failed Payment
1. User's trial expires
2. Payment fails (card declined)
3. Webhook `invoice.payment_failed` fires
4. Subscription enters grace period
5. User can update payment method in portal

---

## 🔍 Debugging Commands

### Check Stripe Mode
```bash
# Check which mode your keys are for
echo $STRIPE_SECRET_KEY | grep -o "^sk_[^_]*"
# Output: sk_live (production) or sk_test (development)
```

### View Stripe Logs
```bash
# In Stripe Dashboard
# Go to: Developers → Logs → select date range
```

### Test Webhook Locally
```bash
# Forward webhooks to localhost (requires Stripe CLI)
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test event
stripe trigger customer.subscription.created
```

---

## 📞 Rollback Plan

If issues occur after deploying to live mode:

1. **Immediate Rollback** (< 5 minutes):
   ```bash
   # In Vercel dashboard, rollback to previous deployment
   # Settings → Deployments → Previous deployment → Promote to Production
   ```

2. **Switch Back to Test Mode** (if needed):
   - Update Vercel env vars to use `sk_test_*` and `pk_test_*` keys
   - Redeploy
   - Note: Live customers won't work in test mode!

3. **Database Restore** (if test data deleted):
   - Restore from Supabase backup (if available)
   - Or accept loss of test data (recommended - it's just test data)

---

## ✅ Sign-off

- [ ] Developer verified all checklist items
- [ ] Tested in production with real card (then refunded)
- [ ] Monitoring in place for failed webhooks
- [ ] Team notified of live mode switch
- [ ] Documentation updated

**Switched to Live Mode**: ______________________ (Date)

**Verified By**: ______________________ (Name)

---

**Last Updated**: 2025-01-18
