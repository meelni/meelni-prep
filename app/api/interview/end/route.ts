import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { acceptUserInterviewEndWorkflow } from "@/lib/workflows/accept-user-interview-end";
import {
  readOwnedInterviewSessionCorrelationId,
  reportOperationalFailure,
  type InterviewSessionCorrelationId,
} from "@/lib/operations/operational-events";
import { reportInterviewEndStage } from "@/lib/operations/interview-end-stage";

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

    const acceptanceStartedAt = Date.now();
    const result = await acceptUserInterviewEndWorkflow({
      sessionId,
      userId: user.id,
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
    reportInterviewEndStage({
      stage: "accept",
      outcome: result.delivery === "deferred" ? "deferred" : "succeeded",
      durationMs: Date.now() - acceptanceStartedAt,
      sessionId,
    });
    if (result.delivery === "deferred") {
      reportOperationalFailure({
        operation: "interview_end",
        errorCode: "interview_end_dispatch_deferred",
        severity: "warning",
        retryable: true,
        correlationId,
      });
    }

    const terminal = result.disposition === "already_terminal";
    return NextResponse.json(
      {
        status: terminal ? "completed" : "settling",
        delivery: result.delivery,
        session: {
          lifecycleState: result.session.lifecycleState,
          terminalReason: result.session.terminalReason,
          endingAt: result.session.endingAt,
          endedAt: result.session.endedAt,
          disposition: result.disposition,
        },
        nextHref: `/feedback/${sessionId}/loading`,
      },
      { status: terminal ? 200 : 202 }
    );
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
