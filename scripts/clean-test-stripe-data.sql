-- Clean Test Mode Stripe Data
-- Run this script to remove test mode customer/subscription data when switching to live mode
--
-- WARNING: This will delete all subscriptions with test mode Stripe customer IDs
-- Make sure you're ready to switch to live mode before running this!
--
-- Usage: Run this in your Supabase SQL editor or via psql

-- 1. List all subscriptions with test mode Stripe customer IDs (for review)
SELECT
  id,
  user_id,
  stripe_customer_id,
  stripe_subscription_id,
  tier,
  status,
  created_at
FROM subscription
WHERE
  stripe_customer_id IS NOT NULL
  AND stripe_customer_id LIKE 'cus_%'
ORDER BY created_at DESC;

-- 2. Delete test mode subscriptions (UNCOMMENT TO RUN)
-- DELETE FROM subscription
-- WHERE
--   stripe_customer_id IS NOT NULL
--   AND stripe_customer_id LIKE 'cus_%';

-- 3. Delete test mode payment history (UNCOMMENT TO RUN)
-- DELETE FROM payment_history
-- WHERE
--   stripe_payment_id IS NOT NULL
--   AND stripe_payment_id LIKE 'pi_test_%';

-- 4. Delete test mode Stripe event logs (UNCOMMENT TO RUN)
-- DELETE FROM stripe_event_log
-- WHERE
--   stripe_event_id IS NOT NULL
--   AND stripe_event_id LIKE 'evt_test_%';

-- 5. Verify cleanup - should return 0 rows
SELECT COUNT(*) as test_subscriptions_remaining
FROM subscription
WHERE
  stripe_customer_id IS NOT NULL
  AND stripe_customer_id LIKE 'cus_%';
