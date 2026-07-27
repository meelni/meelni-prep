/**
 * GET /api/insights
 *
 * Returns pre-aggregated user insights for the authenticated user.
 *
 * Response includes:
 * - Overall stats (sessions and scores)
 * - Breakdown by interview type
 * - Breakdown by difficulty
 * - Performance trends
 * - Competency averages
 *
 * Caching: private and non-cacheable because the response is user-specific
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
const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // 2. Calculate insights (aggregates from database)
    const insights = await aggregateUserInsights(user.id);

    const duration = Date.now() - startTime;

    // 3. Log performance (for monitoring)
    if (duration > 500) {
      console.warn(`[insights] Slow authenticated query: ${duration}ms`);
    }

    // 4. Return user-specific insights without shared or browser persistence.
    return NextResponse.json(
      {
        overall: insights.overallStats,
        byType: insights.byInterviewType,
        byDifficulty: insights.byDifficulty,
        trends: insights.trends,
        competencies: insights.competencyBreakdown,
        competencySampleSizes: insights.competencySampleSizes,
        lastUpdated: new Date().toISOString(),
      },
      {
        headers: {
          ...PRIVATE_NO_STORE_HEADERS,
          "X-Response-Time": `${duration}ms`,
        },
      }
    );
  } catch {
    // 5. Handle errors
    const errorId = Math.random().toString(36).substring(2, 15);
    console.error("[insights] Aggregation failed", {
      errorId,
      category: "insights_aggregation_failed",
    });

    return NextResponse.json(
      {
        error: "Failed to fetch insights",
        ref: errorId,
      },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
