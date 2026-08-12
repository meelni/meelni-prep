/**
 * List User Sessions API
 *
 * Retrieves a list of the authenticated user's interview sessions with stats,
 * optional filtering by round type, and pagination support.
 *
 * @route GET /api/sessions
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @query {string} roundType Optional - Filter by interview type (behavioral | product_sense | execution | strategy)
 * @query {number} limit Optional - Maximum number of results per page (1-100, default: 20)
 * @query {number} offset Optional - Number of results to skip (default: 0)
 *
 * @response {Object} response - Sessions data with stats and pagination
 * @response.sessions {Array<Object>} - Array of session objects
 * @response.pagination {Object} - Pagination metadata
 * @response.pagination.total {number} - Total number of sessions
 * @response.pagination.limit {number} - Limit parameter
 * @response.pagination.offset {number} - Offset parameter
 * @response.pagination.hasMore {boolean} - Whether there are more sessions
 * @response.stats {Object} - User session statistics
 * @response.stats.totalSessions {number} - Total count of sessions
 * @response.stats.totalMinutes {number} - Sum of completed session durations
 * @response.stats.avgScore {number} - Average score (0 until feedback engine is built)
 * @response.stats.completionRate {number} - Percentage of completed sessions
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {400} Bad Request - Invalid roundType, limit, or offset
 * @throws {500} Internal Server Error - Database query failed
 *
 * @example
 * // Request (All Sessions with Stats)
 * GET /api/sessions?limit=10&offset=0
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *
 * // Response (200 OK)
 * {
 *   "sessions": [...],
 *   "pagination": {
 *     "total": 15,
 *     "limit": 10,
 *     "offset": 0,
 *     "hasMore": true
 *   },
 *   "stats": {
 *     "totalSessions": 15,
 *     "totalMinutes": 450,
 *     "avgScore": 0,
 *     "completionRate": 80
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getUserSessionsPaginated,
  getUserSessionsByRoundTypePaginated,
  getUserSessionStats,
} from "@/lib/db/sessions";
import { parseNonNegativeIntegerParam } from "@/lib/utils/pagination";
import { DASHBOARD_FEEDBACK_PRESENTATION_KINDS } from "@/lib/dashboard/feedback-presentation";

export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const roundType = searchParams.get("roundType");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    const limit = parseNonNegativeIntegerParam(limitParam, 20);
    const offset = parseNonNegativeIntegerParam(offsetParam, 0);

    if (limit === null || offset === null) {
      return NextResponse.json(
        { error: "Limit and offset must be whole numbers" },
        { status: 400 }
      );
    }

    // Validate limit
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    // Validate offset
    if (offset < 0) {
      return NextResponse.json(
        { error: "Offset must be non-negative" },
        { status: 400 }
      );
    }

    // Get sessions with pagination
    let result;
    if (roundType) {
      // Validate roundType
      const validRoundTypes = [
        "behavioral",
        "product_sense",
        "execution",
        "strategy",
      ];
      if (!validRoundTypes.includes(roundType)) {
        return NextResponse.json(
          { error: "Invalid roundType" },
          { status: 400 }
        );
      }

      result = await getUserSessionsByRoundTypePaginated(
        user.id,
        roundType as "behavioral" | "product_sense" | "execution" | "strategy",
        limit,
        offset
      );
    } else {
      result = await getUserSessionsPaginated(user.id, limit, offset);
    }

    const { sessions, total } = result;

    // Get user stats from all sessions (not just paginated results)
    const stats = await getUserSessionStats(user.id);

    // Pagination metadata
    const pagination = {
      total,
      limit,
      offset,
      hasMore: offset + sessions.length < total,
    };

    return NextResponse.json({
      sessions: sessions.map(presentSessionListEntry),
      pagination,
      stats,
    });
  } catch {
    console.error("session_list_read_failed");
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

function presentSessionListEntry<
  T extends {
    feedback?:
      | ({
          status?: unknown;
          presentationKind?: unknown;
          overallScore?: unknown;
          structureScore?: unknown;
          clarityScore?: unknown;
          insightScore?: unknown;
          communicationScore?: unknown;
          leadershipScore?: unknown;
        } & Record<string, unknown>)
      | null;
  },
>(session: T) {
  const { feedback: feedbackRecord, ...sessionRecord } = session;
  if (!feedbackRecord) return { ...sessionRecord, feedback: null };
  const presentationKind = DASHBOARD_FEEDBACK_PRESENTATION_KINDS.find(
    (kind) => kind === feedbackRecord.presentationKind
  );

  return {
    ...sessionRecord,
    feedback: {
      status: feedbackRecord.status,
      presentationKind: presentationKind ?? "unavailable",
      overallScore: feedbackRecord.overallScore,
      structureScore: feedbackRecord.structureScore,
      clarityScore: feedbackRecord.clarityScore,
      insightScore: feedbackRecord.insightScore,
      communicationScore: feedbackRecord.communicationScore,
      leadershipScore: feedbackRecord.leadershipScore,
    },
  };
}
