/**
 * List User Sessions API
 *
 * Retrieves a list of the authenticated user's interview sessions, with optional
 * filtering by round type. Results are ordered by most recent first.
 *
 * @route GET /api/sessions
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @query {string} roundType Optional - Filter by interview type (behavioral | product_sense | execution | strategy)
 * @query {number} limit Optional - Maximum number of results (1-100, default: 50)
 *
 * @response {Object} response - List of sessions
 * @response.sessions {Array<Object>} - Array of session objects
 * @response.count {number} - Number of sessions returned
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {400} Bad Request - Invalid roundType or limit out of range
 * @throws {500} Internal Server Error - Database query failed
 *
 * @example
 * // Request (All Sessions)
 * GET /api/sessions?limit=10
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *
 * // Response (200 OK)
 * {
 *   "sessions": [
 *     {
 *       "id": "session-1",
 *       "userId": "user-123",
 *       "roundType": "product_sense",
 *       "mode": "voice_video",
 *       "startedAt": "2025-11-05T10:30:00Z",
 *       "endedAt": "2025-11-05T11:15:00Z",
 *       ...
 *     },
 *     {
 *       "id": "session-2",
 *       "roundType": "behavioral",
 *       "startedAt": "2025-11-04T14:20:00Z",
 *       "endedAt": null,
 *       ...
 *     }
 *   ],
 *   "count": 2
 * }
 *
 * // Request (Filtered by Round Type)
 * GET /api/sessions?roundType=product_sense&limit=20
 *
 * // Error Response (400 Bad Request)
 * {
 *   "error": "Limit must be between 1 and 100"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSessions, getUserSessionsByRoundType } from "@/lib/db/sessions";

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
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    // Validate limit
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    // Get sessions
    let sessions;
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

      sessions = await getUserSessionsByRoundType(
        user.id,
        roundType as "behavioral" | "product_sense" | "execution" | "strategy",
        limit
      );
    } else {
      sessions = await getUserSessions(user.id, limit);
    }

    return NextResponse.json({
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}
