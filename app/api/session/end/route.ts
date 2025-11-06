import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { endSession, isSessionOwnedByUser, getSessionById } from "@/lib/db/sessions";

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { sessionId } = body;

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

    // Check if session is already ended
    const session = await getSessionById(sessionId);
    if (session?.endedAt) {
      return NextResponse.json({
        success: true,
        session,
        message: "Session was already ended",
      });
    }

    // End the session
    const updatedSession = await endSession(sessionId);

    return NextResponse.json({
      success: true,
      session: updatedSession,
    });
  } catch (error) {
    console.error("Error ending session:", error);
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    );
  }
}
