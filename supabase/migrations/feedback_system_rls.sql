-- P1-001: Row Level Security policies for Feedback & Insights system
-- This migration adds RLS policies for interview_session, feedback, and transcript_turn tables

-- ============================================================
-- INTERVIEW SESSION RLS POLICIES
-- ============================================================

-- Enable RLS on interview_session table
ALTER TABLE interview_session ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own sessions
CREATE POLICY "Users can view own sessions"
  ON interview_session
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own sessions
CREATE POLICY "Users can insert own sessions"
  ON interview_session
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own sessions
CREATE POLICY "Users can update own sessions"
  ON interview_session
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own sessions
CREATE POLICY "Users can delete own sessions"
  ON interview_session
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- FEEDBACK RLS POLICIES
-- ============================================================

-- Enable RLS on feedback table
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view feedback for their own sessions
CREATE POLICY "Users can view own feedback"
  ON feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM interview_session
      WHERE interview_session.id = feedback.session_id
      AND interview_session.user_id = auth.uid()
    )
  );

-- Policy: Service role can insert feedback (for background jobs)
CREATE POLICY "Service can insert feedback"
  ON feedback
  FOR INSERT
  WITH CHECK (true);

-- Policy: Service role can update feedback (for background jobs)
CREATE POLICY "Service can update feedback"
  ON feedback
  FOR UPDATE
  USING (true);

-- ============================================================
-- TRANSCRIPT TURN RLS POLICIES
-- ============================================================

-- Enable RLS on transcript_turn table
ALTER TABLE transcript_turn ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view transcript turns for their own sessions
CREATE POLICY "Users can view own transcript turns"
  ON transcript_turn
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM interview_session
      WHERE interview_session.id = transcript_turn.session_id
      AND interview_session.user_id = auth.uid()
    )
  );

-- Policy: Users can insert transcript turns for their own sessions
CREATE POLICY "Users can insert own transcript turns"
  ON transcript_turn
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interview_session
      WHERE interview_session.id = transcript_turn.session_id
      AND interview_session.user_id = auth.uid()
    )
  );

-- Policy: Service role can insert transcript turns (for LiveKit agent)
CREATE POLICY "Service can insert transcript turns"
  ON transcript_turn
  FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================

-- Grant service role full access for background jobs
GRANT ALL ON interview_session TO service_role;
GRANT ALL ON feedback TO service_role;
GRANT ALL ON transcript_turn TO service_role;

-- Grant authenticated users read/write access to their own data
GRANT SELECT, INSERT, UPDATE, DELETE ON interview_session TO authenticated;
GRANT SELECT ON feedback TO authenticated;
GRANT SELECT, INSERT ON transcript_turn TO authenticated;

-- ============================================================
-- INDEXES FOR RLS POLICY PERFORMANCE
-- ============================================================

-- These indexes already created by Drizzle migration:
-- - interview_session_user_status_idx (user_id, status)
-- - interview_session_ended_at_idx (ended_at)
-- - feedback_session_status_idx (session_id, status)

-- Comments for future reference
COMMENT ON POLICY "Users can view own sessions" ON interview_session IS 'P1-001: Allow users to view their own interview sessions';
COMMENT ON POLICY "Users can view own feedback" ON feedback IS 'P1-001: Allow users to view feedback for their own sessions (polling support)';
COMMENT ON POLICY "Service can insert feedback" ON feedback IS 'P1-001: Allow Inngest workers to insert feedback records';
COMMENT ON POLICY "Service can update feedback" ON feedback IS 'P1-001: Allow Inngest workers to update feedback status during processing';
