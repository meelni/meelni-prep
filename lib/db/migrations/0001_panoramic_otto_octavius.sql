CREATE TABLE "payment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_invoice_id" text,
	"stripe_event_id" text,
	"amount_in_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text NOT NULL,
	"tier" text,
	"billing_cycle" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"failure_reason" text,
	"receipt_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_history_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "payment_history_stripe_event_id_unique" UNIQUE("stripe_event_id"),
	CONSTRAINT "payment_history_status_check" CHECK ("payment_history"."status" IN ('succeeded', 'failed', 'refunded', 'canceled'))
);
--> statement-breakpoint
CREATE TABLE "stripe_customer_mapping" (
	"stripe_customer_id" text PRIMARY KEY NOT NULL,
	"stripe_subscription_id" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_event_log_stripe_event_id_unique" UNIQUE("stripe_event_id"),
	CONSTRAINT "stripe_event_log_status_check" CHECK ("stripe_event_log"."status" IN ('pending', 'processed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"billing_cycle" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"pro_trial_used" boolean DEFAULT false NOT NULL,
	"premium_trial_used" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"grace_period_end" timestamp with time zone,
	"plan_name" text,
	"price_in_cents" integer,
	"currency" text DEFAULT 'usd',
	"version" integer DEFAULT 1 NOT NULL,
	"last_event_timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "subscription_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscription_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "subscription_tier_check" CHECK ("subscription"."tier" IN ('free', 'pro', 'premium')),
	CONSTRAINT "subscription_status_check" CHECK ("subscription"."status" IN ('active', 'canceled', 'past_due', 'paused', 'trialing')),
	CONSTRAINT "subscription_billing_cycle_check" CHECK ("subscription"."billing_cycle" IS NULL OR "subscription"."billing_cycle" IN ('monthly', 'annual'))
);
--> statement-breakpoint
CREATE TABLE "usage_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"interviews_used" integer DEFAULT 0 NOT NULL,
	"interviews_limit" integer NOT NULL,
	"tier_snapshot" text NOT NULL,
	"reset_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_record_user_period_uniq" UNIQUE("user_id","period_start"),
	CONSTRAINT "usage_record_limit_check" CHECK ("usage_record"."interviews_used" <= "usage_record"."interviews_limit" OR "usage_record"."interviews_limit" = -1)
);
--> statement-breakpoint
CREATE TABLE "user_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"overall_stats" jsonb NOT NULL,
	"by_interview_type" jsonb NOT NULL,
	"by_difficulty" jsonb NOT NULL,
	"trends" jsonb NOT NULL,
	"competency_breakdown" jsonb NOT NULL,
	"last_session_id" uuid,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_customer_mapping" ADD CONSTRAINT "stripe_customer_mapping_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_insights" ADD CONSTRAINT "user_insights_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_insights" ADD CONSTRAINT "user_insights_last_session_id_interview_session_id_fk" FOREIGN KEY ("last_session_id") REFERENCES "public"."interview_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_history_user_id_idx" ON "payment_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_history_status_idx" ON "payment_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_history_created_at_idx" ON "payment_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payment_history_stripe_event_id_idx" ON "payment_history" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "stripe_customer_mapping_user_id_idx" ON "stripe_customer_mapping" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stripe_customer_mapping_subscription_id_idx" ON "stripe_customer_mapping" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "stripe_event_log_stripe_event_id_idx" ON "stripe_event_log" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "stripe_event_log_status_idx" ON "stripe_event_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stripe_event_log_event_type_idx" ON "stripe_event_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "stripe_event_log_created_at_idx" ON "stripe_event_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscription_stripe_customer_idx" ON "subscription" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "subscription_stripe_subscription_idx" ON "subscription" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_tier_status_idx" ON "subscription" USING btree ("tier","status");--> statement-breakpoint
CREATE INDEX "subscription_user_id_idx" ON "subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_record_user_id_idx" ON "usage_record" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_record_period_end_idx" ON "usage_record" USING btree ("period_end");--> statement-breakpoint
CREATE INDEX "usage_record_tier_snapshot_idx" ON "usage_record" USING btree ("tier_snapshot");--> statement-breakpoint
CREATE INDEX "user_insights_user_id_idx" ON "user_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_insights_last_updated_at_idx" ON "user_insights" USING btree ("last_updated_at");