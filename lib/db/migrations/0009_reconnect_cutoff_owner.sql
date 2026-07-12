ALTER TABLE "interview_session" ADD COLUMN "reconnect_deadline_owner" text;--> statement-breakpoint
UPDATE "interview_session"
SET "reconnect_deadline_owner" = 'reconnect_grace'
WHERE "reconnect_deadline_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_reconnect_deadline_owner_check" CHECK (("interview_session"."reconnect_deadline_at" IS NULL AND "interview_session"."reconnect_deadline_owner" IS NULL) OR ("interview_session"."reconnect_deadline_at" IS NOT NULL AND "interview_session"."reconnect_deadline_owner" IN ('reconnect_grace', 'hard_deadline')));
