import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionTranscript } from "@/lib/db/transcripts";
import { isSessionOwnedByUser } from "@/lib/db/sessions";

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
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

    const { sessionId } = params;

    // Verify user owns the session
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 403 }
      );
    }

    // Get transcript
    const turns = await getSessionTranscript(sessionId);

    return NextResponse.json({ turns });
  } catch (error) {
    console.error("Error fetching transcript:", error);
    return NextResponse.json(
      { error: "Failed to fetch transcript" },
      { status: 500 }
    );
  }
}
