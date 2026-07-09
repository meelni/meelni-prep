/**
 * Vercel Cron Job Endpoint: Sync Questions from Google Sheets
 *
 * This endpoint is automatically called by Vercel Cron every Monday at 9:00 AM UTC.
 * Schedule configured in vercel.json: "0 9 * * 1"
 *
 * Security: Protected by CRON_SECRET environment variable
 */

import { NextResponse } from "next/server";
import { syncQuestions } from "@/scripts/sync-questions-from-sheet";

export const maxDuration = 300; // 5 minutes timeout for Pro tier

export async function GET(request: Request) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error("❌ Unauthorized: Invalid cron secret");
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid cron secret" },
        { status: 401 }
      );
    }

    console.log("🔄 Cron job triggered: Starting question sync...");

    // Run the sync
    const result = await syncQuestions({
      dryRun: false,
      verbose: false,
    });

    if (!result.success) {
      console.error("❌ Cron sync failed:", result.errorMessages);
      return NextResponse.json(
        {
          ...result,
          triggeredBy: "cron",
          triggeredAt: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    console.log(
      `✅ Cron sync complete: ${result.questionsAdded} added, ${result.questionsDeactivated} deactivated`
    );

    return NextResponse.json({
      ...result,
      triggeredBy: "cron",
      triggeredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Cron sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Sync failed",
        message: error instanceof Error ? error.message : "Unknown error",
        triggeredBy: "cron",
        triggeredAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
