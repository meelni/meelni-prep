ALTER TABLE "interview_session" ADD COLUMN "reconnect_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "room_cleanup_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "room_cleanup_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "room_provisioning_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "room_provisioning_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "presence_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "runtime_ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "last_transport_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "last_transport_event_id" text;--> statement-breakpoint
ALTER TABLE "interview_session" ADD COLUMN "last_transport_event_name" text;--> statement-breakpoint
CREATE INDEX "interview_session_reconnect_deadline_idx" ON "interview_session" USING btree ("lifecycle_state","reconnect_deadline_at");--> statement-breakpoint
CREATE INDEX "interview_session_presence_reconciliation_idx" ON "interview_session" USING btree ("lifecycle_state","presence_reconciled_at");--> statement-breakpoint
CREATE INDEX "interview_session_room_cleanup_recovery_idx" ON "interview_session" USING btree ("room_cleanup_pending","room_cleanup_attempted_at");--> statement-breakpoint
CREATE INDEX "interview_session_room_provisioning_recovery_idx" ON "interview_session" USING btree ("room_provisioning_pending","room_provisioning_started_at");--> statement-breakpoint
ALTER TABLE "interview_session" ADD CONSTRAINT "interview_session_room_provisioning_claim_check" CHECK (("interview_session"."room_provisioning_pending" AND "interview_session"."room_provisioning_started_at" IS NOT NULL) OR (NOT "interview_session"."room_provisioning_pending" AND "interview_session"."room_provisioning_started_at" IS NULL));