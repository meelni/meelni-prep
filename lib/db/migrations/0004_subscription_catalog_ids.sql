ALTER TABLE "subscription" DROP CONSTRAINT IF EXISTS "subscription_tier_check";
--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_tier_check" CHECK ("subscription"."tier" IN ('free', 'starter', 'pro'));
