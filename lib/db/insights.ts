/**
 * Database queries for user insights
 *
 * Provides typed helper functions for interacting with the user_insights table.
 * These are thin wrappers around the aggregation engine for future extensibility.
 */

import {
  aggregateUserInsights,
  type UserInsights,
} from "@/lib/evaluation/insights-aggregator";

/**
 * Fetch user insights from user_insights table
 *
 * Returns cached insights if available and recent (within last hour).
 * Falls back to real-time aggregation if no cached data exists.
 *
 * @param userId - UUID of the user
 * @returns User insights data
 *
 * @example
 * ```typescript
 * const insights = await getUserInsights(userId);
 * console.log(`Avg score: ${insights.overallStats.avgScore}`);
 * ```
 */
export async function getUserInsights(userId: string): Promise<UserInsights> {
  // For MVP, we always calculate fresh (no user_insights table yet)
  // This function provides an extension point for future caching

  return aggregateUserInsights(userId);
}

/**
 * Upsert user insights to user_insights table
 *
 * Updates cached insights after a new session completes.
 * Uses optimistic locking via version field.
 *
 * @param userId - UUID of the user
 * @param insights - Calculated insights data
 * @param lastSessionId - ID of the session that triggered update
 *
 * @example
 * ```typescript
 * await upsertUserInsights(userId, insights, sessionId);
 * ```
 */
export async function upsertUserInsights(
  userId: string,
  insights: UserInsights,
  lastSessionId: string
): Promise<void> {
  void userId;
  void insights;
  void lastSessionId;

  // For MVP: No-op (insights calculated on-demand)
  // TODO P2-003: Implement after user_insights table deployed

  // Future implementation:
  // const existing = await db.query.userInsights.findFirst({
  //   where: eq(userInsights.userId, userId),
  // });
  //
  // if (existing) {
  //   await db.update(userInsights)
  //     .set({
  //       ...insights,
  //       lastSessionId,
  //       lastUpdatedAt: new Date(),
  //       version: existing.version + 1,
  //     })
  //     .where(and(
  //       eq(userInsights.userId, userId),
  //       eq(userInsights.version, existing.version)
  //     ));
  // } else {
  //   await db.insert(userInsights).values({
  //     userId,
  //     ...insights,
  //     lastSessionId,
  //   });
  // }
}

/**
 * Check if insights are stale (need refresh)
 *
 * @param userId - UUID of the user
 * @param maxAgeMinutes - Max age before considered stale (default: 60)
 * @returns True if insights should be refreshed
 */
export async function areInsightsStale(
  userId: string,
  maxAgeMinutes: number = 60
): Promise<boolean> {
  void userId;
  void maxAgeMinutes;

  // For MVP: Always stale (no cache)
  return true;

  // Future implementation:
  // const insights = await db.query.userInsights.findFirst({
  //   where: eq(userInsights.userId, userId),
  // });
  //
  // if (!insights) return true;
  //
  // const ageMinutes = (Date.now() - new Date(insights.lastUpdatedAt).getTime()) / 1000 / 60;
  // return ageMinutes > maxAgeMinutes;
}
