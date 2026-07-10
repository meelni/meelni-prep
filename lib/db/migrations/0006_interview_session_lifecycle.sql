ALTER TABLE "interview_session" ADD COLUMN "lifecycle_state" text DEFAULT 'created' NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "lifecycle_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "terminal_reason" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "ending_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "last_transition_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing rows predate the canonical lifecycle. Preserve the legacy status
-- column and translate only outcomes the old data can prove. Historical rows
-- cannot prove that LiveKit became usable. They also cannot prove why generic
-- completions, errors, or abandonments occurred, so activation stays unknown
-- and those terminal outcomes use legacy_unknown. Only too_short proves
-- insufficient signal under the retired workflow. An in_progress row with
-- ended_at may be a crash between legacy writes, so it is conservatively
-- abandoned rather than counted as a successful completion.
UPDATE "interview_session"
SET
  "lifecycle_state" = CASE
    WHEN "status" = 'error' THEN 'failed'
    WHEN "status" IN ('abandoned', 'too_short') THEN 'abandoned'
    WHEN "status" = 'completed' THEN 'completed'
    WHEN "ended_at" IS NOT NULL THEN 'abandoned'
    ELSE 'connecting'
  END,
  "terminal_reason" = CASE
    WHEN "status" = 'too_short' THEN 'insufficient_signal'
    WHEN "status" IN ('error', 'abandoned') THEN 'legacy_unknown'
    WHEN "status" = 'completed' OR "ended_at" IS NOT NULL THEN 'legacy_unknown'
    ELSE NULL
  END,
  "status" = CASE
    WHEN "status" = 'error' THEN 'error'
    WHEN "status" = 'too_short' THEN 'too_short'
    WHEN "status" = 'abandoned' THEN 'abandoned'
    WHEN "status" = 'completed' THEN 'completed'
    WHEN "ended_at" IS NOT NULL THEN 'abandoned'
    ELSE 'in_progress'
  END,
  "activated_at" = NULL,
  "ending_at" = CASE
    WHEN "status" IN ('completed', 'abandoned', 'too_short')
      OR "ended_at" IS NOT NULL
      THEN "ended_at"
    ELSE NULL
  END,
  "last_transition_at" = COALESCE("ended_at", "started_at", now()),
  "lifecycle_version" = 1;--> statement-breakpoint
CREATE INDEX "interview_session_lifecycle_state_transition_idx" ON "interview_session" USING btree ("lifecycle_state","last_transition_at");--> statement-breakpoint
CREATE INDEX "interview_session_user_lifecycle_state_idx" ON "interview_session" USING btree ("user_id","lifecycle_state");--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_lifecycle_state_check" CHECK ("interview_session"."lifecycle_state" IN ('created', 'connecting', 'active', 'reconnecting', 'ending', 'completed', 'abandoned', 'failed'));--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_terminal_reason_check" CHECK ("interview_session"."terminal_reason" IS NULL OR "interview_session"."terminal_reason" IN ('user_end', 'time_limit', 'disconnect_timeout', 'provider_failure', 'insufficient_signal', 'legacy_unknown'));--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_lifecycle_version_check" CHECK ("interview_session"."lifecycle_version" >= 1);--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_terminal_reason_state_check" CHECK (("interview_session"."lifecycle_state" IN ('ending', 'completed', 'abandoned', 'failed') AND "interview_session"."terminal_reason" IS NOT NULL) OR ("interview_session"."lifecycle_state" NOT IN ('ending', 'completed', 'abandoned', 'failed') AND "interview_session"."terminal_reason" IS NULL));--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_ending_at_state_check" CHECK ("interview_session"."ending_at" IS NULL OR "interview_session"."lifecycle_state" IN ('ending', 'completed', 'abandoned', 'failed'));
