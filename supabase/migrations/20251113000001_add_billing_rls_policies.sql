-- Migration: Enable Row Level Security on all billing tables
-- Date: 2025-11-13
-- Purpose: Enforce user data isolation on subscription, usage, payment, and Stripe tables

-- ====================
-- 1. Enable RLS on all billing tables
-- ====================

ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customer_mapping ENABLE ROW LEVEL SECURITY;

-- ====================
-- 2. Subscription table policies (user isolation)
-- ====================

-- Users can only SELECT their own subscription
CREATE POLICY "Users can view own subscription"
  ON subscription
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can only UPDATE their own subscription (for cancellation requests)
CREATE POLICY "Users can update own subscription"
  ON subscription
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can do everything (for webhooks and admin operations)
CREATE POLICY "Service role has full access to subscription"
  ON subscription
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ====================
-- 3. Usage record policies (user isolation)
-- ====================

-- Users can only SELECT their own usage records
CREATE POLICY "Users can view own usage records"
  ON usage_record
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role can do everything (usage tracked server-side)
CREATE POLICY "Service role has full access to usage_record"
  ON usage_record
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ====================
-- 4. Payment history policies (user isolation)
-- ====================

-- Users can only SELECT their own payment history
CREATE POLICY "Users can view own payment history"
  ON payment_history
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role can do everything (payments created by webhooks)
CREATE POLICY "Service role has full access to payment_history"
  ON payment_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ====================
-- 5. Stripe event log policies (service role only)
-- ====================

-- Service role only (webhooks and admin)
CREATE POLICY "Service role has full access to stripe_event_log"
  ON stripe_event_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No user access (internal audit log)
CREATE POLICY "Users cannot access stripe_event_log"
  ON stripe_event_log
  FOR SELECT
  TO authenticated
  USING (false);

-- ====================
-- 6. Stripe customer mapping policies (service role only)
-- ====================

-- Service role only (webhooks and admin)
CREATE POLICY "Service role has full access to stripe_customer_mapping"
  ON stripe_customer_mapping
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No user access (internal mapping table)
CREATE POLICY "Users cannot access stripe_customer_mapping"
  ON stripe_customer_mapping
  FOR SELECT
  TO authenticated
  USING (false);
