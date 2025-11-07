/**
 * API endpoint: GET /api/feedback/[sessionId]/attempts
 *
 * Returns all session attempts for the same interview type
 * Used for comparison feature to show available attempts
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { interviewSession } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionsByInterviewType } from "@/lib/db/queries/session-comparison";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Authenticate user with Supabase
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch the session to get its round_type
    const sessions = await db
      .select({
        id: interviewSession.id,
        roundType: interviewSession.roundType,
        userId: interviewSession.userId,
      })
      .from(interviewSession)
      .where(eq(interviewSession.id, sessionId))
      .limit(1);

    if (sessions.length === 0) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const session = sessions[0];

    // Verify ownership
    if (session.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all attempts for this interview type
    const attempts = await getSessionsByInterviewType(
      user.id,
      session.roundType
    );

    return NextResponse.json({
      attempts,
      roundType: session.roundType,
    });
  } catch (error) {
    console.error("Error fetching session attempts:", error);
    return NextResponse.json(
      { error: "Failed to fetch attempts" },
      { status: 500 }
    );
  }
}
