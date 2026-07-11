import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createDrizzleTranscriptIngestStore } from "@/lib/db/transcripts";
import { createClient } from "@/lib/supabase/server";
import { ingestTranscriptEvent } from "@/lib/workflows/ingest-transcript-event";

const TranscriptIngestRequestSchema = z.object({
  sessionId: z.string().uuid(),
  event: z.unknown(),
});
const MAX_TRANSCRIPT_REQUEST_BYTES = 65_536;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyResult = await readBoundedJsonBody(req);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: "invalid_transcript_event" },
      {
        status:
          bodyResult.reason === "too_large"
            ? 413
            : bodyResult.reason === "unsupported_media_type"
              ? 415
              : 400,
      }
    );
  }
  const body = bodyResult.value;
  const parsed = TranscriptIngestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_transcript_event" },
      { status: 400 }
    );
  }

  try {
    const result = await ingestTranscriptEvent({
      requestSessionId: parsed.data.sessionId,
      userId: user.id,
      event: parsed.data.event,
      store: createDrizzleTranscriptIngestStore(),
    });

    if (!result.ok) {
      if (result.reason === "session_capacity_exceeded") {
        return NextResponse.json(
          { error: "transcript_session_capacity_exceeded" },
          { status: 429 }
        );
      }
      if (result.reason === "not_found") {
        return NextResponse.json(
          { error: "Session not found or access denied" },
          { status: 404 }
        );
      }
      if (
        result.reason === "event_conflict" ||
        result.reason === "writer_sequence_conflict" ||
        result.reason === "writer_order_conflict"
      ) {
        return NextResponse.json(
          { error: "transcript_event_identity_conflict" },
          { status: 409 }
        );
      }
      if (result.reason === "session_closed") {
        return NextResponse.json(
          { error: "transcript_session_closed" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "invalid_transcript_event" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      disposition: result.disposition,
      turn: result.turn,
    });
  } catch {
    console.error("[Transcript] Persistence failed", {
      code: "transcript_persistence_failed",
    });
    return NextResponse.json(
      { error: "Failed to save transcript" },
      { status: 500 }
    );
  }
}

async function readBoundedJsonBody(req: NextRequest): Promise<
  | { ok: true; value: unknown }
  | {
      ok: false;
      reason: "invalid" | "too_large" | "unsupported_media_type";
    }
> {
  const contentType = req.headers.get("content-type");
  if (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
  ) {
    return { ok: false, reason: "unsupported_media_type" };
  }
  const declaredLength = req.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      return { ok: false, reason: "invalid" };
    }
    if (parsedLength > MAX_TRANSCRIPT_REQUEST_BYTES) {
      return { ok: false, reason: "too_large" };
    }
  }
  if (!req.body) return { ok: false, reason: "invalid" };

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let raw = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > MAX_TRANSCRIPT_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
