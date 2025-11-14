import { db } from "@/lib/db";
import { usageRecord, subscription } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * Usage Service - Atomic quota management
 *
 * Phase 0.5B: Implements atomic usage increment to prevent race conditions
 *
 * Critical fix: Uses SQL-level atomic increment instead of read-then-update pattern
 */

export interface UsageCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  reason?: string;
}

/**
 * Check if user can start a new interview
 *
 * Returns quota status without modifying usage
 */
export async function checkUsageQuota(userId: string): Promise<UsageCheckResult> {
  // Get current subscription
  const userSub = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  if (userSub.length === 0) {
    throw new Error(`No subscription found for user ${userId}`);
  }

  const sub = userSub[0];

  // Unlimited tiers (pro, premium)
  if (sub.tier === "pro" || sub.tier === "premium") {
    return {
      allowed: true,
      currentUsage: 0,
      limit: -1, // unlimited
    };
  }

  // Get current usage record
  const currentUsage = await getCurrentUsageRecord(userId, sub.currentPeriodStart!, sub.currentPeriodEnd!);

  if (!currentUsage) {
    // No usage record yet - create one
    await initializeUsageRecord(userId, sub.currentPeriodStart!, sub.currentPeriodEnd!, sub.tier);
    return {
      allowed: true,
      currentUsage: 0,
      limit: 3, // free tier
    };
  }

  // Check quota
  const allowed = currentUsage.interviewsLimit === -1 || currentUsage.interviewsUsed < currentUsage.interviewsLimit;

  return {
    allowed,
    currentUsage: currentUsage.interviewsUsed,
    limit: currentUsage.interviewsLimit,
    reason: allowed ? undefined : "Monthly quota exceeded",
  };
}

/**
 * Increment usage counter atomically
 *
 * CRITICAL: Uses SQL-level atomic increment to prevent race conditions
 *
 * This replaces the unsafe pattern:
 *   const current = await read();
 *   await update(current + 1);
 *
 * With atomic SQL:
 *   UPDATE usage_record SET interviews_used = interviews_used + 1
 *   WHERE ... AND (interviews_used < interviews_limit OR interviews_limit = -1)
 */
export async function incrementUsage(userId: string): Promise<{ success: boolean; reason?: string }> {
  // Get current subscription
  const userSub = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  if (userSub.length === 0) {
    throw new Error(`No subscription found for user ${userId}`);
  }

  const sub = userSub[0];

  // Unlimited tiers always succeed
  if (sub.tier === "pro" || sub.tier === "premium") {
    return { success: true };
  }

  // Phase 0.5C: ATOMIC INCREMENT with INSERT ON CONFLICT (P0 fix #6)
  // This single query prevents BOTH race conditions:
  // 1. Handles first usage (INSERT) and subsequent usage (UPDATE) atomically
  // 2. Increments interviews_used only if under quota
  // 3. Returns number of rows affected (0 = quota exceeded, 1 = success)
  const result = await db.execute(sql`
    INSERT INTO usage_record (
      user_id, period_start, period_end,
      interviews_used, interviews_limit, tier_snapshot
    )
    VALUES (
      ${userId}, ${sub.currentPeriodStart}, ${sub.currentPeriodEnd},
      1, ${sub.tier === 'free' ? 3 : -1}, ${sub.tier}
    )
    ON CONFLICT (user_id, period_start)
    DO UPDATE SET
      interviews_used = usage_record.interviews_used + 1,
      updated_at = NOW()
    WHERE
      usage_record.interviews_used < usage_record.interviews_limit
      OR usage_record.interviews_limit = -1
  `);

  if (result.rowCount === 0) {
    // Quota exceeded or record not found
    const usage = await getCurrentUsageRecord(userId, sub.currentPeriodStart!, sub.currentPeriodEnd!);
    if (!usage) {
      throw new Error("Usage record not found after initialization");
    }

    return {
      success: false,
      reason: `Monthly quota exceeded (${usage.interviewsUsed}/${usage.interviewsLimit})`,
    };
  }

  return { success: true };
}

/**
 * Get current usage record for billing period
 */
async function getCurrentUsageRecord(userId: string, periodStart: Date, periodEnd: Date) {
  const records = await db
    .select()
    .from(usageRecord)
    .where(
      and(
        eq(usageRecord.userId, userId),
        eq(usageRecord.periodStart, periodStart)
      )
    )
    .limit(1);

  return records[0] || null;
}

/**
 * Initialize usage record for new billing period
 */
async function initializeUsageRecord(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  tier: string
) {
  const limit = tier === "free" ? 3 : -1;

  try {
    await db.insert(usageRecord).values({
      userId,
      periodStart,
      periodEnd,
      interviewsUsed: 0,
      interviewsLimit: limit,
      tierSnapshot: tier,
    });
  } catch (error) {
    // Ignore duplicate key error (race condition on first usage)
    if (!(error instanceof Error) || !error.message.includes("unique")) {
      throw error;
    }
  }
}

/**
 * Reset usage for new billing period
 *
 * Called when subscription renews with new currentPeriodStart/End
 */
export async function resetUsageForNewPeriod(userId: string, newPeriodStart: Date, newPeriodEnd: Date, tier: string) {
  await initializeUsageRecord(userId, newPeriodStart, newPeriodEnd, tier);
}

/**
 * Get usage summary for user (for dashboard)
 */
export async function getUsageSummary(userId: string) {
  const userSub = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  if (userSub.length === 0) {
    return {
      tier: "free",
      interviewsUsed: 0,
      interviewsLimit: 3,
      periodStart: new Date(),
      periodEnd: new Date(),
    };
  }

  const sub = userSub[0];

  if (sub.tier === "pro" || sub.tier === "premium") {
    return {
      tier: sub.tier,
      interviewsUsed: 0,
      interviewsLimit: -1,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
    };
  }

  const usage = await getCurrentUsageRecord(userId, sub.currentPeriodStart!, sub.currentPeriodEnd!);

  return {
    tier: sub.tier,
    interviewsUsed: usage?.interviewsUsed || 0,
    interviewsLimit: usage?.interviewsLimit || 3,
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
  };
}
