/**
 * Real-Time Nudges Analysis API
 *
 * Analyzes transcript turns in real-time during interviews and returns coaching nudges
 * based on framework coverage and timing. This API enables mid-answer coaching to help
 * users improve their responses while practicing.
 *
 * @route POST /api/nudges/analyze
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 * @rateLimit 1 request per second per session
 *
 * @request {Object} body - Request payload
 * @request.sessionId {string} Required - UUID of the interview session
 * @request.interviewType {string} Required - Type of interview (product_sense | analytical | leadership | strategy)
 * @request.currentTurn {Object} Required - Current conversation turn data
 * @request.currentTurn.speaker {string} Required - Speaker identifier (user | interviewer)
 * @request.currentTurn.text {string} Required - Transcribed text of current turn
 * @request.currentTurn.timestamp {number} Required - Timestamp in milliseconds
 * @request.timeElapsed {number} Required - Total seconds elapsed since interview started
 *
 * @response {Object} response - Nudge analysis result
 * @response.shouldNudge {boolean} - Whether a nudge should be triggered
 * @response.nudgeType {string} Optional - Type of nudge (metric_missing | move_on | clarify_first | framework_element)
 * @response.message {string} Optional - Coaching message to display/speak
 * @response.frameworkCoverage {Array<Object>} - Framework elements coverage status
 * @response.frameworkCoverage[].element {string} - Framework element name
 * @response.frameworkCoverage[].covered {boolean} - Whether element has been covered
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {400} Bad Request - Missing required fields or invalid interviewType
 * @throws {403} Forbidden - User does not own this session
 * @throws {429} Too Many Requests - Rate limit exceeded (>1 req/sec per session)
 * @throws {500} Internal Server Error - Analysis error
 *
 * @example
 * // Request
 * POST /api/nudges/analyze
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *   Content-Type: application/json
 * Body:
 * {
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *   "interviewType": "product_sense",
 *   "currentTurn": {
 *     "speaker": "user",
 *     "text": "I think users would like this feature because it's convenient...",
 *     "timestamp": 1699999999000
 *   },
 *   "timeElapsed": 95
 * }
 *
 * // Response (200 OK - Nudge Triggered)
 * {
 *   "shouldNudge": true,
 *   "nudgeType": "metric_missing",
 *   "message": "You've been speaking for 90 seconds without mentioning any metrics. Can you quantify the impact?",
 *   "frameworkCoverage": [
 *     { "element": "Clarify", "covered": true },
 *     { "element": "Context", "covered": true },
 *     { "element": "Users", "covered": true },
 *     { "element": "Problem", "covered": true },
 *     { "element": "Solution", "covered": false }
 *   ]
 * }
 *
 * // Response (200 OK - No Nudge)
 * {
 *   "shouldNudge": false,
 *   "frameworkCoverage": [
 *     { "element": "Clarify", "covered": true },
 *     { "element": "Context", "covered": true },
 *     { "element": "Users", "covered": false },
 *     { "element": "Problem", "covered": false },
 *     { "element": "Solution", "covered": false }
 *   ]
 * }
 *
 * // Error Response (429 Too Many Requests)
 * {
 *   "error": "Rate limit exceeded. Maximum 1 request per second per session.",
 *   "retryAfter": 0.8
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSessionOwnedByUser } from "@/lib/db/sessions";
import { createFrameworkTracker } from "@/lib/nudges/framework-tracker";
import type { TranscriptTurn } from "@/lib/types/nudges";

// Rate limiting: Track last request time per session
const sessionRateLimits = new Map<string, number>();

// Rate limit configuration
const RATE_LIMIT_MS = 1000; // 1 request per second

/**
 * Check if request exceeds rate limit
 */
function isRateLimited(sessionId: string): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const lastRequest = sessionRateLimits.get(sessionId);

  if (lastRequest) {
    const timeSinceLastRequest = now - lastRequest;
    if (timeSinceLastRequest < RATE_LIMIT_MS) {
      return {
        limited: true,
        retryAfter: (RATE_LIMIT_MS - timeSinceLastRequest) / 1000,
      };
    }
  }

  // Update last request time
  sessionRateLimits.set(sessionId, now);

  // Cleanup old entries (older than 5 minutes)
  const CLEANUP_THRESHOLD = 5 * 60 * 1000;
  sessionRateLimits.forEach((timestamp, sid) => {
    if (now - timestamp > CLEANUP_THRESHOLD) {
      sessionRateLimits.delete(sid);
    }
  });

  return { limited: false, retryAfter: 0 };
}

/**
 * Validate interview type
 */
function isValidInterviewType(type: string): type is "product_sense" | "analytical" | "leadership" | "strategy" {
  return ["product_sense", "analytical", "leadership", "strategy"].includes(type);
}

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { sessionId, interviewType, currentTurn, timeElapsed } = body;

    // Validate required fields
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    if (!interviewType || !isValidInterviewType(interviewType)) {
      return NextResponse.json(
        { error: "Invalid interviewType. Must be one of: product_sense, analytical, leadership, strategy" },
        { status: 400 }
      );
    }

    if (!currentTurn || !currentTurn.speaker || !currentTurn.text || currentTurn.timestamp === undefined) {
      return NextResponse.json(
        { error: "currentTurn must include speaker, text, and timestamp" },
        { status: 400 }
      );
    }

    if (typeof timeElapsed !== "number") {
      return NextResponse.json(
        { error: "timeElapsed must be a number (seconds)" },
        { status: 400 }
      );
    }

    // Verify user owns the session
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 403 }
      );
    }

    // Check rate limit
    const rateLimitCheck = isRateLimited(sessionId);
    if (rateLimitCheck.limited) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Maximum 1 request per second per session.",
          retryAfter: rateLimitCheck.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimitCheck.retryAfter.toString(),
          },
        }
      );
    }

    // Initialize framework tracker for this session
    // Note: In production, this should be cached/persisted per session
    // For MVP, we create a new instance per request
    const tracker = createFrameworkTracker(interviewType);

    // Analyze current turn and update framework coverage
    const coverage = tracker.analyzeTurn({
      id: `${sessionId}-${Date.now()}`,
      speaker: currentTurn.speaker,
      text: currentTurn.text,
      timestamp: currentTurn.timestamp,
    });

    // Check if nudge should be generated
    const nudgeDecision = tracker.shouldNudge(timeElapsed);

    // Return analysis result
    return NextResponse.json({
      shouldNudge: nudgeDecision.shouldNudge,
      nudgeType: nudgeDecision.nudgeType,
      message: nudgeDecision.message,
      frameworkCoverage: coverage.elements.map((el) => ({
        element: el.name,
        covered: el.detected,
      })),
    });
  } catch (error) {
    console.error("Error analyzing nudges:", error);

    // Graceful degradation: Return no-nudge response
    // This ensures interview flow isn't interrupted by nudge analysis errors
    return NextResponse.json(
      {
        shouldNudge: false,
        error: "Analysis temporarily unavailable",
        frameworkCoverage: [],
      },
      { status: 200 } // 200 to avoid breaking interview flow
    );
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "nudges-analysis",
    version: "1.0.0",
  });
}
