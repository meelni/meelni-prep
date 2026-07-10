import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createDrizzleTranscriptIngestStore } from "@/lib/db/transcripts";
import { createClient } from "@/lib/supabase/server";
import { ingestTranscriptEvent } from "@/lib/workflows/ingest-transcript-event";

const TranscriptIngestRequestSchema = z.object({
  sessionId: z.string().uuid(),
  event: z.unknown(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
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
        result.reason === "writer_order_conflict" ||
        result.reason === "session_closed"
      ) {
        return NextResponse.json(
          { error: "transcript_event_identity_conflict" },
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
  } catch (error) {
    console.error("Error saving transcript event:", error);
    return NextResponse.json(
      { error: "Failed to save transcript" },
      { status: 500 }
    );
  }
}
