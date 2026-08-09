import { NextRequest, NextResponse } from "next/server";

import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { createClient } from "@/lib/supabase/server";
import { requestUserEndRuntimeSettlementWorkflow } from "@/lib/workflows/request-user-end-runtime-settlement";
import { genericPreviewVoiceUnavailableResponse } from "@/lib/livekit/generic-preview-guard";

export async function POST(req: NextRequest) {
  const unavailable = genericPreviewVoiceUnavailableResponse();
  if (unavailable) return unavailable;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
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
  if (!livekitEnv.ok) {
    return NextResponse.json(
      {
        error: "runtime_settlement_unavailable",
        message:
          "The interview runtime is unavailable. Please wait a moment and try again.",
      },
      { status: 503 }
    );
  }

  try {
    const result = await requestUserEndRuntimeSettlementWorkflow({
      sessionId,
      userId: user.id,
      env: livekitEnv.data,
    });
    if (!result.ok) {
      if (result.reason === "not_found") {
        return NextResponse.json(
          { error: "session_not_found", message: "Session not found." },
          { status: 404 }
        );
      }
      return NextResponse.json(
        {
          error: result.reason,
          message:
            result.reason === "runtime_not_ready"
              ? "We're still saving your latest response. Please try ending again in a moment."
              : "The interview runtime is temporarily unavailable. Please try ending again.",
        },
        { status: result.reason === "runtime_not_ready" ? 409 : 503 }
      );
    }

    return NextResponse.json(result.settlement);
  } catch {
    return NextResponse.json(
      {
        error: "runtime_settlement_failed",
        message:
          "We couldn't verify the complete transcript yet. Please try ending again.",
      },
      { status: 500 }
    );
  }
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
