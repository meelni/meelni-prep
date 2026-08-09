/**
 * Issues a short-lived participant token for an existing, active interview.
 * Full interview room creation remains owned by POST /api/session/start.
 *
 * The caller supplies only a session ID. Room name, participant identity, and
 * display name are derived from authenticated server-side records.
 */

import { NextRequest, NextResponse } from "next/server";

import { resolveReactivationAccess } from "@/lib/feature-flags/reactivation-access";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { createClient } from "@/lib/supabase/server";
import { joinInterviewSessionWorkflow } from "@/lib/workflows/join-interview-session";
import {
  CUSTOMER_READ_ROUTE_DEADLINE_MS,
  DEPENDENCY_RETRY_AFTER_SECONDS,
  isDeadlineExceededError,
  withDeadline,
} from "@/lib/http/deadline";
import { genericPreviewVoiceUnavailableResponse } from "@/lib/livekit/generic-preview-guard";

export async function POST(req: NextRequest) {
  const unavailable = genericPreviewVoiceUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    return await withDeadline(
      "interview_token_issue",
      handleTokenRequest(req),
      CUSTOMER_READ_ROUTE_DEADLINE_MS
    );
  } catch (error) {
    if (isDeadlineExceededError(error)) {
      reportOperationalFailure({
        operation: "interview_token",
        errorCode: "livekit_token_issue_failed",
        severity: "critical",
        retryable: true,
      });
      return NextResponse.json(
        { error: "interview_token_unavailable", retryable: true },
        {
          status: 503,
          headers: { "Retry-After": String(DEPENDENCY_RETRY_AFTER_SECONDS) },
        }
      );
    }
    reportOperationalFailure({
      operation: "interview_token",
      errorCode: "livekit_token_issue_failed",
      severity: "critical",
      retryable: true,
    });
    return NextResponse.json(
      { error: "Failed to issue LiveKit token" },
      { status: 500 }
    );
  }
}

async function handleTokenRequest(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gateName = FEATURE_GATES.meelniReactivationAccess;
  const access = await resolveReactivationAccess({
    localOverride: req.cookies.get(
      `meelni_feature_flag_${encodeURIComponent(gateName)}`
    )?.value,
  });
  if (!access.value) {
    return NextResponse.json(
      {
        error: "interview_practice_unavailable",
        message: "Interview practice is not open for this account yet.",
        retryable: false,
      },
      { status: 403 }
    );
  }

  const body = await req.json();
  const livekitEnv = getLiveKitEnvironment(process.env);
  if (!livekitEnv.ok) {
    reportOperationalFailure({
      operation: "interview_token",
      errorCode: "livekit_config_missing",
      severity: "critical",
      retryable: false,
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

  const headers =
    !result.ok && result.status === 429 && result.retryAfterSeconds
      ? { "Retry-After": result.retryAfterSeconds.toString() }
      : undefined;

  return NextResponse.json(result.body, {
    status: result.ok ? 200 : result.status,
    headers,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
