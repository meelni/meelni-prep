/**
 * GET /api/insights
 *
 * Returns pre-aggregated user insights for the authenticated user.
 *
 * Response includes:
 * - Overall stats (sessions, scores, streaks)
 * - Breakdown by interview type
 * - Breakdown by difficulty
 * - Performance trends
 * - Competency averages
 *
 * Caching: 1-hour public cache with 2-hour stale-while-revalidate
 *
 * @example
 * ```bash
 * curl -H "Cookie: sb-access-token=..." \
 *      https://meelni.com/api/insights
 * ```
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aggregateUserInsights } from "@/lib/evaluation/insights-aggregator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/insights
 *
 * Fetches comprehensive user insights including stats, trends, and breakdowns.
 * Returns empty state for users with zero sessions.
 */
export async function GET() {
  const startTime = Date.now();

  try {
    // 1. Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Calculate insights (aggregates from database)
    const insights = await aggregateUserInsights(user.id);

    const duration = Date.now() - startTime;

    // 3. Log performance (for monitoring)
    if (duration > 500) {
      console.warn(`[insights] Slow query: ${duration}ms for user ${user.id}`);
    }

    // 4. Return insights with cache headers
    return NextResponse.json(
      {
        overall: insights.overallStats,
        byType: insights.byInterviewType,
        byDifficulty: insights.byDifficulty,
        trends: insights.trends,
        competencies: insights.competencyBreakdown,
        lastUpdated: new Date().toISOString(),
      },
      {
        headers: {
          // Cache for 1 hour, allow stale responses for 2 hours while revalidating
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
          "X-Response-Time": `${duration}ms`,
        },
      }
    );
  } catch (error) {
    // 5. Handle errors
    const errorId = Math.random().toString(36).substring(2, 15);
    console.error(`[insights] Error ${errorId}:`, error);

    return NextResponse.json(
      {
        error: "Failed to fetch insights",
        ref: errorId,
      },
      { status: 500 }
    );
  }
}
