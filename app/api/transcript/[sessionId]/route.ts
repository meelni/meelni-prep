import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { transcriptTurn, interviewSession } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { sessionId } = await params;

    // Verify the session belongs to the user
    const session = await db.query.interviewSession.findFirst({
      where: and(
        eq(interviewSession.id, sessionId),
        eq(interviewSession.userId, user.id)
      ),
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Fetch transcript turns ordered by time
    const turns = await db.query.transcriptTurn.findMany({
      where: eq(transcriptTurn.sessionId, sessionId),
      orderBy: [
        asc(transcriptTurn.startedAt),
        asc(transcriptTurn.writerId),
        asc(transcriptTurn.sequence),
        asc(transcriptTurn.eventId),
        asc(transcriptTurn.id),
      ],
    });

    return NextResponse.json({ turns });
  } catch (error) {
    console.error("Error fetching transcript:", error);
    return NextResponse.json(
      { error: "Failed to fetch transcript" },
      { status: 500 }
    );
  }
}
