ALTER TABLE "account_deletion_request" ADD COLUMN "stripe_subscription_fingerprint" text;--> statement-breakpoint
ALTER TABLE "account_deletion_request" ADD COLUMN "stripe_customer_fingerprint" text;--> statement-breakpoint
ALTER TABLE "stripe_event_log" ADD COLUMN "subject_fingerprint" text;--> statement-breakpoint
CREATE INDEX "stripe_event_log_subject_fingerprint_idx" ON "stripe_event_log" USING btree ("subject_fingerprint");