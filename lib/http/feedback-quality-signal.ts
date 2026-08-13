import { NextRequest, NextResponse } from "next/server";

import { trackFeedbackHelpfulnessResponded } from "@/lib/analytics/feedback-quality";
import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import {
  consumeFeedbackQualitySignalRateLimit,
  drizzleFeedbackQualitySignalRepository,
  type FeedbackQualityRateLimitDecision,
} from "@/lib/db/feedback-quality-signals";
import { getFeedbackQualityRequestPolicyError } from "@/lib/security/feedback-quality-request-policy";
import { createClient } from "@/lib/supabase/server";
import {
  readFeedbackQualitySignalWorkflow,
  writeFeedbackQualitySignalWorkflow,
  type FeedbackQualityWorkflowDependencies,
  type ReadFeedbackQualitySignalResult,
  type WriteFeedbackQualitySignalResult,
} from "@/lib/workflows/feedback-quality-signal";

const MAX_BODY_BYTES = 1_024;
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

type AuthenticationResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "unauthorized" | "authentication_check_failed" };

export interface FeedbackQualityRouteDependencies
  extends FeedbackQualityWorkflowDependencies {
  authenticate(): Promise<AuthenticationResult>;
  consumeRateLimit(userId: string): Promise<FeedbackQualityRateLimitDecision>;
  trackResponse(input: {
    userId: string;
    outcome: "full_scorecard" | "partial_scorecard" | "coaching_review";
    response: "helpful" | "not_helpful";
    reason:
      | "not_specific_enough"
      | "evidence_did_not_match"
      | "next_step_unclear"
      | "too_much_to_use"
      | "score_explanation_unclear"
      | "score_withholding_unclear"
      | null;
  }): Promise<void>;
}

export const feedbackQualityRouteDependencies: FeedbackQualityRouteDependencies =
  {
    repository: drizzleFeedbackQualitySignalRepository,
    isDeletionPending: hasAccountDeletionTombstone,
    authenticate: authenticateRequest,
    consumeRateLimit: consumeFeedbackQualitySignalRateLimit,
    trackResponse: trackFeedbackHelpfulnessResponded,
  };

export async function handleReadFeedbackQualitySignal(
  sessionId: string,
  deps: FeedbackQualityRouteDependencies = feedbackQualityRouteDependencies
) {
  const auth = await safelyAuthenticate(deps);
  if (!auth.ok) return auth.response;
  if (!isUuid(sessionId)) {
    return errorResponse(404, "feedback_quality_not_found");
  }
  let result: ReadFeedbackQualitySignalResult;
  try {
    result = await readFeedbackQualitySignalWorkflow(
      { userId: auth.userId, sessionId },
      deps
    );
  } catch {
    return errorResponse(503, "feedback_quality_unavailable");
  }
  return readResultResponse(result);
}

export async function handleWriteFeedbackQualitySignal(
  request: NextRequest,
  sessionId: string,
  deps: FeedbackQualityRouteDependencies = feedbackQualityRouteDependencies
) {
  const auth = await safelyAuthenticate(deps);
  if (!auth.ok) return auth.response;

  let rate: FeedbackQualityRateLimitDecision;
  try {
    rate = await deps.consumeRateLimit(auth.userId);
  } catch {
    return errorResponse(503, "feedback_quality_unavailable");
  }
  if (!rate.allowed) {
    return errorResponse(429, "feedback_quality_rate_limited", {
      "Retry-After": String(rate.retryAfterSeconds),
    });
  }
  if (!isUuid(sessionId)) {
    return errorResponse(404, "feedback_quality_not_found");
  }

  const policyError = getFeedbackQualityRequestPolicyError(request);
  if (policyError) return errorResponse(policyError.status, policyError.error);
  const body = await readBoundedJson(request, MAX_BODY_BYTES);
  if (body.state === "too_large") {
    return errorResponse(413, "feedback_quality_request_too_large");
  }
  if (body.state !== "valid") {
    return errorResponse(400, "invalid_feedback_quality_request");
  }

  let result: WriteFeedbackQualitySignalResult;
  try {
    result = await writeFeedbackQualitySignalWorkflow(
      { userId: auth.userId, sessionId, command: body.value },
      deps
    );
  } catch {
    return errorResponse(503, "feedback_quality_unavailable");
  }
  const response = writeResultResponse(result);
  if (
    result.ok &&
    (result.disposition === "created" || result.disposition === "updated") &&
    result.state.signal
  ) {
    try {
      if (await deps.isDeletionPending(auth.userId)) return response;
      await deps.trackResponse({
        userId: auth.userId,
        outcome: result.state.outcome,
        response: result.state.signal.response,
        reason: result.state.signal.reason,
      });
    } catch {
      // Optional analytics must never roll back or obscure the durable write.
    }
  }
  return response;
}

