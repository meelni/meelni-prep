-- Phase 0.5C: Row Level Security Policies for Pricing Tables
-- CRITICAL SECURITY FIX: Prevent unauthorized access to payment data

-- Enable RLS on all pricing tables
ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customer_mapping ENABLE ROW LEVEL SECURITY;

-- ==================== SUBSCRIPTION POLICIES ====================

-- Users can view their own subscription
CREATE POLICY "Users can view own subscription"
  ON subscription FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all subscriptions (for webhook handlers)
CREATE POLICY "Service can manage subscriptions"
  ON subscription FOR ALL
  USING (auth.role() = 'service_role');

-- ==================== USAGE_RECORD POLICIES ====================

-- Users can view their own usage records
CREATE POLICY "Users can view own usage"
  ON usage_record FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all usage records
CREATE POLICY "Service can manage usage"
  ON usage_record FOR ALL
  USING (auth.role() = 'service_role');

-- ==================== PAYMENT_HISTORY POLICIES ====================

-- Users can view their own payment history
CREATE POLICY "Users can view own payment history"
  ON payment_history FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert payments (webhook handler)
CREATE POLICY "Service can insert payments"
  ON payment_history FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Service role can update payments (refunds)
CREATE POLICY "Service can update payments"
  ON payment_history FOR UPDATE
  USING (auth.role() = 'service_role');

-- ==================== STRIPE_EVENT_LOG POLICIES ====================

-- Only service role can access event log (no user access)
CREATE POLICY "Service only event log access"
  ON stripe_event_log FOR ALL
  USING (auth.role() = 'service_role');

-- ==================== STRIPE_CUSTOMER_MAPPING POLICIES ====================

-- Only service role can access customer mapping (no user access)
CREATE POLICY "Service only customer mapping access"
  ON stripe_customer_mapping FOR ALL
  USING (auth.role() = 'service_role');
