ALTER TABLE "interview_session" ADD COLUMN "reconnect_deadline_owner" text;--> statement-breakpoint
UPDATE "interview_session"
SET "reconnect_deadline_owner" = CASE
  -- Mirror normalizeInterviewDurationMinutes: only numeric 15/30/45 values
  -- are canonical; missing and legacy config shapes use the 30-minute default.
  WHEN "started_at" IS NOT NULL
    AND "reconnect_deadline_at" >= "started_at" + (
      CASE
        WHEN "config"->'duration' IN ('15'::jsonb, '30'::jsonb, '45'::jsonb)
          THEN ("config"->>'duration')::integer
        ELSE 30
      END * interval '1 minute'
    )
    THEN 'hard_deadline'
  ELSE 'reconnect_grace'
END
WHERE "reconnect_deadline_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_reconnect_deadline_owner_check" CHECK (("interview_session"."reconnect_deadline_at" IS NULL AND "interview_session"."reconnect_deadline_owner" IS NULL) OR ("interview_session"."reconnect_deadline_at" IS NOT NULL AND "interview_session"."reconnect_deadline_owner" IN ('reconnect_grace', 'hard_deadline')));
