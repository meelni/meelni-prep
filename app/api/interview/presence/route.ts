import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { createClient } from "@/lib/supabase/server";
import { reconcileOwnedInterviewPresenceWorkflow } from "@/lib/workflows/reconcile-owned-interview-presence";
import { withDeadline } from "@/lib/http/deadline";
import { INTERVIEW_START_SLOS } from "@/lib/operations/interview-start-slo";
import { genericPreviewVoiceUnavailableResponse } from "@/lib/livekit/generic-preview-guard";

const PRESENCE_ROUTE_DEADLINE_MS =
  INTERVIEW_START_SLOS.presence_reconciliation.upperBoundMs - 250;

export async function POST(req: NextRequest) {
  const unavailable = genericPreviewVoiceUnavailableResponse();
  if (unavailable) return unavailable;

  try {
    return await withDeadline(
      "interview_presence_reconciliation",
      handlePresenceRequest(req),
      PRESENCE_ROUTE_DEADLINE_MS
    );
  } catch {
    return response({ error: "interview_presence_unavailable" }, 503);
  }
}

async function handlePresenceRequest(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return response({ error: "Unauthorized" }, 401);
  }

  const body: unknown = await req.json().catch(() => null);
  const sessionId = readSessionId(body);
  if (!sessionId) {
    return response({ error: "invalid_session_id" }, 400);
  }

  const env = getLiveKitEnvironment(process.env);
  if (!env.ok) {
    return response({ error: "interview_presence_unavailable" }, 503);
  }

  const result = await reconcileOwnedInterviewPresenceWorkflow({
    sessionId,
    userId: user.id,
    deliveryId: `browser-presence:${sessionId}:${randomUUID()}`,
    env: env.data,
  });
  if (result.ok && result.disposition === "terminal") {
    return response({ error: "session_not_joinable" }, 409);
  }
  if (!result.ok) {
    return response(
      {
        error:
          result.disposition === "not_found"
            ? "session_not_found"
            : "interview_presence_conflict",
      },
      result.disposition === "not_found" ? 404 : 409
    );
  }

  const ready = ["activated", "present", "recovered"].includes(
    result.disposition
  );
  return response(
    { ready, disposition: result.disposition },
    ready ? 200 : 202
  );
}

function response(body: object, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function readSessionId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sessionId = (value as Record<string, unknown>).sessionId;
  return typeof sessionId === "string" && isUuid(sessionId) ? sessionId : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