async function authenticateRequest(): Promise<AuthenticationResult> {
  const supabase = await createClient();
  const result = await supabase.auth.getUser();
  if (result.error) {
    return { ok: false, reason: "authentication_check_failed" };
  }
  return result.data.user
    ? { ok: true, userId: result.data.user.id }
    : { ok: false, reason: "unauthorized" };
}

async function safelyAuthenticate(
  deps: FeedbackQualityRouteDependencies
): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  try {
    const auth = await deps.authenticate();
    if (auth.ok) return auth;
    return {
      ok: false,
      response:
        auth.reason === "unauthorized"
          ? errorResponse(401, "unauthorized")
          : errorResponse(503, "authentication_check_failed"),
    };
  } catch {
    return {
      ok: false,
      response: errorResponse(503, "authentication_check_failed"),
    };
  }
}

function readResultResponse(result: ReadFeedbackQualitySignalResult) {
  if (result.ok) return jsonResponse(200, result.state);
  if (
    result.reason === "not_found" ||
    result.reason === "account_deletion_pending" ||
    result.reason === "signal_invalid"
  ) {
    return errorResponse(404, "feedback_quality_not_found");
  }
  if (result.reason === "invalid_request") {
    return errorResponse(400, "invalid_request");
  }
  return errorResponse(500, "feedback_quality_integrity_error");
}

function writeResultResponse(result: WriteFeedbackQualitySignalResult) {
  if (result.ok) {
    return jsonResponse(result.disposition === "created" ? 201 : 200, {
      disposition: result.disposition,
      ...result.state,
    });
  }
  if (result.reason === "conflict") {
    return jsonResponse(409, {
      error: "feedback_quality_conflict",
      ...result.state,
    });
  }
  if (
    result.reason === "not_found" ||
    result.reason === "account_deletion_pending" ||
    result.reason === "signal_invalid"
  ) {
    return errorResponse(404, "feedback_quality_not_found");
  }
  if (result.reason === "invalid_request") {
    return errorResponse(400, "invalid_feedback_quality_request");
  }
  return errorResponse(500, "feedback_quality_integrity_error");
}

async function readBoundedJson(
  request: Request,
  maxBytes: number
): Promise<
  | { state: "valid"; value: Record<string, unknown> }
  | { state: "too_large" | "invalid" }
> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { state: "too_large" };
  }
  if (!request.body) return { state: "invalid" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > maxBytes) {
        try {
          await reader.cancel("feedback_quality_request_too_large");
        } catch {
          // Rejection cannot change the already-established request bound.
        }
        return { state: "too_large" };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { state: "valid", value: parsed as Record<string, unknown> }
      : { state: "invalid" };
  } catch {
    return { state: "invalid" };
  } finally {
    reader.releaseLock();
  }
}

function errorResponse(
  status: number,
  error: string,
  headers?: Record<string, string>
) {
  return jsonResponse(status, { error }, headers);
}

function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>
) {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}
