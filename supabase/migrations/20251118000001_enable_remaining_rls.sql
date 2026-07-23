-- Migration: Enable RLS on remaining tables
-- Date: 2025-11-18
-- Purpose: Complete RLS coverage for app_user, interview_question, session_question, and user_insights

-- ====================
-- 1. APP_USER Table RLS
-- ====================

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON app_user;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON app_user
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON app_user;

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON app_user
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Service role has full access to app_user" ON app_user;

-- Policy: Service role has full access (for admin operations)
CREATE POLICY "Service role has full access to app_user"
  ON app_user
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ====================
-- 2. INTERVIEW_QUESTION Table RLS (Public Read, Admin Write)
-- ====================

ALTER TABLE interview_question ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view questions" ON interview_question;

-- Policy: All authenticated users can read questions (public question bank)
CREATE POLICY "Authenticated users can view questions"
  ON interview_question
  FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Service role has full access to interview_question" ON interview_question;

-- Policy: Service role can manage questions (admin-only writes)
CREATE POLICY "Service role has full access to interview_question"
  ON interview_question
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ====================
-- 3. SESSION_QUESTION Table RLS (User Isolation)
-- ====================

ALTER TABLE session_question ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own session questions" ON session_question;

-- Policy: Users can view questions used in their own sessions
CREATE POLICY "Users can view own session questions"
  ON session_question
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM interview_session
      WHERE interview_session.id = session_question.session_id
      AND interview_session.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own session questions" ON session_question;

-- Policy: Users can insert questions for their own sessions
CREATE POLICY "Users can insert own session questions"
  ON session_question
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interview_session
      WHERE interview_session.id = session_question.session_id
      AND interview_session.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role has full access to session_question" ON session_question;

-- Policy: Service role has full access (for background operations)
CREATE POLICY "Service role has full access to session_question"
  ON session_question
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ====================
-- 4. USER_INSIGHTS Table RLS (User Isolation)
-- ====================

ALTER TABLE user_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own insights" ON user_insights;

-- Policy: Users can view their own insights
CREATE POLICY "Users can view own insights"
  ON user_insights
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role has full access to user_insights" ON user_insights;

-- Policy: Service role has full access (for analytics jobs)
CREATE POLICY "Service role has full access to user_insights"
  ON user_insights
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ====================
-- 5. GRANT PERMISSIONS
-- ====================

-- Grant service role full access for background jobs
GRANT ALL ON app_user TO service_role;
GRANT ALL ON interview_question TO service_role;
GRANT ALL ON session_question TO service_role;
GRANT ALL ON user_insights TO service_role;

-- Grant authenticated users appropriate access
GRANT SELECT, UPDATE ON app_user TO authenticated;
GRANT SELECT ON interview_question TO authenticated;
GRANT SELECT, INSERT ON session_question TO authenticated;
GRANT SELECT ON user_insights TO authenticated;

-- ====================
-- 6. COMMENTS
-- ====================

COMMENT ON POLICY "Users can view own profile" ON app_user IS 'Allow users to view their own profile data';
COMMENT ON POLICY "Authenticated users can view questions" ON interview_question IS 'Public question bank - all authenticated users can read active questions';
COMMENT ON POLICY "Users can view own session questions" ON session_question IS 'Allow users to see which questions were used in their sessions';
COMMENT ON POLICY "Users can view own insights" ON user_insights IS 'Allow users to view their pre-aggregated analytics data';
