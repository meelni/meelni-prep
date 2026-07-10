ALTER TABLE "user_settings" ALTER COLUMN "share_anonymous_data" SET DEFAULT false;--> statement-breakpoint
UPDATE "user_settings" SET "share_anonymous_data" = false WHERE "share_anonymous_data" = true;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "analytics_consent" text DEFAULT 'undecided' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "analytics_consent_version" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "analytics_consent_source" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "analytics_consent_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "analytics_consent_check" CHECK ("user_settings"."analytics_consent" IN ('undecided', 'accepted', 'declined'));--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "analytics_consent_metadata_check" CHECK (("user_settings"."analytics_consent" = 'undecided' AND "user_settings"."analytics_consent_version" IS NULL AND "user_settings"."analytics_consent_source" IS NULL AND "user_settings"."analytics_consent_updated_at" IS NULL) OR ("user_settings"."analytics_consent" IN ('accepted', 'declined') AND "user_settings"."analytics_consent_version" > 0 AND "user_settings"."analytics_consent_source" IN ('banner', 'settings', 'legacy_decline', 'account_sync') AND "user_settings"."analytics_consent_updated_at" IS NOT NULL));
