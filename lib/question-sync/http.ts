import { NextResponse } from "next/server";
import type { QuestionSyncAuthorizationResult } from "@/lib/security/question-sync-authorization";
import type { QuestionSyncWorkflowResult } from "@/lib/workflows/sync-question-bank";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function questionSyncAuthorizationResponse(
  result: Exclude<QuestionSyncAuthorizationResult, { authorized: true }>
) {
  const configurationError = result.reason === "configuration";
  return NextResponse.json(
    {
      success: false,
      error: {
        code: configurationError
          ? "question_sync_not_configured"
          : "question_sync_unauthorized",
        message: configurationError
          ? "Question sync is unavailable."
          : "Operator authorization is required.",
      },
    },
    {
      status: configurationError ? 503 : 401,
      headers: configurationError
        ? NO_STORE_HEADERS
        : { ...NO_STORE_HEADERS, "WWW-Authenticate": "Bearer" },
    }
  );
}

export function questionSyncWorkflowResponse(
  result: QuestionSyncWorkflowResult
) {
  if (result.status === "completed") {
    return NextResponse.json(
      {
        success: true,
        triggeredBy: result.trigger,
        triggeredAt: result.triggeredAt,
        dryRun: result.dryRun,
        ...result.summary,
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  const busy = result.status === "busy";
  return NextResponse.json(
    {
      success: false,
      triggeredBy: result.trigger,
      triggeredAt: result.triggeredAt,
      dryRun: result.dryRun,
      error: {
        code: result.errorCode,
        message: busy
          ? "A question sync is already running."
          : "Question sync could not be completed.",
      },
    },
    {
      status: busy ? 409 : result.status === "unavailable" ? 503 : 500,
      headers: busy
        ? { ...NO_STORE_HEADERS, "Retry-After": "60" }
        : NO_STORE_HEADERS,
    }
  );
}

export async function parseManualQuestionSyncRequest(
  request: Request
): Promise<
  { valid: true; dryRun: boolean } | { valid: false; response: NextResponse }
> {
  const source = await request.text();
  if (!source.trim()) return { valid: true, dryRun: false };

  const contentType = request.headers.get("content-type")?.split(";")[0];
  if (contentType !== "application/json") {
    return {
      valid: false,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: "unsupported_media_type",
            message: "Use application/json for manual sync options.",
          },
        },
        { status: 415, headers: NO_STORE_HEADERS }
      ),
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(source);
  } catch {
    return invalidManualRequest();
  }

  if (!isObject(body) || Object.keys(body).some((key) => key !== "dryRun")) {
    return invalidManualRequest();
  }
  if ("dryRun" in body && typeof body.dryRun !== "boolean") {
    return invalidManualRequest();
  }

  return { valid: true, dryRun: body.dryRun === true };
}

function invalidManualRequest() {
  return {
    valid: false as const,
    response: NextResponse.json(
      {
        success: false,
        error: {
          code: "invalid_request",
          message: "Manual sync accepts only an optional dryRun boolean.",
        },
      },
      { status: 400, headers: NO_STORE_HEADERS }
    ),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
