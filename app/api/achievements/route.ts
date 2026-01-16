/**
 * User Achievements API
 *
 * Provides user's achievement status including earned and locked badges.
 *
 * @route GET /api/achievements
 * @access Protected (requires Supabase authentication)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserAchievements } from "@/lib/achievements";

export async function GET() {
  try {
    // Authenticate user with Supabase
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized: User not authenticated" },
        { status: 401 }
      );
    }

    // Fetch user achievements with earned status
    const achievements = await getUserAchievements(user.id);

    return NextResponse.json(
      {
        achievements,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching user achievements:", error);
    return NextResponse.json(
      { error: "Internal server error: Failed to fetch achievements" },
      { status: 500 }
    );
  }
}
