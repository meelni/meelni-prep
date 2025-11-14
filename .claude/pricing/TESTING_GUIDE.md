# Stripe Testing Guide

**Phase 0.5 Implementation**
**Created**: 2025-01-13
**Status**: Ready for testing

---

## Prerequisites

✅ Stripe test keys configured in `.env.local`
✅ Database schema deployed with RLS policies
✅ Webhook handler code deployed

---

## Step 1: Create Stripe Products

Go to https://dashboard.stripe.com/test/products (ensure you're in **Test mode** - toggle in top right)

### Product 1: Meelni Pro

1. Click **"Add product"**
2. Fill in details:
   - **Name**: Meelni Pro
   - **Description**: Unlimited mock interviews with AI feedback
   - **Pricing model**: Standard pricing
   - **Price**: $29.00 USD
   - **Billing period**: Monthly (recurring)
3. Click **"Add pricing"** to add annual option:
   - **Price**: $249.00 USD
   - **Billing period**: Yearly (recurring)
4. Click **"Save product"**

**Copy the Price IDs**:
- Monthly: `price_xxxxxxxxxxxxx` → Save for `STRIPE_PRO_MONTHLY_PRICE_ID`
- Annual: `price_xxxxxxxxxxxxx` → Save for `STRIPE_PRO_ANNUAL_PRICE_ID`

### Product 2: Meelni Premium

1. Click **"Add product"**
2. Fill in details:
   - **Name**: Meelni Premium
   - **Description**: Everything in Pro + personalized coaching and analytics
   - **Pricing model**: Standard pricing
   - **Price**: $79.00 USD
   - **Billing period**: Monthly (recurring)
3. Click **"Add pricing"** to add annual option:
   - **Price**: $699.00 USD
   - **Billing period**: Yearly (recurring)
4. Click **"Save product"**

**Copy the Price IDs**:
- Monthly: `price_xxxxxxxxxxxxx` → Save for `STRIPE_PREMIUM_MONTHLY_PRICE_ID`
- Annual: `price_xxxxxxxxxxxxx` → Save for `STRIPE_PREMIUM_ANNUAL_PRICE_ID`

### Update Environment Variables

Add the price IDs to `.env.local`:

```bash
STRIPE_PRO_MONTHLY_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_PRO_ANNUAL_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_PREMIUM_ANNUAL_PRICE_ID=price_xxxxxxxxxxxxx
```

**Restart your dev server** after updating:
```bash
npm run dev
```

---

## Step 2: Install Stripe CLI

The Stripe CLI allows you to test webhooks locally without deploying.

### macOS (Homebrew)
```bash
brew install stripe/stripe-cli/stripe
```

### Other platforms
Download from: https://github.com/stripe/stripe-cli/releases

### Authenticate
```bash
stripe login
```

This will open your browser to authorize the CLI.

---

## Step 3: Forward Webhooks Locally

Start the webhook forwarder in a **new terminal window**:

```bash
cd /Users/savi/conductor/meelni-prep/.conductor/mogadishu
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

**Important**: Copy the webhook signing secret from the output:
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Update `.env.local` with this secret:
```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Restart your dev server** to pick up the new secret.

---

## Step 4: Test Webhook Events

Keep the `stripe listen` command running, and in another terminal, trigger test events:

### Test 1: Subscription Created
```bash
stripe trigger customer.subscription.created
```

**Expected result**:
- ✅ Event logged in `stripe_event_log` table with status `processed`
- ✅ Subscription record created in `subscription` table
- ✅ Customer mapping created in `stripe_customer_mapping` table
- ✅ Usage record initialized in `usage_record` table

**Verify**:
```sql
-- Check event log
SELECT stripe_event_id, event_type, status, attempts, processed_at
FROM stripe_event_log
ORDER BY created_at DESC LIMIT 1;

-- Check subscription
SELECT user_id, tier, status, stripe_subscription_id
FROM subscription
ORDER BY created_at DESC LIMIT 1;

-- Check usage record
SELECT user_id, interviews_used, interviews_limit, tier_snapshot
FROM usage_record
ORDER BY created_at DESC LIMIT 1;
```

### Test 2: Payment Succeeded
```bash
stripe trigger invoice.payment_succeeded
```

**Expected result**:
- ✅ Payment record created in `payment_history` table with status `succeeded`
- ✅ Subscription status remains `active`

