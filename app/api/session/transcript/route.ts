import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createTranscriptTurn, batchCreateTranscriptTurns } from "@/lib/db/transcripts";
import { isSessionOwnedByUser } from "@/lib/db/sessions";

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { sessionId, turns } = body;

    // Validate required fields
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Verify user owns the session
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 403 }
      );
    }

    // Handle batch or single turn
    if (Array.isArray(turns)) {
      // Batch insert for multiple turns
      const createdTurns = await batchCreateTranscriptTurns(
        turns.map((turn: any) => ({
          sessionId,
          speaker: turn.speaker,
          startedAt: turn.startedAt ? new Date(turn.startedAt) : undefined,
          endedAt: turn.endedAt ? new Date(turn.endedAt) : undefined,
          text: turn.text,
          audioMs: turn.audioMs,
          latencyMs: turn.latencyMs,
          section: turn.section,
        }))
      );

      return NextResponse.json({
        success: true,
        turns: createdTurns,
      });
    } else {
      // Single turn insert
      const { speaker, startedAt, endedAt, text, audioMs, latencyMs, section } = body;

      // Validate speaker
      if (!speaker || !["user", "interviewer"].includes(speaker)) {
        return NextResponse.json(
          { error: "Invalid speaker value" },
          { status: 400 }
        );
      }

      const turn = await createTranscriptTurn({
        sessionId,
        speaker,
        startedAt: startedAt ? new Date(startedAt) : undefined,
        endedAt: endedAt ? new Date(endedAt) : undefined,
        text,
        audioMs,
        latencyMs,
        section,
      });

      return NextResponse.json({
        success: true,
        turn,
      });
    }
  } catch (error) {
    console.error("Error saving transcript:", error);
    return NextResponse.json(
      { error: "Failed to save transcript" },
      { status: 500 }
    );
  }
}
