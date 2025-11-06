import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSessions, getUserSessionsByRoundType } from "@/lib/db/sessions";

export async function GET(req: NextRequest) {
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

    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const roundType = searchParams.get("roundType");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    // Validate limit
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    // Get sessions
    let sessions;
    if (roundType) {
      // Validate roundType
      const validRoundTypes = [
        "behavioral",
        "product_sense",
        "execution",
        "strategy",
      ];
      if (!validRoundTypes.includes(roundType)) {
        return NextResponse.json(
          { error: "Invalid roundType" },
          { status: 400 }
        );
      }

      sessions = await getUserSessionsByRoundType(
        user.id,
        roundType as "behavioral" | "product_sense" | "execution" | "strategy",
        limit
      );
    } else {
      sessions = await getUserSessions(user.id, limit);
    }

    return NextResponse.json({
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}
