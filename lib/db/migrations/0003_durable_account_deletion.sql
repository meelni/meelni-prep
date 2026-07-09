CREATE TABLE "account_deletion_request" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "account_deletion_request_status_check" CHECK ("account_deletion_request"."status" IN ('pending', 'processing', 'failed', 'completed'))
);
--> statement-breakpoint
CREATE INDEX "account_deletion_request_status_updated_idx" ON "account_deletion_request" USING btree ("status","updated_at");
--> statement-breakpoint
ALTER TABLE "account_deletion_request" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "account_deletion_request" FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE "account_deletion_request" TO service_role;
--> statement-breakpoint
CREATE POLICY "Service role has full access to account_deletion_request"
  ON "account_deletion_request"
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
