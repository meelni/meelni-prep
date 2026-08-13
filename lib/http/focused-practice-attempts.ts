import { randomUUID } from "node:crypto";

import {
  presentFocusedPracticeAttempt,
  type AnyFocusedPracticeAttempt,
} from "@meelni/core";
import { NextResponse } from "next/server";

import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import { drizzleFocusedPracticeAttemptRepository } from "@/lib/db/focused-practice-attempts";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import { resolveReactivationAccess } from "@/lib/feature-flags/reactivation-access";
import { createClient } from "@/lib/supabase/server";
import {
  completeFocusedPracticeAttemptWorkflow,
  readFocusedPracticeAttemptWorkflow,
  startFocusedPracticeAttemptWorkflow,
  type CompleteFocusedPracticeAttemptWorkflowResult,
  type FocusedPracticeAttemptWorkflowDependencies,
  type ReadFocusedPracticeAttemptResult,
  type StartFocusedPracticeAttemptResult,
} from "@/lib/workflows/focused-practice-attempt";

const START_BODY_MAX_BYTES = 1_024;
const COMPLETION_BODY_MAX_BYTES = 12_000;
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

type AuthenticationResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "unauthorized" | "authentication_check_failed" };

export interface FocusedPracticeRouteDependencies
  extends FocusedPracticeAttemptWorkflowDependencies {
  authenticate(): Promise<AuthenticationResult>;
  resolveRelaunchAccess(request: Request): Promise<boolean>;
}

export const focusedPracticeRouteDependencies: FocusedPracticeRouteDependencies =
  {
    repository: drizzleFocusedPracticeAttemptRepository,
    isDeletionPending: hasAccountDeletionTombstone,
    now: () => new Date(),
    createAttemptId: randomUUID,
    authenticate: authenticateRequest,
    resolveRelaunchAccess: resolveRequestRelaunchAccess,
  };

export async function handleStartFocusedPracticeAttempt(
  request: Request,
  deps: FocusedPracticeRouteDependencies = focusedPracticeRouteDependencies
) {
  const authentication = await safelyAuthenticate(deps);
  if (!authentication.ok) return authentication.response;
  const access = await safelyResolveRelaunchAccess(request, deps);
  if (!access.ok) return access.response;

  const body = await readBoundedJson(request, START_BODY_MAX_BYTES);
  if (!hasExactKeys(body, ["sourceSessionId"])) {
    return errorResponse(400, "invalid_request");
  }
  const result = await startFocusedPracticeAttemptWorkflow(
    {
      userId: authentication.userId,
      sourceSessionId: body.sourceSessionId,
    },
    deps
  );
  return startResultResponse(result);
}

export async function handleReadFocusedPracticeAttempt(
  attemptId: string,
  request: Request,
  deps: FocusedPracticeRouteDependencies = focusedPracticeRouteDependencies
) {
  const authentication = await safelyAuthenticate(deps);
  if (!authentication.ok) return authentication.response;
  const access = await safelyResolveRelaunchAccess(request, deps);
  if (!access.ok) return access.response;

  const result = await readFocusedPracticeAttemptWorkflow(
    { userId: authentication.userId, attemptId },
    deps
  );
  return readResultResponse(result);
}

