/**
 * Issues a short-lived participant token for an existing, active interview.
 * Full interview room creation remains owned by POST /api/session/start.
 *
 * The caller supplies only a session ID. Room name, participant identity, and
 * display name are derived from authenticated server-side records.
 */

import { NextRequest, NextResponse } from "next/server";

import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { createClient } from "@/lib/supabase/server";
import { joinInterviewSessionWorkflow } from "@/lib/workflows/join-interview-session";

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

    const body = await req.json();
    const livekitEnv = getLiveKitEnvironment(process.env);
    if (!livekitEnv.ok) {
      console.error("Missing LiveKit environment variables");
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
  } catch (error) {
    console.error("Error issuing LiveKit participant token:", error);
    return NextResponse.json(
      { error: "Failed to issue LiveKit token" },
      { status: 500 }
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
