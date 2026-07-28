import { NextRequest, NextResponse } from "next/server";

import { isFeedbackDispatchRetryable } from "@/lib/db/feedback-dispatch";
import { createClient } from "@/lib/supabase/server";
import { endUserInterviewSessionWorkflow } from "@/lib/workflows/end-user-interview-session";
import { cleanupInterviewRoomWorkflow } from "@/lib/workflows/cleanup-interview-room";
import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import {
  readOwnedInterviewSessionCorrelationId,
  reportOperationalFailure,
  type InterviewSessionCorrelationId,
} from "@/lib/operations/operational-events";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(req: NextRequest) {
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

    if (checkRateLimit(user.id)) {
      return NextResponse.json(
        {
          error: "rate_limit_exceeded",
          message: "Too many requests. Please try again in a minute.",
        },
        { status: 429 }
      );
    }

    const body: unknown = await req.json();
    const sessionId = readSessionId(body);
    if (!sessionId) {
      return NextResponse.json(
        {
          error: "invalid_session_id",
          message: "A valid session is required.",
        },
        { status: 400 }
      );
    }

    const livekitEnv = getLiveKitEnvironment(process.env);
    const result = await endUserInterviewSessionWorkflow({
      sessionId,
      userId: user.id,
      env: livekitEnv.ok ? livekitEnv.data : null,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "session_not_found", message: "Session not found." },
        { status: 404 }
      );
    }
    correlationId = readOwnedInterviewSessionCorrelationId({
      kind: "owned_interview_session",
      session: { id: sessionId, userId: user.id },
      authenticatedUserId: user.id,
    });
    if (result.creditSettlementStatus === "deferred") {
      reportOperationalFailure({
        operation: "interview_end",
        errorCode: "interview_credit_settlement_deferred",
        severity: "warning",
        retryable: true,
        correlationId,
      });
    }
    if (
      result.runtimeSettlement !== "settled" &&
      result.runtimeSettlement !== "degraded"
    ) {
      reportOperationalFailure({
        operation: "interview_end",
        errorCode: "interview_end_runtime_settlement_unavailable",
        severity: "warning",
        retryable: false,
        correlationId,
      });
    }

    if (result.completion.roomName) {
      if (livekitEnv.ok) {
        try {
          await cleanupInterviewRoomWorkflow({
            sessionId,
            env: livekitEnv.data,
          });
        } catch {
          // Terminal truth is already committed. The durable cleanup marker and
          // recovery worker own provider retries; do not ask the user to end twice.
          reportOperationalFailure({
            operation: "interview_end",
            errorCode: "interview_room_cleanup_deferred",
            severity: "warning",
            retryable: true,
            correlationId,
          });
        }
      } else {
        reportOperationalFailure({
          operation: "interview_end",
          errorCode: "interview_room_cleanup_deferred",
          severity: "warning",
          retryable: true,
          correlationId,
        });
      }
    }

    const dispatchStatus =
      result.dispatch?.dispatch?.status ??
      result.completion.feedback.dispatchStatus;
    const dispatchRetryable =
      result.completion.feedback.status === "pending" &&
      isFeedbackDispatchRetryable({
        status: dispatchStatus,
        claimedAt:
          result.dispatch?.dispatch?.claimedAt ??
          result.completion.feedback.dispatchClaimedAt,
      });
    const status =
      result.completion.feedback.status === "skipped"
        ? "skipped"
        : dispatchRetryable
          ? "pending_dispatch"
          : "queued";

    return NextResponse.json({
      status,
      runtimeSettlement: result.runtimeSettlement,
      session: {
        lifecycleState: result.completion.lifecycle.state,
        terminalReason: result.completion.lifecycle.terminalReason,
        endedAt: result.completion.lifecycle.endedAt,
        disposition: result.completion.disposition,
      },
      feedback: {
        id: result.completion.feedback.id,
        status: result.completion.feedback.status,
        dispatchStatus,
        retryable: dispatchRetryable,
      },
      feedbackId: result.completion.feedback.id,
      tier: result.completion.tier,
      stats: result.completion.stats,
      recommendations: result.completion.recommendations,
      ...(result.completion.feedback.status === "skipped"
        ? { reason: result.completion.feedback.statusReason }
        : {}),
      nextHref: `/feedback/${sessionId}/loading`,
    });
  } catch {
    reportOperationalFailure({
      operation: "interview_end",
      errorCode: "interview_end_failed",
      severity: "critical",
      retryable: true,
      correlationId,
    });
    return NextResponse.json(
      {
        error: "session_end_failed",
        message:
          "Your interview is paused, but we couldn't confirm completion yet. Please try End Interview again.",
      },
      { status: 500 }
    );
  }
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);
  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }
  if (userLimit.count >= RATE_LIMIT_MAX) return true;
  userLimit.count += 1;
  return false;
}

function readSessionId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sessionId = (value as Record<string, unknown>).sessionId;
  if (typeof sessionId !== "string" || !isUuid(sessionId)) return null;
  return sessionId;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