export async function handleCompleteFocusedPracticeAttempt(
  request: Request,
  attemptId: string,
  deps: FocusedPracticeRouteDependencies = focusedPracticeRouteDependencies
) {
  const authentication = await safelyAuthenticate(deps);
  if (!authentication.ok) return authentication.response;
  const access = await safelyResolveRelaunchAccess(request, deps);
  if (!access.ok) return access.response;

  const body = await readBoundedJson(request, COMPLETION_BODY_MAX_BYTES);
  if (!hasExactKeys(body, ["contractVersion", "practicedAloud", "response"])) {
    return errorResponse(400, "invalid_completion");
  }
  const result = await completeFocusedPracticeAttemptWorkflow(
    {
      userId: authentication.userId,
      attemptId,
      completion: body,
    },
    deps
  );
  return completionResultResponse(result);
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

async function resolveRequestRelaunchAccess(request: Request) {
  const gateName = FEATURE_GATES.meelniReactivationAccess;
  const access = await resolveReactivationAccess({
    localOverride: readCookie(
      request.headers.get("cookie"),
      `meelni_feature_flag_${encodeURIComponent(gateName)}`
    ),
  });
  return access.value;
}

async function safelyAuthenticate(
  deps: FocusedPracticeRouteDependencies
): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  try {
    const result = await deps.authenticate();
    if (result.ok) return result;
    return {
      ok: false,
      response:
        result.reason === "unauthorized"
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

async function safelyResolveRelaunchAccess(
  request: Request,
  deps: FocusedPracticeRouteDependencies
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  try {
    return (await deps.resolveRelaunchAccess(request))
      ? { ok: true }
      : {
          ok: false,
          response: errorResponse(403, "focused_practice_unavailable"),
        };
  } catch {
    return {
      ok: false,
      response: errorResponse(503, "access_check_failed"),
    };
  }
}

function startResultResponse(result: StartFocusedPracticeAttemptResult) {
  if (result.ok) {
    return jsonResponse(result.disposition === "created" ? 201 : 200, {
      disposition: result.disposition,
      attempt: presentAttempt(result.attempt),
    });
  }
  if (result.reason === "account_deletion_pending") {
    return errorResponse(401, "account_deletion_pending");
  }
  if (result.reason === "not_found") {
    return errorResponse(404, "focused_practice_source_not_found");
  }
  if (result.reason === "invalid_request") {
    return errorResponse(400, "invalid_request");
  }
  if (result.reason === "source_conflict") {
    return errorResponse(409, "focused_practice_conflict");
  }
  if (result.reason === "attempt_invalid") {
    return errorResponse(500, "focused_practice_integrity_error");
  }
  return errorResponse(409, "focused_practice_unavailable");
}

function readResultResponse(result: ReadFocusedPracticeAttemptResult) {
  if (result.ok) {
    return jsonResponse(200, { attempt: presentAttempt(result.attempt) });
  }
  if (result.reason === "account_deletion_pending") {
    return errorResponse(401, "account_deletion_pending");
  }
  if (result.reason === "invalid_request") {
    return errorResponse(400, "invalid_request");
  }
  if (result.reason === "attempt_invalid") {
    return errorResponse(500, "focused_practice_integrity_error");
  }
  return errorResponse(404, "focused_practice_attempt_not_found");
}

function completionResultResponse(
  result: CompleteFocusedPracticeAttemptWorkflowResult
) {
  if (result.ok) {
    return jsonResponse(200, {
      disposition: result.disposition,
      attempt: presentAttempt(result.attempt),
    });
  }
  if (result.reason === "account_deletion_pending") {
    return errorResponse(401, "account_deletion_pending");
  }
  if (result.reason === "not_found") {
    return errorResponse(404, "focused_practice_attempt_not_found");
  }
  if (
    result.reason === "invalid_request" ||
    result.reason === "invalid_completion"
  ) {
    return errorResponse(400, "invalid_completion");
  }
  if (result.reason === "attempt_invalid") {
    return errorResponse(500, "focused_practice_integrity_error");
  }
  return errorResponse(409, "focused_practice_conflict");
}

function presentAttempt(attempt: AnyFocusedPracticeAttempt) {
  return presentFocusedPracticeAttempt(attempt);
}

async function readBoundedJson(
  request: Request,
  maxBytes: number
): Promise<Record<string, unknown> | null> {
  try {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return null;
    }
    const text = await request.text();
    if (!text || new TextEncoder().encode(text).byteLength > maxBytes) {
      return null;
    }
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function errorResponse(status: number, error: string) {
  return jsonResponse(status, { error });
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function hasExactKeys(
  value: Record<string, unknown> | null,
  expected: readonly string[]
): value is Record<string, unknown> {
  if (!value) return false;
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCookie(header: string | null, name: string) {
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    if (key !== name) continue;
    const value = pair.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
