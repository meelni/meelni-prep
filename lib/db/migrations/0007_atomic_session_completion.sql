ALTER TABLE "feedback" ADD COLUMN "completion_tier" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "completion_stats" jsonb;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "completion_recommendations" jsonb;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "dispatch_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "dispatch_event_id" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "dispatch_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "dispatch_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "dispatch_last_error" text;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_dispatch_event_id_idx" ON "feedback" USING btree ("dispatch_event_id");--> statement-breakpoint
CREATE INDEX "feedback_dispatch_recovery_idx" ON "feedback" USING btree ("dispatch_status","dispatch_claimed_at");--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_dispatch_status_check" CHECK ("feedback"."dispatch_status" IN ('not_required', 'pending', 'sending', 'sent', 'failed'));--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_dispatch_attempts_check" CHECK ("feedback"."dispatch_attempts" >= 0);--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_completion_tier_check" CHECK ("feedback"."completion_tier" IS NULL OR "feedback"."completion_tier" IN ('full', 'partial', 'insufficient', 'abandoned'));--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_dispatch_event_required_check" CHECK (("feedback"."dispatch_status" = 'not_required' AND "feedback"."dispatch_event_id" IS NULL) OR ("feedback"."dispatch_status" <> 'not_required' AND "feedback"."dispatch_event_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_dispatch_claim_check" CHECK ("feedback"."dispatch_status" <> 'sending' OR ("feedback"."dispatch_claimed_at" IS NOT NULL AND "feedback"."dispatch_attempts" > 0));--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_dispatch_sent_check" CHECK ("feedback"."dispatch_status" <> 'sent' OR ("feedback"."dispatched_at" IS NOT NULL AND "feedback"."dispatch_attempts" > 0));