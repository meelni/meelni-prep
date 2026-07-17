/**
 * Authenticated, owner-scoped feedback polling and recovery API.
 * Completed rows cross the strict @meelni/core read boundary before response;
 * lifecycle clients use only the top-level retryable field as recovery truth.
 * See docs/api/feedback-polling-examples.md for the discriminated contract.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionById, isSessionOwnedByUser } from "@/lib/db/sessions";
import {
  getFeedbackBySessionId,
  hasValidFeedbackLifecycleFields,
} from "@/lib/db/feedback";
import { getFeedbackEvidenceTurns } from "@/lib/db/transcripts";
import { isFeedbackDispatchRetryable } from "@/lib/db/feedback-dispatch";
import {
  isFeedbackGenerationLeaseExpired,
  isFeedbackGenerationRetryable,
} from "@/lib/db/feedback-generation-state";
import {
  decodeFeedbackLifecycleResponse,
  isInterviewTerminalState,
  presentCompletedFeedback,
} from "@meelni/core";
import {
  hasInterviewDeadlineRoomCleanupClaim,
  isInterviewDeadlineRoomCleanupAcknowledged,
} from "@/lib/db/session-deadlines";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import { recoverFeedbackGenerationWorkflow } from "@/lib/workflows/recover-feedback-generation";

// Estimated total processing time (seconds)
const ESTIMATED_PROCESSING_TIME = 45;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
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

    // Verify user owns the session
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 404 } // Use 404 to avoid leaking session existence
      );
    }

    const session = await getSessionById(sessionId);

    // Get feedback
    const feedbackRecord = await getFeedbackBySessionId(sessionId);

    if (
      session &&
      hasInterviewDeadlineRoomCleanupClaim(session) &&
      !isInterviewDeadlineRoomCleanupAcknowledged(session)
    ) {
      return NextResponse.json(
        {
          status: "settling",
          retryable: false,
          message:
            "The interview is saved and its room is still being closed safely.",
        },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    if (!feedbackRecord) {
      if (
        session &&
        (session.lifecycleState === "ending" ||
          isInterviewTerminalState(session.lifecycleState))
      ) {
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

    if (!hasValidFeedbackLifecycleFields(feedbackRecord)) {
      console.error("[feedback.integrity] invalid lifecycle fields", {
        environment:
          process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
        release: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
        sessionId,
      });
      return NextResponse.json(
        { error: "Invalid feedback state" },
        {
          status: 500,
          headers: { "Cache-Control": "private, no-store" },
        }
      );
    }

    // Build response based on status
    const status = feedbackRecord.status;

    // Case 1: Pending - waiting to start processing
    if (status === "pending") {
      const retryable =
        feedbackRecord.completionTier !== null &&
        isFeedbackDispatchRetryable({
          status: feedbackRecord.dispatchStatus,
          claimedAt: feedbackRecord.dispatchClaimedAt,
        });
      return NextResponse.json(
        {
          status: "pending",
          retryable,
          estimatedTimeRemaining: ESTIMATED_PROCESSING_TIME,
          dispatch: {
            status: feedbackRecord.dispatchStatus,
            retryable,
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
          retryable:
            feedbackRecord.dispatchStatus !== "not_required" &&
            feedbackRecord.dispatchEventId !== null &&
            isFeedbackGenerationLeaseExpired({
              status,
              processingStartedAt: feedbackRecord.processingStartedAt,
            }),
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
      const hasVersionedFeedback = [
        feedbackRecord.schemaVersion,
        feedbackRecord.promptVersion,
        feedbackRecord.modelVersion,
        feedbackRecord.evaluationState,
      ].some((value) => value !== null);
      const evidenceTurns = hasVersionedFeedback
        ? await getFeedbackEvidenceTurns(sessionId)
        : [];
      const feedbackView = presentCompletedFeedback(
        {
          id: feedbackRecord.id,
          sessionId: feedbackRecord.sessionId,
          structureScore: feedbackRecord.structureScore,
          clarityScore: feedbackRecord.clarityScore,
          insightScore: feedbackRecord.insightScore,
          communicationScore: feedbackRecord.communicationScore,
          leadershipScore: feedbackRecord.leadershipScore,
          overallScore: feedbackRecord.overallScore,
          strengths: feedbackRecord.strengths,
          improvements: feedbackRecord.improvements,
          drills: feedbackRecord.drills,
          summary: feedbackRecord.summary,
          rubricVersion: feedbackRecord.rubricVersion,
          schemaVersion: feedbackRecord.schemaVersion,
          promptVersion: feedbackRecord.promptVersion,
          modelVersion: feedbackRecord.modelVersion,
          evaluationState: feedbackRecord.evaluationState,
          createdAt: feedbackRecord.createdAt,
        },
        { evidenceTurns }
      );
      if (feedbackView.kind === "invalid") {
        console.error("[feedback.integrity] incompatible completed feedback", {
          environment:
            process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
          release: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
          sessionId,
        });
      }
      return NextResponse.json(
        {
          status: "completed",
          retryable: false,
          feedback: feedbackView,
        },
        {
          headers: {
            "Cache-Control":
              feedbackView.kind === "invalid"
                ? "private, no-store"
                : "private, max-age=3600",
          },
        }
      );
    }

    // Case 4: Skipped - return immutable completion evidence. Do not rerun the
    // validator after terminalization because late transcript writes or a new
    // validator deployment cannot redefine the committed outcome.
    if (status === "skipped") {
      const candidate = {
        status: "skipped",
        retryable: false,
        details: {
          tier:
            feedbackRecord.completionTier === "abandoned"
              ? "abandoned"
              : "insufficient",
          ...(feedbackRecord.completionStats !== null
            ? { stats: feedbackRecord.completionStats }
            : {}),
          reasons: [],
          recommendations: feedbackRecord.completionRecommendations ?? [],
        },
      };
      const skippedResponse = decodeFeedbackLifecycleResponse(candidate);
      if (!skippedResponse || skippedResponse.status !== "skipped") {
        console.error("[feedback.integrity] invalid skipped feedback", {
          environment:
            process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
          release: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
          sessionId,
        });
        return NextResponse.json(
          { error: "Invalid feedback state" },
          {
            status: 500,
            headers: { "Cache-Control": "private, no-store" },
          }
        );
      }
      return NextResponse.json(skippedResponse, {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    // Case 5: Failed - return error with short cache
    if (status === "failed") {
      const retryable =
        feedbackRecord.completionTier !== null &&
        feedbackRecord.dispatchStatus !== "not_required" &&
        feedbackRecord.dispatchEventId !== null &&
        isFeedbackGenerationRetryable({
          status,
          processingStartedAt: feedbackRecord.processingStartedAt,
        });
      return NextResponse.json(
        {
          status: "failed",
          message: "Feedback could not be completed.",
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
  } catch (error) {
    console.error("[Feedback API] fetch_failed", {
      code: "feedback_fetch_failed",
      ...toSafeErrorLog(error),
    });
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
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
    const result = await recoverFeedbackGenerationWorkflow({
      sessionId,
      userId: user.id,
    });
    if (!result.ok && result.reason === "not_found") {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 404 }
      );
    }
    if (!result.ok && result.reason === "deadline_settlement_pending") {
      return NextResponse.json(
        {
          error: "deadline_settlement_pending",
          message:
            "The interview room is still being closed safely. Feedback will start automatically.",
        },
        {
          status: 409,
          headers: { "Cache-Control": "private, no-store" },
        }
      );
    }
    if (!result.ok) {
      return NextResponse.json(
        {
          error: "session_not_ended",
          message: "End the interview before queueing feedback.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        status: result.status,
        retryable: result.retryable,
        dispatch: result.dispatch
          ? { status: result.dispatch.status, retryable: result.retryable }
          : null,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[Feedback API] retry_failed", {
      code: "feedback_retry_failed",
      ...toSafeErrorLog(error),
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
