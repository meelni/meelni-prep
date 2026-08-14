/**
 * Start Interview Session API
 *
 * Creates a new interview session, sets up a LiveKit room, dispatches an AI agent,
 * and returns credentials for the user to join the interview.
 *
 * @route POST /api/session/start
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @request {Object} body - Request payload
 * @request.startAttemptId {string} Required - Stable UUID reused after ambiguous failures
 * @request.roundType {string} Required - Interview round type. One of: behavioral, product_sense, execution, strategy
 * @request.mode {string} Optional - Interview mode (default: voice_video). One of: voice_video, text
 * @request.role {string} Optional - Canonical candidate role; only "pm" is accepted
 * @request.config {Object} Optional - Client-safe interview preferences
 * @request.config.difficulty {string} Optional - beginner, intermediate, or advanced
 * @request.config.duration {number} Optional - 15, 30, or 45 minutes
 * @request.config.hintMode {string} Optional compatibility field; full mock interviews always normalize it to off
 * @request.config.questionPreference {Object} Optional - Question recency preference
 * @request.company {string} Optional - Exact company context for server-owned question selection
 *
 * @response {Object} response - Session credentials and info
 * @response.sessionId {string} - UUID of created session
 * @response.roomName {string} - LiveKit room name (format: interview-{timestamp}-{random})
 * @response.token {string} - JWT access token for LiveKit room
 * @response.url {string} - LiveKit server WebSocket URL
 * @response.deadlineAt {string} - Server-derived absolute UTC interview deadline
 * @response.config {Object} - Validated client-safe preferences; runtime provider settings are never returned
 * @response.question {Object|null} - Selected question snapshot when present
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {402} Payment Required - No interview credits remaining
 * @throws {400} Bad Request - Missing roundType or invalid roundType value
 * @throws {503} Service Unavailable - Unable to verify credits or start LiveKit room
 * @throws {500} Internal Server Error - Database error, LiveKit configuration error, or agent dispatch failure
 *
 * @example
 * // Request
 * POST /api/session/start
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *   Content-Type: application/json
 * Body:
 * {
 *   "startAttemptId": "550e8400-e29b-41d4-a716-446655440000",
 *   "roundType": "product_sense",
 *   "role": "pm",
 *   "config": {
 *     "difficulty": "intermediate",
 *     "duration": 45,
 *     "hintMode": "off",
 *     "questionPreference": {
 *       "recency": "very_recent",
 *       "recentDays": 365
 *     }
 *   }
 * }
 *
 * // Response (200 OK)
 * {
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *   "roomName": "interview-550e8400-e29b-41d4-a716-446655440000",
 *   "token": "eyJhbGciOiJIUzI1NiIs...",
 *   "url": "wss://meelni-ek4vaisp.livekit.cloud",
 *   "deadlineAt": "2026-07-11T20:30:00.000Z",
 *   "config": {
 *     "difficulty": "intermediate",
 *     "duration": 45,
 *     "hintMode": "off",
 *     "questionPreference": {
 *       "recency": "very_recent",
 *       "recentDays": 365
 *     }
 *   },
 *   "question": null
 * }
 *
 * // Error Response (400 Bad Request)
 * {
 *   "error": "roundType is required"
 * }
 *
 * // Error Response (401 Unauthorized)
 * {
 *   "error": "Unauthorized"
 * }
 *
 * // Error Response (402 Payment Required - No Credits)
 * {
 *   "error": "no_credits_remaining",
 *   "message": "You need an interview credit to start a full interview.",
 *   "upgradeUrl": "/pricing"
 * }
 *
 * // Error Response (503 Service Unavailable)
 * {
 *   "error": "service_unavailable",
 *   "message": "Unable to verify interview credits. Please try again in a moment."
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getLiveKitAgentName,
  getLiveKitEnvironment,
} from "@/lib/internal/integrations";
import { startInterviewSessionWorkflow } from "@/lib/workflows/start-session";
import { resolveReactivationAccess } from "@/lib/feature-flags/reactivation-access";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import { resolveInterviewAppBaseUrl } from "@/lib/interview/app-base-url";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { genericPreviewVoiceUnavailableResponse } from "@/lib/livekit/generic-preview-guard";
import { reportInterviewStartStage } from "@/lib/operations/interview-start-slo";

export async function POST(req: NextRequest) {
  const unavailable = genericPreviewVoiceUnavailableResponse();
  if (unavailable) return unavailable;

  const authorizationStartedAt = performance.now();
  let authorizationPending = true;
  const reportAuthorization = (
    outcome: "succeeded" | "terminal" | "failed"
  ) => {
    if (!authorizationPending) return;
    authorizationPending = false;
    reportInterviewStartStage({
      stage: "authorization_gate",
      outcome,
      durationMs: Math.max(0, performance.now() - authorizationStartedAt),
    });
  };

  try {
    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      reportAuthorization("terminal");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gateName = FEATURE_GATES.meelniReactivationAccess;
    const access = await resolveReactivationAccess({
      localOverride: req.cookies.get(
        `meelni_feature_flag_${encodeURIComponent(gateName)}`
      )?.value,
    });
    if (!access.value) {
      reportAuthorization("terminal");
      return NextResponse.json(
        {
          error: "interview_practice_unavailable",
          message: "Interview practice is not open for this account yet.",
          retryable: false,
        },
        { status: 403 }
      );
    }
    reportAuthorization("succeeded");

    // Parse request body first to access roundType
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object", retryable: false },
        { status: 400 }
      );
    }
    // Validate required environment variables
    const livekitEnv = getLiveKitEnvironment(process.env);
    if (!livekitEnv.ok) {
      reportOperationalFailure({
        operation: "interview_start",
        errorCode: "livekit_config_missing",
        severity: "critical",
        retryable: false,
      });
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const interviewAgentName = getLiveKitAgentName("interview", process.env);
    if (!interviewAgentName.ok) {
      reportOperationalFailure({
        operation: "interview_start",
        errorCode: "livekit_agent_config_missing",
        severity: "critical",
        retryable: false,
      });
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const result = await startInterviewSessionWorkflow({
      user: {
        id: user.id,
        email: user.email,
        metadata: user.user_metadata,
      },
      body,
      env: livekitEnv.data,
      interviewAgentName: interviewAgentName.data,
      appBaseUrl: resolveInterviewAppBaseUrl(process.env),
    });

    if (!result.ok) {
      const retryAfterMs = result.body.retryAfterMs;
      const headers =
        typeof retryAfterMs === "number" && retryAfterMs > 0
          ? {
              "Retry-After": String(
                Math.max(1, Math.ceil(retryAfterMs / 1000))
              ),
            }
          : undefined;
      return NextResponse.json(result.body, {
        status: result.status,
        headers,
      });
    }

    return NextResponse.json(result.body);
  } catch {
    reportAuthorization("failed");
    reportOperationalFailure({
      operation: "interview_start",
      errorCode: "interview_start_failed",
      severity: "critical",
      retryable: true,
    });
    return NextResponse.json(
      { error: "Failed to start session" },
      { status: 500 }
    );
  }
}
