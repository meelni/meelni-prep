/**
 * Manual Sync Endpoint: Sync Questions from Google Sheets
 *
 * Allows authenticated admins to manually trigger a question sync.
 * Useful for testing or syncing outside the regular Monday schedule.
 *
 * Security: Requires valid Supabase session (authenticated user)
 * Note: In the future, this should be restricted to admin users only
 */

import { NextResponse } from "next/server";
import { syncQuestions } from "@/scripts/sync-questions-from-sheet";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300; // 5 minutes timeout for Pro tier

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session) {
      console.error("❌ Unauthorized: No valid session");
      return NextResponse.json(
        { success: false, error: "Unauthorized: Authentication required" },
        { status: 401 }
      );
    }

    // TODO: Add admin role check when RBAC is implemented
    // For now, any authenticated user can trigger sync

    console.log(`🔄 Manual sync triggered by user: ${session.user.email}`);

    // Parse options from request body if provided
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const verbose = body.verbose === true;

    // Run the sync
    const result = await syncQuestions({
      dryRun,
      verbose,
    });

    if (!result.success) {
      console.error("❌ Manual sync failed:", result.errorMessages);
      return NextResponse.json(
        {
          ...result,
          triggeredBy: "manual",
          triggeredByUser: session.user.email,
          triggeredAt: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    console.log(
      `✅ Manual sync complete: ${result.questionsAdded} added, ${result.questionsDeactivated} deactivated`
    );

    return NextResponse.json({
      ...result,
      triggeredBy: "manual",
      triggeredByUser: session.user.email,
      triggeredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Manual sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Sync failed",
        message: error instanceof Error ? error.message : "Unknown error",
        triggeredBy: "manual",
        triggeredAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
