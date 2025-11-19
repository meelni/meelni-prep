-- ====================================================================================
-- MASTER RLS MIGRATION SCRIPT
-- ====================================================================================
-- Purpose: Apply all Row Level Security policies to enforce user data isolation
-- Date: 2025-11-18
--
-- This script applies RLS policies in the correct order to avoid foreign key issues.
-- Run this script in Supabase SQL Editor to secure your database.
-- ====================================================================================

BEGIN;

-- ====================================================================================
-- PART 1: Core User & Session Tables
-- Source: feedback_system_rls.sql
-- ====================================================================================

-- ------------------
-- APP_USER Table
-- ------------------
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON app_user FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON app_user FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Service role has full access to app_user"
  ON app_user FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON app_user TO service_role;
GRANT SELECT, UPDATE ON app_user TO authenticated;

-- ------------------
-- INTERVIEW_SESSION Table
-- ------------------
ALTER TABLE interview_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"
  ON interview_session FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON interview_session FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON interview_session FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON interview_session FOR DELETE
  USING (auth.uid() = user_id);

GRANT ALL ON interview_session TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON interview_session TO authenticated;

-- ------------------
-- FEEDBACK Table
-- ------------------
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback"
  ON feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM interview_session
      WHERE interview_session.id = feedback.session_id
      AND interview_session.user_id = auth.uid()
    )
  );

CREATE POLICY "Service can insert feedback"
  ON feedback FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update feedback"
  ON feedback FOR UPDATE
  USING (true);

GRANT ALL ON feedback TO service_role;
GRANT SELECT ON feedback TO authenticated;

-- ------------------
-- TRANSCRIPT_TURN Table
-- ------------------
ALTER TABLE transcript_turn ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transcript turns"
  ON transcript_turn FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM interview_session
      WHERE interview_session.id = transcript_turn.session_id
      AND interview_session.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own transcript turns"
  ON transcript_turn FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interview_session
      WHERE interview_session.id = transcript_turn.session_id
      AND interview_session.user_id = auth.uid()
    )
  );

CREATE POLICY "Service can insert transcript turns"
  ON transcript_turn FOR INSERT
  WITH CHECK (true);

GRANT ALL ON transcript_turn TO service_role;
GRANT SELECT, INSERT ON transcript_turn TO authenticated;

-- ====================================================================================
-- PART 2: User Settings & Insights
-- Source: user_settings_rls.sql + 20251118000001_enable_remaining_rls.sql
-- ====================================================================================

-- ------------------
-- USER_SETTINGS Table
-- ------------------
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON user_settings FOR DELETE
  USING (auth.uid() = user_id);

GRANT ALL ON user_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings TO authenticated;

-- ------------------
-- USER_INSIGHTS Table
-- ------------------
ALTER TABLE user_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own insights"
  ON user_insights FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role has full access to user_insights"
  ON user_insights FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON user_insights TO service_role;
GRANT SELECT ON user_insights TO authenticated;

-- ====================================================================================
-- PART 3: Question Bank
-- Source: 20251118000001_enable_remaining_rls.sql
-- ====================================================================================

-- ------------------
-- INTERVIEW_QUESTION Table (Public Read)
-- ------------------
ALTER TABLE interview_question ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view questions"
  ON interview_question FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Service role has full access to interview_question"
  ON interview_question FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON interview_question TO service_role;
GRANT SELECT ON interview_question TO authenticated;

-- ------------------
-- SESSION_QUESTION Table
-- ------------------
ALTER TABLE session_question ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own session questions"
  ON session_question FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM interview_session
      WHERE interview_session.id = session_question.session_id
      AND interview_session.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own session questions"
  ON session_question FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interview_session
      WHERE interview_session.id = session_question.session_id
      AND interview_session.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role has full access to session_question"
  ON session_question FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON session_question TO service_role;
GRANT SELECT, INSERT ON session_question TO authenticated;

-- ====================================================================================
-- PART 4: Billing & Subscription Tables
-- Source: 20251113000001_add_billing_rls_policies.sql
-- ====================================================================================

-- ------------------
-- SUBSCRIPTION Table
-- ------------------
ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON subscription FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own subscription"
  ON subscription FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role has full access to subscription"
  ON subscription FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON subscription TO service_role;
GRANT SELECT, UPDATE ON subscription TO authenticated;

-- ------------------
-- USAGE_RECORD Table
-- ------------------
ALTER TABLE usage_record ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage records"
  ON usage_record FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role has full access to usage_record"
  ON usage_record FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON usage_record TO service_role;
GRANT SELECT ON usage_record TO authenticated;

-- ------------------
-- PAYMENT_HISTORY Table
-- ------------------
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment history"
  ON payment_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role has full access to payment_history"
  ON payment_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON payment_history TO service_role;
GRANT SELECT ON payment_history TO authenticated;

-- ------------------
-- STRIPE_EVENT_LOG Table (Service Role Only)
-- ------------------
ALTER TABLE stripe_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to stripe_event_log"
  ON stripe_event_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users cannot access stripe_event_log"
  ON stripe_event_log FOR SELECT TO authenticated
  USING (false);

GRANT ALL ON stripe_event_log TO service_role;

-- ------------------
-- STRIPE_CUSTOMER_MAPPING Table (Service Role Only)
-- ------------------
ALTER TABLE stripe_customer_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to stripe_customer_mapping"
  ON stripe_customer_mapping FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users cannot access stripe_customer_mapping"
  ON stripe_customer_mapping FOR SELECT TO authenticated
  USING (false);

GRANT ALL ON stripe_customer_mapping TO service_role;

-- ====================================================================================
-- VERIFICATION
-- ====================================================================================

-- Check that RLS is enabled on all tables
SELECT
  schemaname,
  tablename,
  rowsecurity as "RLS Enabled"
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'app_user',
    'interview_session',
    'feedback',
    'transcript_turn',
    'user_settings',
    'user_insights',
    'interview_question',
    'session_question',
    'subscription',
    'usage_record',
    'payment_history',
    'stripe_event_log',
    'stripe_customer_mapping'
  )
ORDER BY tablename;

-- Count policies per table
SELECT
  schemaname,
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

COMMIT;

-- ====================================================================================
-- SUCCESS MESSAGE
-- ====================================================================================
-- If you see this message, all RLS policies have been applied successfully!
-- Run the verification queries above to confirm RLS is enabled on all tables.
-- ====================================================================================