**Verify**:
```sql
SELECT user_id, amount_in_cents, currency, status, tier
FROM payment_history
ORDER BY created_at DESC LIMIT 1;
```

### Test 3: Payment Failed (Grace Period)
```bash
stripe trigger invoice.payment_failed
```

**Expected result**:
- ✅ Payment record created with status `failed`
- ✅ Subscription status changed to `past_due`
- ✅ Grace period set to 7 days from now

**Verify**:
```sql
SELECT user_id, status, grace_period_end, updated_at
FROM subscription
WHERE status = 'past_due'
ORDER BY updated_at DESC LIMIT 1;

-- Grace period should be ~7 days in future
SELECT grace_period_end,
       grace_period_end - NOW() as time_remaining
FROM subscription
WHERE grace_period_end IS NOT NULL;
```

### Test 4: Webhook Idempotency
```bash
# Send same event twice
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.updated
```

**Expected result**:
- ✅ First event: status = `processed`
- ✅ Second event: skipped with "already_processed" message
- ✅ Only ONE update to subscription table

**Verify**:
```sql
-- Should see 2 events with same stripe_event_id
SELECT stripe_event_id, event_type, status, attempts, processed_at
FROM stripe_event_log
ORDER BY created_at DESC LIMIT 5;

-- Check subscription version only incremented once
SELECT user_id, version, last_event_timestamp
FROM subscription
ORDER BY updated_at DESC LIMIT 1;
```

---

## Step 5: Test Quota Enforcement

This tests the atomic usage increment and quota limits.

### Test Free Tier Quota (3 interviews)

**Setup**: Create a test user with free tier subscription

1. Sign up a test user in your app
2. Verify they have a free tier subscription:
```sql
SELECT user_id, tier, status FROM subscription WHERE tier = 'free' LIMIT 1;
```

3. Call the usage increment API 4 times:
```bash
# Replace {userId} with actual user ID from query above
curl -X POST http://localhost:3000/api/usage/increment \
  -H "Content-Type: application/json" \
  -d '{"userId": "{userId}"}'
```

**Expected results**:
- ✅ First 3 calls: `{"success": true}`
- ✅ Fourth call: `{"success": false, "reason": "Monthly quota exceeded (3/3)"}`

**Verify**:
```sql
SELECT user_id, interviews_used, interviews_limit, tier_snapshot
FROM usage_record
WHERE user_id = '{userId}';

-- Should show: interviews_used = 3, interviews_limit = 3
```

### Test Race Condition Protection

Run 10 concurrent requests to simulate race condition:

```bash
# Create a test script
cat > test_race_condition.sh << 'EOF'
#!/bin/bash
USER_ID="{userId}"  # Replace with actual user ID

for i in {1..10}; do
  curl -X POST http://localhost:3000/api/usage/increment \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"$USER_ID\"}" &
done

wait
EOF

chmod +x test_race_condition.sh
./test_race_condition.sh
```

**Expected result**:
- ✅ Exactly 3 successful increments (for free tier)
- ✅ 7 failures with "quota exceeded" message
- ✅ `interviews_used` in database = 3 (not 4+ due to race condition)

---

## Step 6: Test RLS Policies

### Test User Data Isolation

**Setup**: Create two test users

```sql
-- User 1
INSERT INTO app_user (id, email, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'user1@test.com', 'User One');

-- User 2
INSERT INTO app_user (id, email, name)
VALUES ('00000000-0000-0000-0000-000000000002', 'user2@test.com', 'User Two');

-- Create subscriptions for both
INSERT INTO subscription (user_id, tier, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'pro', 'active');

INSERT INTO subscription (user_id, tier, status)
VALUES ('00000000-0000-0000-0000-000000000002', 'premium', 'active');
```

**Test 1: User can only see own subscription**

In your app (authenticated as User 1):
```typescript
// This should return only User 1's subscription
const { data } = await supabase.from('subscription').select('*');
```

**Expected**: Only User 1's subscription (tier = 'pro')

**Test 2: User cannot access other user's data**

Try to query with explicit user_id filter:
```typescript
// This should fail or return empty (RLS blocks it)
const { data } = await supabase
  .from('subscription')
  .select('*')
  .eq('user_id', '00000000-0000-0000-0000-000000000002');
```

**Expected**: Empty result or permission error

**Test 3: Service role can access all data**

