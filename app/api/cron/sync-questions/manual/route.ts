/**
 * Manual Trigger Endpoint: Sync Questions from Google Sheets
 *
 * This endpoint allows authenticated admin users to manually trigger
 * the Google Sheets sync without waiting for the scheduled cron job.
 *
 * Useful for:
 * - Testing the sync functionality
 * - Immediate updates after sheet changes
 * - Debugging sync issues
 *
 * Security: Requires valid Supabase authentication.
 * TODO: Add admin role check when role-based access is implemented.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncQuestionsFromSheet } from "@/scripts/sync-questions-from-sheet";

/**
 * POST handler for manual sync trigger
 *
 * Requires authentication via Supabase session.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  console.log("🔧 Manual sync triggered:", {
    timestamp: new Date().toISOString(),
    url: request.url,
  });

  try {
    // Verify authentication
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session) {
      console.error("❌ Unauthorized manual sync attempt");
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Please sign in to trigger manual sync",
        },
        { status: 401 }
      );
    }

    const userEmail = session.user.email;
    console.log(`✅ Manual sync authorized for user: ${userEmail}`);

    // TODO: Add admin role check here when RBAC is implemented
    // For now, any authenticated user can trigger manual sync
    // Future: Check if user has 'admin' role in database

    // Verify required Google Sheets credentials are present
    if (!process.env.GOOGLE_SHEETS_CREDENTIALS) {
      console.error("❌ GOOGLE_SHEETS_CREDENTIALS not set");
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration error: Google Sheets credentials not configured",
        },
        { status: 500 }
      );
    }

    if (!process.env.GOOGLE_SHEET_ID) {
      console.error("❌ GOOGLE_SHEET_ID not set");
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration error: Google Sheet ID not configured",
        },
        { status: 500 }
      );
    }

    // Run the sync
    const result = await syncQuestionsFromSheet();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✨ Manual sync completed in ${duration}s:`, {
      triggeredBy: userEmail,
      success: result.success,
      questionsAdded: result.questionsAdded,
      questionsUpdated: result.questionsUpdated,
      questionsDeactivated: result.questionsDeactivated,
      totalProcessed: result.totalProcessed,
      errors: result.errors,
    });

    // Return detailed result
    return NextResponse.json(
      {
        ...result,
        syncDuration: `${duration}s`,
        triggeredBy: "manual",
        triggeredByUser: userEmail,
        triggeredAt: new Date().toISOString(),
      },
      { status: result.success ? 200 : 500 }
    );
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`❌ Manual sync failed after ${duration}s:`, error);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        questionsAdded: 0,
        questionsUpdated: 0,
        questionsDeactivated: 0,
        totalProcessed: 0,
        errors: [errorMessage],
        syncDuration: `${duration}s`,
        triggeredBy: "manual",
        triggeredAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler - provides sync status and instructions
 */
export async function GET() {
  return NextResponse.json({
    message: "Manual sync endpoint",
    usage: "Send POST request to trigger sync",
    note: "Requires authentication",
    example: `curl -X POST ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/cron/sync-questions/manual -H "Cookie: sb-access-token=..."`,
  });
}

/**
 * Explicitly disable other HTTP methods
 */
export async function PUT() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST request to trigger sync." },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST request to trigger sync." },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST request to trigger sync." },
    { status: 405 }
  );
}
