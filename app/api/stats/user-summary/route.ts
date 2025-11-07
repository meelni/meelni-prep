/**
 * User Summary Statistics API
 *
 * Provides comprehensive user statistics including session summary, weekly trends,
 * milestone achievements, and recent activity for the dashboard.
 *
 * @route GET /api/stats/user-summary
 * @access Protected (requires Supabase authentication)
 *
 * @response {Object} response - User statistics summary
 * @response.summary {Object} - Session summary statistics
 * @response.summary.totalSessions {number} - Total number of completed sessions
 * @response.summary.avgScore {number} - Average overall score across all sessions
 * @response.summary.totalMinutes {number} - Total practice time in minutes
 * @response.summary.completionRate {number} - Percentage of sessions completed (0-100)
 * @response.trends {Object} - Week-over-week trend comparisons
 * @response.trends.sessionsChange {number|null} - Percentage change in session count
 * @response.trends.scoreChange {number|null} - Percentage change in average score
 * @response.trends.minutesChange {number|null} - Percentage change in practice time
 * @response.milestones {Object} - Achievement milestone flags
 * @response.milestones.fiveSessionStreak {boolean} - Completed 5 sessions in 5 consecutive days
 * @response.milestones.perfectScore {boolean} - Achieved score >= 90 in any session
 * @response.milestones.improving {boolean} - Last 3 sessions show increasing scores
 * @response.milestones.consistent {boolean} - Completed 10+ total sessions
 * @response.recentActivity {Array} - Recent session activity
 * @response.recentActivity[].sessionId {string} - Session UUID
 * @response.recentActivity[].type {string} - Interview round type
 * @response.recentActivity[].score {number|null} - Session overall score
 * @response.recentActivity[].timestamp {string} - ISO 8601 timestamp
 *
 * @throws {401} Unauthorized - User not authenticated
 * @throws {500} Internal Server Error - Database query failed
 *
 * @example
 * // Request
 * GET /api/stats/user-summary
 * Headers:
 *   Cookie: sb-access-token=...
 *
 * // Response (200 OK)
 * {
 *   "summary": {
 *     "totalSessions": 12,
 *     "avgScore": 78.5,
 *     "totalMinutes": 240,
 *     "completionRate": 92
 *   },
 *   "trends": {
 *     "sessionsChange": 25,
 *     "scoreChange": 12,
 *     "minutesChange": -5
 *   },
 *   "milestones": {
 *     "fiveSessionStreak": true,
 *     "perfectScore": false,
 *     "improving": true,
 *     "consistent": true
 *   },
 *   "recentActivity": [
 *     {
 *       "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *       "type": "product_sense",
 *       "score": 85.2,
 *       "timestamp": "2025-11-06T14:30:00.000Z"
 *     }
 *   ]
 * }
 *
 * // Error Response (401 Unauthorized)
 * {
 *   "error": "Unauthorized: User not authenticated"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getUserSessionSummary,
  getUserWeeklyTrend,
  getUserMilestones,
  getUserRecentActivity,
} from "@/lib/db/queries/user-stats";

export async function GET(req: NextRequest) {
  try {
    // Authenticate user with Supabase
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized: User not authenticated" },
        { status: 401 }
      );
    }

    // Fetch all user statistics in parallel
    const [summary, trends, milestones, recentActivity] = await Promise.all([
      getUserSessionSummary(user.id),
      getUserWeeklyTrend(user.id),
      getUserMilestones(user.id),
      getUserRecentActivity(user.id, 10),
    ]);

    // Format response with proper types
    return NextResponse.json(
      {
        summary: {
          totalSessions: summary.totalSessions,
          avgScore: summary.avgScore,
          totalMinutes: summary.totalMinutes,
          completionRate: summary.completionRate,
        },
        trends: {
          sessionsChange: trends.sessionsChange,
          scoreChange: trends.scoreChange,
          minutesChange: trends.minutesChange,
        },
        milestones: {
          fiveSessionStreak: milestones.fiveSessionStreak,
          perfectScore: milestones.perfectScore,
          improving: milestones.improving,
          consistent: milestones.consistent,
        },
        recentActivity: recentActivity.map((activity) => ({
          sessionId: activity.sessionId,
          type: activity.type,
          score: activity.score,
          timestamp: activity.timestamp.toISOString(),
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching user summary statistics:", error);
    return NextResponse.json(
      { error: "Internal server error: Failed to fetch user statistics" },
      { status: 500 }
    );
  }
}