Using service role key (for webhook handler):
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// This should return ALL subscriptions
const { data } = await supabase.from('subscription').select('*');
```

**Expected**: Both User 1 and User 2 subscriptions returned

---

## Step 7: Test Customer Mapping Fallback

This tests the critical fallback when Stripe metadata is lost.

### Scenario: Metadata Overwritten via Customer Portal

1. **Setup**: Create a subscription with metadata
```bash
stripe trigger customer.subscription.created
```

2. **Simulate metadata loss**: Update the Stripe subscription without userId metadata
```bash
# Get subscription ID from previous step
stripe subscriptions update sub_xxxxxxxxxxxxx --metadata[userId]=
```

3. **Trigger webhook update**:
```bash
stripe trigger customer.subscription.updated
```

**Expected result**:
- ✅ Webhook handler falls back to `stripe_customer_mapping` table
- ✅ Subscription update succeeds (no error about missing userId)

**Verify**:
```sql
-- Check customer mapping was used as fallback
SELECT stripe_customer_id, user_id, updated_at
FROM stripe_customer_mapping
ORDER BY updated_at DESC LIMIT 1;
```

---

## Step 8: Verify All RLS Policies

Run this query to confirm all 9 policies are active:

```sql
SELECT
  tablename,
  policyname,
  CASE
    WHEN cmd = 'SELECT' THEN 'Read'
    WHEN cmd = 'INSERT' THEN 'Create'
    WHEN cmd = 'UPDATE' THEN 'Update'
    WHEN cmd = 'DELETE' THEN 'Delete'
    WHEN cmd = '*' THEN 'All'
  END as permission,
  CASE
    WHEN qual::text LIKE '%auth.uid()%' THEN 'User (own data)'
    WHEN qual::text LIKE '%service_role%' THEN 'Service role'
    ELSE 'Other'
  END as applies_to
FROM pg_policies
WHERE tablename IN ('subscription', 'usage_record', 'payment_history', 'stripe_event_log', 'stripe_customer_mapping')
ORDER BY tablename, policyname;
```

**Expected output**: 9 policies

| tablename               | policyname                           | permission | applies_to   |
| ----------------------- | ------------------------------------ | ---------- | ------------ |
| payment_history         | Users can view own payment history   | Read       | User         |
| payment_history         | Service can insert payments          | Create     | Service role |
| payment_history         | Service can update payments          | Update     | Service role |
| stripe_customer_mapping | Service only customer mapping access | All        | Service role |
| stripe_event_log        | Service only event log access        | All        | Service role |
| subscription            | Users can view own subscription      | Read       | User         |
| subscription            | Service can manage subscriptions     | All        | Service role |
| usage_record            | Users can view own usage             | Read       | User         |
| usage_record            | Service can manage usage             | All        | Service role |

---

## Troubleshooting

### Issue: Webhook signature verification failed

**Cause**: `STRIPE_WEBHOOK_SECRET` doesn't match the secret from `stripe listen`

**Fix**:
1. Check the output from `stripe listen` for the webhook secret
2. Update `.env.local` with the correct secret
3. Restart dev server

### Issue: "Unknown Stripe price ID" error

**Cause**: Price IDs in `.env.local` don't match actual Stripe product price IDs

**Fix**:
1. Go to Stripe Dashboard → Products
2. Click on each product and copy the price IDs
3. Update `.env.local`
4. Restart dev server

### Issue: Quota not enforcing (more than 3 interviews for free tier)

**Cause**: Race condition in usage increment OR check constraint not working

**Fix**:
1. Verify atomic SQL is being used (check `usage-service.ts` line 109-125)
2. Check usage_record constraint:
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'usage_record'::regclass
AND conname = 'usage_record_limit_check';
```

### Issue: RLS policies not working

**Cause**: RLS not enabled on table OR policies not applied correctly

**Fix**:
1. Verify RLS is enabled:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'subscription';
```

2. Re-apply RLS migration if needed:
```sql
-- Run migration: lib/db/migrations/0002_pricing_rls_policies.sql
```

---

## Next Steps After Testing

Once all tests pass:

1. **Document any issues found** in GitHub issues
2. **Update `.claude/pricing/IMPLEMENTATION_STATUS.md`** with test results
3. **Proceed to Phase 1**: Build pricing page UI and checkout flow
4. **Or deploy to staging**: Merge branch and deploy to Vercel staging environment

---

**Last Updated**: 2025-01-13
**Test Status**: Ready for execution
