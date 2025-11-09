/**
 * End Interview Session API (P1-004)
 *
 * Marks an interview session as completed, calculates stats, validates completeness,
 * and triggers feedback generation via Inngest.
 *
 * Flow:
 * 1. Verify user authentication
 * 2. Validate session ownership
 * 3. Check if already ended (idempotency)
 * 4. Calculate session stats (turns, words, duration)
 * 5. Update session with stats and status
 * 6. Validate session completeness
 * 7. If valid: Create pending feedback + trigger Inngest job
 * 8. If invalid: Create skipped feedback with reason
 *
 * @route POST /api/interview/end
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @request {Object} body - Request payload
 * @request.sessionId {string} Required - UUID of the session to end
 *
 * @response {Object} response - Success confirmation with feedback status
 * @response.status {"queued" | "skipped"} - Feedback generation status
 * @response.estimatedTime {number} Optional - Estimated processing time in seconds
 * @response.feedbackId {string} Optional - Feedback record ID
 * @response.reason {string} Optional - Reason for skipping (if skipped)
 * @response.stats {Object} - Session statistics
 * @response.tier {string} Optional - Session tier (full/partial/insufficient/abandoned)
 *
 * @throws {400} Bad Request - Missing sessionId or already ended
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {403} Forbidden - User does not own this session
 * @throws {429} Too Many Requests - Rate limit exceeded
 * @throws {500} Internal Server Error - Database or Inngest error
 *
 * @example
 * // Request
 * POST /api/interview/end
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *   Content-Type: application/json
 * Body:
 * {
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000"
 * }
 *
 * // Response (200 OK - Session Valid)
 * {
 *   "status": "queued",
 *   "estimatedTime": 45,
 *   "feedbackId": "feedback-uuid",
 *   "tier": "full",
 *   "stats": {
 *     "totalTurns": 28,
 *     "userTurns": 14,
 *     "totalWords": 1200,
 *     "durationSeconds": 1350,
 *     "substantiveResponses": 12
 *   }
 * }
 *
 * // Response (200 OK - Session Invalid)
 * {
 *   "status": "skipped",
 *   "reason": "Session too short: 2 turns < 5 minimum",
 *   "tier": "insufficient",
 *   "stats": {
 *     "totalTurns": 2,
 *     "userTurns": 1,
 *     "totalWords": 25,
 *     "durationSeconds": 120,
 *     "substantiveResponses": 0
 *   }
 * }
 *
 * // Error Response (400 - Already Ended)
 * {
 *   "error": "Session already ended",
 *   "endedAt": "2025-11-08T10:30:00Z"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { interviewSession, feedback } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import {
  validateSessionCompleteness,
  calculateSessionStats,
  SessionTier,
} from "@/lib/evaluation/session-validator";
import { isSessionOwnedByUser, getSessionById } from "@/lib/db/sessions";

// Rate limiting: Track requests per user (in-memory, simple approach)
// Production: Use Redis or Upstash Rate Limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10; // 10 requests
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Simple rate limiting check
 * Returns true if rate limit exceeded
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    // Initialize or reset
    rateLimitMap.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    return true; // Rate limit exceeded
  }

  userLimit.count++;
  return false;
}

/**
 * Main endpoint handler
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify authentication
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

    // 2. Check rate limit
    if (checkRateLimit(user.id)) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: "Too many requests. Please try again in a minute.",
        },
        { status: 429 }
      );
    }

    // 3. Parse request body
    const body = await req.json();
    const { sessionId } = body;

    // 4. Validate required fields
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // 5. Verify user owns the session
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 403 }
      );
    }

    // 6. Check if session is already ended (idempotency)
    const session = await getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.endedAt) {
      // Session already ended - check if feedback exists
      const existingFeedback = await db.query.feedback.findFirst({
        where: eq(feedback.sessionId, sessionId),
      });

      if (existingFeedback) {
        // Return existing feedback status
        return NextResponse.json({
          status: existingFeedback.status === "completed" ? "queued" : existingFeedback.status,
          message: "Session was already ended",
          endedAt: session.endedAt,
          feedbackId: existingFeedback.id,
          ...(existingFeedback.status === "skipped" && {
            reason: existingFeedback.statusReason,
          }),
        });
      }

      // Session ended but no feedback - this shouldn't happen, but handle gracefully
      return NextResponse.json(
        {
          error: "Session already ended",
          endedAt: session.endedAt,
        },
        { status: 400 }
      );
    }

    // 7. Calculate session statistics
    const stats = await calculateSessionStats(sessionId);

    // 8. Update session with stats and endedAt
    await db
      .update(interviewSession)
      .set({
        endedAt: new Date(),
        totalTurns: stats.totalTurns,
        totalWords: stats.totalWords,
        durationSeconds: stats.durationSeconds,
        // Note: status will be updated by Inngest worker based on validation
      })
      .where(eq(interviewSession.id, sessionId));

    // 9. Validate session completeness
    const validation = await validateSessionCompleteness(sessionId);

    // 10. Handle invalid session (skip feedback)
    if (!validation.isValid) {
      // Update session status
      await db
        .update(interviewSession)
        .set({
          status:
            validation.tier === SessionTier.ABANDONED
              ? "abandoned"
              : "too_short",
        })
        .where(eq(interviewSession.id, sessionId));

      // Create skipped feedback record
      const [feedbackRecord] = await db
        .insert(feedback)
        .values({
          sessionId: sessionId,
          status: "skipped",
          statusReason: validation.reasons.join(", "),
          rubricVersion: "1.0.0",
        })
        .returning();

      return NextResponse.json(
        {
          status: "skipped",
          reason: validation.reasons[0],
          tier: validation.tier,
          stats: validation.stats,
          recommendations: validation.recommendations,
          feedbackId: feedbackRecord.id,
        },
        { status: 200 } // 200 OK, not 422 - operation succeeded, just no feedback generated
      );
    }

    // 11. Create pending feedback record
    const [feedbackRecord] = await db
      .insert(feedback)
      .values({
        sessionId: sessionId,
        status: "pending",
        rubricVersion: "1.0.0",
      })
      .returning();

    // 12. Trigger Inngest job for feedback generation
    try {
      await inngest.send({
        name: "feedback/generate.requested",
        data: {
          sessionId: sessionId,
          userId: user.id,
          tier: validation.tier,
        },
      });
    } catch (inngestError) {
      console.error("Failed to trigger Inngest job:", inngestError);

      // Update feedback status to failed
      await db
        .update(feedback)
        .set({
          status: "failed",
          statusReason: "Failed to queue feedback generation job",
        })
        .where(eq(feedback.id, feedbackRecord.id));

      return NextResponse.json(
        {
          error: "Failed to queue feedback generation",
          message:
            "Session ended successfully but feedback generation could not be started",
          feedbackId: feedbackRecord.id,
        },
        { status: 500 }
      );
    }

    // 13. Return success response
    return NextResponse.json({
      status: "queued",
      estimatedTime: validation.tier === SessionTier.FULL ? 60 : 45, // seconds
      feedbackId: feedbackRecord.id,
      tier: validation.tier,
      stats: validation.stats,
      recommendations: validation.recommendations,
    });
  } catch (error) {
    console.error("Error ending session:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to end session",
      },
      { status: 500 }
    );
  }
}
