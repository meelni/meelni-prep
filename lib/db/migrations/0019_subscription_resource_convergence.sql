ALTER TABLE "subscription" ADD COLUMN "stripe_resource_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "stripe_resource_created_event_timestamp" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "stripe_resource_created_event_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "retired_stripe_subscription_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL;