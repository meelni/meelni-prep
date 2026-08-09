/**
 * User Insights Update Inngest Worker
 * P2-003: Background job for updating user insights after feedback generation
 *
 * This worker triggers after feedback is successfully generated and updates
 * the pre-aggregated user_insights table with the latest statistics.
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { userInsights } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  aggregateUserInsights,
  type UserInsights,
} from "@/lib/evaluation/insights-aggregator";

/**
 * Insights update event payload
 */
interface InsightsUpdateEvent {
  data: {
    userId: string;
    sessionId: string;
  };
}

/**
 * Convert aggregated insights to database format
 *
 * Transforms camelCase field names to snake_case to match JSONB schema
 */
function transformInsightsForDB(insights: UserInsights) {
  return {
    overall_stats: {
      total_sessions: insights.overallStats.totalSessions,
      completed_sessions: insights.overallStats.completedSessions,
      total_minutes: insights.overallStats.totalMinutes,
      avg_score: insights.overallStats.avgScore,
      median_score: insights.overallStats.medianScore,
      percentile_25: insights.overallStats.percentile25,
      percentile_75: insights.overallStats.percentile75,
      percentile_90: insights.overallStats.percentile90,
    },
    by_interview_type: {
      product_sense: {
        count: insights.byInterviewType.product_sense.count,
        avg_score: insights.byInterviewType.product_sense.avgScore,
        last_5_avg: insights.byInterviewType.product_sense.last5Avg,
      },
      analytical: {
        count: insights.byInterviewType.analytical.count,
        avg_score: insights.byInterviewType.analytical.avgScore,
        last_5_avg: insights.byInterviewType.analytical.last5Avg,
      },
      leadership: {
        count: insights.byInterviewType.leadership.count,
        avg_score: insights.byInterviewType.leadership.avgScore,
        last_5_avg: insights.byInterviewType.leadership.last5Avg,
      },
      strategy: {
        count: insights.byInterviewType.strategy.count,
        avg_score: insights.byInterviewType.strategy.avgScore,
        last_5_avg: insights.byInterviewType.strategy.last5Avg,
      },
    },
    by_difficulty: {
      junior: {
        count: insights.byDifficulty.junior.count,
        avg_score: insights.byDifficulty.junior.avgScore,
      },
      intermediate: {
        count: insights.byDifficulty.intermediate.count,
        avg_score: insights.byDifficulty.intermediate.avgScore,
      },
      senior: {
        count: insights.byDifficulty.senior.count,
        avg_score: insights.byDifficulty.senior.avgScore,
      },
    },
    trends: {
      last_5_sessions_avg: insights.trends.last5SessionsAvg,
      all_time_avg: insights.trends.allTimeAvg,
      improvement_trend: insights.trends.improvementTrend,
      velocity: insights.trends.velocity,
    },
    competency_breakdown: {
      structure: insights.competencyBreakdown.structure,
      clarity: insights.competencyBreakdown.clarity,
      insight: insights.competencyBreakdown.insight,
      communication: insights.competencyBreakdown.communication,
      leadership: insights.competencyBreakdown.leadership,
    },
  };
}

/**
 * Inngest Function: Update User Insights
 *
 * This function is triggered after feedback generation completes.
 * It re-aggregates all user data and updates the user_insights table.
 *
 * Steps:
 * 1. Aggregate user insights from all sessions
 * 2. Upsert into user_insights table with optimistic locking
 * 3. Handle version conflicts with retry
 *
 * Performance:
 * - Aggregation: ~50-200ms for typical users (<100 sessions)
 * - DB upsert: ~50-100ms
 * - Total: <300ms target (well under 3s limit)
 *
 * Concurrency:
 * - Limited to 50 jobs/min to prevent DB overload
 * - Optimistic locking prevents race conditions
 */
export const updateUserInsights = inngest.createFunction(
  {
    id: "insights-update",
    name: "Update User Insights",
    retries: 2, // Retry on failure (e.g., DB lock conflicts)
    throttle: {
      limit: 50, // Max 50 concurrent executions
      period: "1m", // Per minute
    },
  },
  { event: "insights/update.requested" },
  async ({ event, step }) => {
    const { userId, sessionId } = event.data as InsightsUpdateEvent["data"];

    // Step 1: Calculate fresh insights from all user sessions
    const insights = await step.run("calculate-insights", async () => {
      return await aggregateUserInsights(userId);
    });

    // Step 2: Upsert into user_insights table with optimistic locking
    const result = await step.run("upsert-insights", async () => {
      // Check if user has existing insights record
      const existing = await db.query.userInsights.findFirst({
        where: eq(userInsights.userId, userId),
      });

      const transformedInsights = transformInsightsForDB(insights);

      if (existing) {
        // Update existing record with optimistic locking
        // Note: Version column check prevents concurrent update conflicts
        const updated = await db
          .update(userInsights)
          .set({
            overallStats: transformedInsights.overall_stats,
            byInterviewType: transformedInsights.by_interview_type,
            byDifficulty: transformedInsights.by_difficulty,
            trends: transformedInsights.trends,
            competencyBreakdown: transformedInsights.competency_breakdown,
            lastSessionId: sessionId,
            lastUpdatedAt: new Date(),
            version: existing.version + 1, // Increment version
          })
          .where(
            and(
              eq(userInsights.userId, userId),
              eq(userInsights.version, existing.version) // Optimistic lock
            )
          )
          .returning();

        if (updated.length === 0) {
          // Version conflict - another process updated first
          // Inngest will retry this step automatically
          throw new Error("Optimistic lock conflict - will retry");
        }

        return { action: "updated", recordId: updated[0].id };
      } else {
        // Insert new record
        const inserted = await db
          .insert(userInsights)
          .values({
            userId: userId,
            overallStats: transformedInsights.overall_stats,
            byInterviewType: transformedInsights.by_interview_type,
            byDifficulty: transformedInsights.by_difficulty,
            trends: transformedInsights.trends,
            competencyBreakdown: transformedInsights.competency_breakdown,
            lastSessionId: sessionId,
            lastUpdatedAt: new Date(),
            version: 1,
          })
          .returning();

        return { action: "created", recordId: inserted[0].id };
      }
    });

    return {
      status: "success",
      userId,
      sessionId,
      action: result.action,
      recordId: result.recordId,
      timestamp: new Date().toISOString(),
    };
  }
);
