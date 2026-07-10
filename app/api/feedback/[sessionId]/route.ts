/**
 * Get Session Feedback API (with Polling Support)
 *
 * Retrieves the AI-generated feedback for an interview session, supporting
 * real-time status polling. Returns feedback status (pending, processing,
 * completed, failed, skipped) with estimated time remaining for incomplete
 * feedback. Includes cache headers based on feedback status.
 *
 * @route GET /api/feedback/:sessionId
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @param {string} sessionId - UUID of the session (URL parameter)
 *
 * @response {Object} response - Feedback status and data
 * @response.status {string} - Feedback status (pending|processing|completed|failed|skipped)
 * @response.estimatedTimeRemaining {number} - Seconds remaining (if pending/processing)
 * @response.skipReason {string} - Reason for skipping (if skipped)
 * @response.error {string} - Error message (if failed)
 * @response.feedback {Object} - Complete feedback object (if completed)
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {403} Forbidden - User does not own this session
 * @throws {404} Not Found - Session not found or feedback not initialized
 * @throws {500} Internal Server Error - Database query failed
 *
 * @example
 * // Request
 * GET /api/feedback/550e8400-e29b-41d4-a716-446655440000
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *
 * // Response (200 OK - Pending)
 * {
 *   "status": "pending",
 *   "estimatedTimeRemaining": 42
 * }
 * Cache-Control: no-cache
 *
 * // Response (200 OK - Processing)
 * {
 *   "status": "processing",
 *   "estimatedTimeRemaining": 25
 * }
 * Cache-Control: no-cache
 *
 * // Response (200 OK - Completed)
 * {
 *   "status": "completed",
 *   "feedback": {
 *     "id": "feedback-abc123",
 *     "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *     "structureScore": 8,
 *     "clarityScore": 7,
 *     "insightScore": 9,
 *     "communicationScore": 8,
 *     "leadershipScore": 7,
 *     "overallScore": 7.8,
 *     "strengths": ["..."],
 *     "improvements": ["..."],
 *     "drills": ["..."],
 *     "summary": "...",
 *     "rubricVersion": "1.0.0",
 *     "createdAt": "2025-11-05T11:20:00Z"
 *   }
 * }
 * Cache-Control: public, max-age=3600
 *
 * // Response (200 OK - Skipped)
 * {
 *   "status": "skipped",
 *   "skipReason": "Session too short: 2 minutes < 5 minutes minimum"
 * }
 * Cache-Control: public, max-age=300
 *
 * // Response (200 OK - Failed)
 * {
 *   "status": "failed",
 *   "error": "GPT-4 API timeout"
 * }
 * Cache-Control: public, max-age=300
 *
 * // Error Response (404 Not Found)
 * {
 *   "error": "Session not found or access denied"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionById, isSessionOwnedByUser } from "@/lib/db/sessions";
import { getFeedbackBySessionId } from "@/lib/db/feedback";
import { isFeedbackDispatchRetryable } from "@/lib/db/feedback-dispatch";
import { validateSessionCompleteness } from "@/lib/evaluation/session-validator";
import { isInterviewTerminalState } from "@meelni/core";
import { endInterviewSessionWorkflow } from "@/lib/workflows/end-interview-session";
import {
  readOpaqueCorrelationId,
  readOperationalRequestId,
  reportOperationalFailure,
  type SessionCorrelationId,
} from "@/lib/operations/operational-events";

// Estimated total processing time (seconds)
const ESTIMATED_PROCESSING_TIME = 45;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  let correlationId: SessionCorrelationId | null = null;
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

    const { sessionId } = await params;
    correlationId = readOpaqueCorrelationId(sessionId);

    // Verify user owns the session
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 404 } // Use 404 to avoid leaking session existence
      );
    }

    // Get feedback
    const feedbackRecord = await getFeedbackBySessionId(sessionId);

    if (!feedbackRecord) {
      const session = await getSessionById(sessionId);
      if (session && isInterviewTerminalState(session.lifecycleState)) {
        return NextResponse.json(
          {
            status: "missing",
            retryable: true,
            message: "Feedback has not been queued yet.",
          },
          { headers: { "Cache-Control": "private, no-store" } }
        );
      }
      return NextResponse.json(
        {
          status: "session_not_ended",
          retryable: false,
          message: "This interview has not ended yet.",
        },
        {
          status: 409,
          headers: { "Cache-Control": "private, no-store" },
        }
      );
    }

    // Build response based on status
    const status = feedbackRecord.status || "pending";

    // Case 1: Pending - waiting to start processing
    if (status === "pending") {
      return NextResponse.json(
        {
          status: "pending",
          estimatedTimeRemaining: ESTIMATED_PROCESSING_TIME,
          dispatch: {
            status: feedbackRecord.dispatchStatus,
            retryable: isFeedbackDispatchRetryable({
              status: feedbackRecord.dispatchStatus,
              claimedAt: feedbackRecord.dispatchClaimedAt,
            }),
          },
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        }
      );
    }

    // Case 2: Processing - calculate time remaining
    if (status === "processing") {
      let estimatedTimeRemaining = ESTIMATED_PROCESSING_TIME;

      if (feedbackRecord.processingStartedAt) {
        const elapsed = Math.floor(
          (Date.now() -
            new Date(feedbackRecord.processingStartedAt).getTime()) /
            1000
        );
        estimatedTimeRemaining = Math.max(
          0,
          ESTIMATED_PROCESSING_TIME - elapsed
        );
      }

      return NextResponse.json(
        {
          status: "processing",
          estimatedTimeRemaining,
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        }
      );
    }

    // Case 3: Completed - return full feedback with cache
    if (status === "completed") {
      return NextResponse.json(
        {
          status: "completed",
          feedback: {
            id: feedbackRecord.id,
            sessionId: feedbackRecord.sessionId,
            structureScore: feedbackRecord.structureScore,
            clarityScore: feedbackRecord.clarityScore,
            insightScore: feedbackRecord.insightScore,
            communicationScore: feedbackRecord.communicationScore,
            leadershipScore: feedbackRecord.leadershipScore,
            overallScore: feedbackRecord.overallScore
              ? parseFloat(feedbackRecord.overallScore)
              : null,
            strengths: feedbackRecord.strengths as string[],
            improvements: feedbackRecord.improvements as string[],
            drills: feedbackRecord.drills as string[],
            summary: feedbackRecord.summary,
            rubricVersion: feedbackRecord.rubricVersion,
            createdAt: feedbackRecord.createdAt,
          },
        },
        {
          headers: {
            "Cache-Control": "private, max-age=3600",
          },
        }
      );
    }

    // Case 4: Skipped - return skip reason with validation data
    if (status === "skipped") {
      // Fetch validation data for edge case components
      const validation = await validateSessionCompleteness(sessionId);

      return NextResponse.json(
        {
          status: "skipped",
          skipReason:
            feedbackRecord.statusReason || "Feedback generation was skipped",
          validation: {
            tier: validation.tier,
            stats: validation.stats,
            reasons: validation.reasons,
            recommendations: validation.recommendations,
          },
        },
        {
          headers: {
            "Cache-Control": "private, max-age=300",
          },
        }
      );
    }

    // Case 5: Failed - return error with short cache
    if (status === "failed") {
      const retryable =
        feedbackRecord.dispatchStatus !== "not_required" &&
        (feedbackRecord.dispatchStatus === "sent" ||
          isFeedbackDispatchRetryable({
            status: feedbackRecord.dispatchStatus,
            claimedAt: feedbackRecord.dispatchClaimedAt,
          }));
      return NextResponse.json(
        {
          status: "failed",
          error: feedbackRecord.statusReason || "Feedback generation failed",
          retryable,
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        }
      );
    }

    // Unknown status (shouldn't happen)
    return NextResponse.json(
      { error: "Invalid feedback status" },
      { status: 500 }
    );
  } catch {
    reportOperationalFailure({
      operation: "feedback_queue",
      errorCode: "feedback_read_failed",
      retryable: true,
      requestId: readOperationalRequestId(req),
      correlationId,
    });
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  let correlationId: SessionCorrelationId | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
    correlationId = readOpaqueCorrelationId(sessionId);
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 404 }
      );
    }

    const session = await getSessionById(sessionId);
    if (
      !session ||
      (session.lifecycleState !== "ending" &&
        !isInterviewTerminalState(session.lifecycleState))
    ) {
      return NextResponse.json(
        {
          error: "session_not_ended",
          message: "End the interview before queueing feedback.",
        },
        { status: 409 }
      );
    }

    const result = await endInterviewSessionWorkflow({
      sessionId,
      userId: user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const dispatchStatus =
      result.dispatch?.dispatch?.status ??
      result.completion.feedback.dispatchStatus;
    const feedbackStatus =
      result.completion.feedback.status === "failed" && result.dispatch?.ok
        ? "pending"
        : result.completion.feedback.status;
    const retryable =
      (feedbackStatus === "pending" || feedbackStatus === "failed") &&
      isFeedbackDispatchRetryable({
        status: dispatchStatus,
        claimedAt:
          result.dispatch?.dispatch?.claimedAt ??
          result.completion.feedback.dispatchClaimedAt,
      });
    return NextResponse.json(
      {
        status: feedbackStatus,
        feedbackId: result.completion.feedback.id,
        dispatch: { status: dispatchStatus, retryable },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    reportOperationalFailure({
      operation: "feedback_queue",
      errorCode: "feedback_retry_failed",
      severity: "critical",
      retryable: true,
      requestId: readOperationalRequestId(req),
      correlationId,
    });
    return NextResponse.json(
      {
        error: "feedback_retry_failed",
        message: "Feedback could not be queued yet. Please try again.",
      },
      { status: 500 }
    );
  }
}
