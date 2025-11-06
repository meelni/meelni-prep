import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isSessionOwnedByUser } from "@/lib/db/sessions";
import { getFeedbackBySessionId } from "@/lib/db/feedback";

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

    // Get feedback
    const feedback = await getFeedbackBySessionId(sessionId);

    if (!feedback) {
      return NextResponse.json(
        { error: "Feedback not found for this session" },
        { status: 404 }
      );
    }

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}
