ALTER TABLE "account_deletion_request" ADD COLUMN "stripe_subjects" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "account_deletion_request" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "account_deletion_request" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "account_deletion_request" DROP COLUMN "stripe_subscription_fingerprint";--> statement-breakpoint
ALTER TABLE "account_deletion_request" DROP COLUMN "stripe_customer_fingerprint";