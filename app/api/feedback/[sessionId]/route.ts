/**
 * Authenticated, owner-scoped feedback polling and recovery API.
 * Completed rows cross the strict @meelni/core read boundary before response;
 * lifecycle clients use only the top-level retryable field as recovery truth.
 * See docs/api/feedback-polling-examples.md for the discriminated contract.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRetryableSupabaseAuthError } from "@/lib/supabase/auth-error";
import { getSessionById, isSessionOwnedByUser } from "@/lib/db/sessions";
import {
  getFeedbackBySessionId,
  hasValidFeedbackLifecycleFields,
} from "@/lib/db/feedback";
import { getFeedbackEvidenceTurns } from "@/lib/db/transcripts";
import { isFeedbackDispatchRetryable } from "@/lib/db/feedback-dispatch";
import {
  isFeedbackGenerationLeaseExpired,
  isFeedbackQueueLeaseExpired,
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
import {
  readOwnedInterviewSessionCorrelationId,
  reportOperationalFailure,
  type InterviewSessionCorrelationId,
} from "@/lib/operations/operational-events";
import { recoverFeedbackGenerationWorkflow } from "@/lib/workflows/recover-feedback-generation";
import { isRetryableDatabaseContentionError } from "@/lib/db/retryable-error";
import { withInteractiveReadTransaction } from "@/lib/db/interactive-read";
import {
  elapsedInterviewLifecycleMs,
  INTERVIEW_LIFECYCLE_SLOS,
} from "@/lib/operations/interview-lifecycle-slo";
import { reportInterviewEndStage } from "@/lib/operations/interview-end-stage";
import {
  acceptUserInterviewEndWorkflow,
  userInterviewEndRedeliveryId,
} from "@/lib/workflows/accept-user-interview-end";
import {
  CUSTOMER_READ_ROUTE_DEADLINE_MS,
  DEPENDENCY_RETRY_AFTER_SECONDS,
  isDeadlineExceededError,
  withDeadline,
} from "@/lib/http/deadline";

// Estimated total processing time (seconds)
const ESTIMATED_PROCESSING_TIME = 45;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  let correlationId: InterviewSessionCorrelationId | null = null;
  const readStartedAt = Date.now();
  try {
    const response = await withDeadline(
      "feedback_read",
      (async () => {
        // Verify authentication
        const supabase = await createClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError && isRetryableSupabaseAuthError(authError)) {
          throw authError;
        }
        if (authError || !user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId } = await params;

        return withInteractiveReadTransaction(async (database) => {
          // Verify user owns the session
          const isOwner = await isSessionOwnedByUser(
            sessionId,
            user.id,
            database
          );
          if (!isOwner) {
            return NextResponse.json(
              { error: "Session not found or access denied" },
              { status: 404 } // Use 404 to avoid leaking session existence
            );
          }

          const session = await getSessionById(sessionId, database);
          if (session) {
            correlationId = readOwnedInterviewSessionCorrelationId({
              kind: "owned_interview_session",
              session,
              authenticatedUserId: user.id,
            });
          }

          // Get feedback
          const feedbackRecord = await getFeedbackBySessionId(
            sessionId,
            database
          );

          if (session?.lifecycleState === "ending") {
            const elapsedMs = elapsedInterviewLifecycleMs(
              session.endingAt,
              new Date(Date.now())
            );
            const delayed =
              elapsedMs !== null &&
              elapsedMs >=
                INTERVIEW_LIFECYCLE_SLOS.terminalization.upperBoundMs;
            const retryable = delayed && session.terminalReason === "user_end";
            return NextResponse.json(
              {
                status: "settling",
                retryable,
                delayed,
                message: delayed
                  ? retryable
                    ? "Your interview is saved, but final processing is delayed. Retry the handoff to continue."
                    : "Your interview is saved, but final processing is taking longer. Recovery will continue automatically."
                  : "Your interview is saved. We’re finishing the transcript and will begin feedback automatically.",
              },
              { headers: { "Cache-Control": "private, no-store" } }
            );
          }

          if (
            session &&
            hasInterviewDeadlineRoomCleanupClaim(session) &&
            !isInterviewDeadlineRoomCleanupAcknowledged(session)
          ) {
            const elapsedMs = elapsedInterviewLifecycleMs(
              session.endedAt ?? session.endingAt,
              new Date(Date.now())
            );
            const delayed =
              elapsedMs !== null &&
              elapsedMs >=
                INTERVIEW_LIFECYCLE_SLOS.terminalization.upperBoundMs;
            return NextResponse.json(
              {
                status: "settling",
                retryable: false,
                delayed,
                message:
                  "The interview is saved and its room is still being closed safely.",
              },
              { headers: { "Cache-Control": "private, no-store" } }
            );
          }

          if (!feedbackRecord) {
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

          if (!hasValidFeedbackLifecycleFields(feedbackRecord)) {
            reportOperationalFailure({
              operation: "feedback_dispatch",
              errorCode: "feedback_integrity_invalid",
              severity: "error",
              retryable: false,
              correlationId,
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
            const queuedElapsedMs = elapsedInterviewLifecycleMs(
              feedbackRecord.dispatchedAt ?? feedbackRecord.createdAt,
              new Date(Date.now())
            );
            const delayed =
              queuedElapsedMs !== null &&
              queuedElapsedMs >=
                INTERVIEW_LIFECYCLE_SLOS.feedback_completion.targetMs;
            const retryable =
              feedbackRecord.completionTier !== null &&
              (isFeedbackDispatchRetryable({
                status: feedbackRecord.dispatchStatus,
                claimedAt: feedbackRecord.dispatchClaimedAt,
              }) ||
                isFeedbackQueueLeaseExpired(
                  feedbackRecord,
                  new Date(Date.now())
                ));
            return NextResponse.json(
              {
                status: "pending",
                retryable,
                delayed,
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
                  isFeedbackGenerationLeaseExpired(
                    {
                      status,
                      processingStartedAt: feedbackRecord.processingStartedAt,
                    },
                    new Date(Date.now())
                  ),
                delayed:
                  feedbackRecord.processingStartedAt !== null &&
                  Date.now() -
                    new Date(feedbackRecord.processingStartedAt).getTime() >=
                    INTERVIEW_LIFECYCLE_SLOS.feedback_completion.targetMs,
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
              ? await getFeedbackEvidenceTurns(sessionId, database)
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
              reportOperationalFailure({
                operation: "feedback_dispatch",
                errorCode: "feedback_integrity_invalid",
                severity: "error",
                retryable: false,
                correlationId,
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
              reportOperationalFailure({
                operation: "feedback_dispatch",
                errorCode: "feedback_integrity_invalid",
                severity: "error",
                retryable: false,
                correlationId,
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
        });
      })(),
      CUSTOMER_READ_ROUTE_DEADLINE_MS
    );
    reportInterviewEndStage({
      stage: "lifecycle_read",
      outcome: "succeeded",
      durationMs: Date.now() - readStartedAt,
      reason: "feedback_read_succeeded",
      sessionId: correlationId ?? undefined,
      slo: "lifecycle_read",
    });
    return response;
  } catch (error) {
    reportInterviewEndStage({
      stage: "lifecycle_read",
      outcome: "failed",
      durationMs: Date.now() - readStartedAt,
      reason: "feedback_read_failed",
      sessionId: correlationId ?? undefined,
      slo: "lifecycle_read",
    });
    reportOperationalFailure({
      operation: "feedback_dispatch",
      errorCode: "feedback_read_failed",
      severity: "error",
      retryable: true,
      correlationId,
    });
    if (
      isDeadlineExceededError(error) ||
      isRetryableDatabaseContentionError(error) ||
      isRetryableSupabaseAuthError(error)
    ) {
      return NextResponse.json(
        {
          error: "feedback_read_unavailable",
          message:
            "Feedback status is temporarily unavailable. Please try again shortly.",
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": String(DEPENDENCY_RETRY_AFTER_SECONDS),
          },
        }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  let correlationId: InterviewSessionCorrelationId | null = null;
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
    const session = await getSessionById(sessionId);
    if (!session || session.userId !== user.id) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 404 }
      );
    }
    if (session.lifecycleState === "ending") {
      const elapsedMs = elapsedInterviewLifecycleMs(
        session.endingAt,
        new Date(Date.now())
      );
      const delayed =
        elapsedMs !== null &&
        elapsedMs >= INTERVIEW_LIFECYCLE_SLOS.terminalization.upperBoundMs;
      const retryable = delayed && session.terminalReason === "user_end";
      if (retryable) {
        await acceptUserInterviewEndWorkflow({
          sessionId,
          userId: user.id,
          deliveryId: userInterviewEndRedeliveryId(),
        });
      }
      return NextResponse.json(
        {
          status: "settling",
          retryable,
          delayed,
          message: retryable
            ? "The saved interview handoff was retried. We’ll keep checking its progress."
            : delayed
              ? "The interview is saved. Recovery is continuing automatically."
              : "The interview is still closing safely.",
        },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }
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
    correlationId = readOwnedInterviewSessionCorrelationId({
      kind: "owned_interview_session",
      session: { id: sessionId, userId: user.id },
      authenticatedUserId: user.id,
    });
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
  } catch {
    reportOperationalFailure({
      operation: "feedback_dispatch",
      errorCode: "feedback_retry_failed",
      severity: "error",
      retryable: true,
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
