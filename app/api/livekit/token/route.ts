/**
 * Issues a short-lived participant token for an existing, active interview.
 * Full interview room creation remains owned by POST /api/session/start.
 *
 * The caller supplies only a session ID. Room name, participant identity, and
 * display name are derived from authenticated server-side records.
 */

import { NextRequest, NextResponse } from "next/server";

import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import {
  readInterviewSessionCorrelationId,
  readOperationalRequestId,
  reportOperationalFailure,
  type InterviewSessionCorrelationId,
} from "@/lib/operations/operational-events";
import { createClient } from "@/lib/supabase/server";
import { joinInterviewSessionWorkflow } from "@/lib/workflows/join-interview-session";

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

    const body = await req.json();
    correlationId = readInterviewSessionCorrelationId({
      kind: "interview_session",
      sessionId: isRecord(body) ? body.sessionId : null,
    });
    const livekitEnv = getLiveKitEnvironment(process.env);
    if (!livekitEnv.ok) {
      reportOperationalFailure({
        operation: "interview_token",
        errorCode: "livekit_config_missing",
        severity: "critical",
        retryable: false,
        requestId: readOperationalRequestId(req),
        correlationId,
      });
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const result = await joinInterviewSessionWorkflow({
      user: { id: user.id },
      sessionId: isRecord(body) ? body.sessionId : undefined,
      env: livekitEnv.data,
    });

    if (!result.ok && result.status >= 500) {
      const providerUnavailable =
        result.body.error === "livekit_token_unavailable";
      reportOperationalFailure({
        operation: "interview_token",
        errorCode: providerUnavailable
          ? "livekit_token_unavailable"
          : "livekit_reconnect_rate_limit_unavailable",
        severity: "critical",
        retryable: result.status === 503,
        requestId: readOperationalRequestId(req),
        correlationId,
      });
    }

    const headers =
      !result.ok && result.status === 429 && result.retryAfterSeconds
        ? { "Retry-After": result.retryAfterSeconds.toString() }
        : undefined;

    return NextResponse.json(result.body, {
      status: result.ok ? 200 : result.status,
      headers,
    });
  } catch {
    reportOperationalFailure({
      operation: "interview_token",
      errorCode: "livekit_token_issue_failed",
      retryable: true,
      requestId: readOperationalRequestId(req),
      correlationId,
    });
    return NextResponse.json(
      { error: "Failed to issue LiveKit token" },
      { status: 500 }
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
