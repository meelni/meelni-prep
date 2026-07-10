import { NextRequest, NextResponse } from "next/server";

import { isFeedbackDispatchRetryable } from "@/lib/db/feedback-dispatch";
import { createClient } from "@/lib/supabase/server";
import { endInterviewSessionWorkflow } from "@/lib/workflows/end-interview-session";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(req: NextRequest) {
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

    const result = await endInterviewSessionWorkflow({
      sessionId,
      actor: { type: "user", userId: user.id },
      requestedTerminalReason: "user_end",
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "session_not_found", message: "Session not found." },
        { status: 404 }
      );
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
  } catch (error) {
    console.error("Error ending session:", error);
    return NextResponse.json(
      {
        error: "session_end_failed",
        message:
          "We couldn't end the interview yet. You're still connected and can try again.",
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
