/**
 * API endpoint: POST /api/feedback/compare
 *
 * Returns detailed comparison data for two sessions
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionComparison } from "@/lib/db/queries/session-comparison";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { sessionId1, sessionId2 } = body;

    if (!sessionId1 || !sessionId2) {
      return NextResponse.json(
        { error: "Both sessionId1 and sessionId2 are required" },
        { status: 400 }
      );
    }

    // Fetch comparison data
    const comparisonData = await getSessionComparison(
      sessionId1,
      sessionId2,
      user.id
    );

    if (!comparisonData) {
      return NextResponse.json(
        { error: "Sessions not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ comparison: comparisonData });
  } catch (error) {
    console.error("[Feedback Comparison API] fetch_failed", {
      code: "feedback_comparison_fetch_failed",
      ...toSafeErrorLog(error),
    });
    return NextResponse.json(
      { error: "Failed to fetch comparison" },
      { status: 500 }
    );
  }
}
