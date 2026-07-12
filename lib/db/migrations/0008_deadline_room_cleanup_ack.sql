ALTER TABLE "interview_session" ADD COLUMN "deadline_room_cleanup_status" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "deadline_room_cleanup_acknowledged_at" timestamp with time zone;--> statement-breakpoint
UPDATE "interview_session"
SET "deadline_room_cleanup_status" = 'pending'
WHERE "terminal_reason" = 'time_limit'
  AND "deadline_room_cleanup_status" IS NULL;--> statement-breakpoint
CREATE INDEX "interview_session_deadline_room_cleanup_idx" ON "interview_session" USING btree ("terminal_reason","deadline_room_cleanup_status");--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_deadline_room_cleanup_status_check" CHECK ("interview_session"."deadline_room_cleanup_status" IS NULL OR "interview_session"."deadline_room_cleanup_status" IN ('pending', 'deleted', 'already_absent'));--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_deadline_room_cleanup_ack_check" CHECK (("interview_session"."deadline_room_cleanup_status" IN ('deleted', 'already_absent') AND "interview_session"."deadline_room_cleanup_acknowledged_at" IS NOT NULL) OR ("interview_session"."deadline_room_cleanup_status" IS NULL OR "interview_session"."deadline_room_cleanup_status" = 'pending') AND "interview_session"."deadline_room_cleanup_acknowledged_at" IS NULL);
