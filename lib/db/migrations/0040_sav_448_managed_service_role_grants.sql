-- Managed Supabase projects can apply broad default privileges to service_role
-- when these tables are created. Reset the grants explicitly so managed and
-- local PostgreSQL converge on the same least-privilege contract.
REVOKE ALL ON TABLE
  "transcript_runtime_settlement_command",
  "feedback_generation_stage_attempt",
  "shadow_feedback_artifact"
FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE
  "transcript_runtime_settlement_command"
TO service_role;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE
  "feedback_generation_stage_attempt",
  "shadow_feedback_artifact"
TO service_role;
