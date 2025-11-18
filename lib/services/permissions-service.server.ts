/**
 * Server-Side Permissions Service
 *
 * Functions that require database access and can only be called from server-side code.
 */

import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema-pricing";
import { eq } from "drizzle-orm";
import { type SubscriptionTier } from "./permissions-service";

/**
 * Get user's subscription tier from database
 *
 * NOTE: This function can ONLY be called from server-side code (API routes, server components).
 * For client components, fetch the subscription via an API endpoint instead.
 *
 * @param userId - User's ID
 * @returns Subscription tier (defaults to 'free' if no subscription found)
 */
export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  const userSubscription = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  if (!userSubscription[0]) {
    return "free"; // Default to free tier if no subscription exists
  }

  const tier = userSubscription[0].tier as SubscriptionTier;
  return tier;
}
