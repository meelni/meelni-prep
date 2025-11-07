/**
 * Vercel Cron Job Endpoint: Sync Questions from Google Sheets
 *
 * This endpoint is called automatically by Vercel Cron on a schedule.
 * It syncs interview questions from a Google Sheet to the database.
 *
 * Schedule: Weekly on Mondays at 9:00 AM UTC (configured in vercel.json)
 *
 * Security: Protected by CRON_SECRET environment variable.
 * Only requests with valid Authorization header can trigger the sync.
 */

import { NextRequest, NextResponse } from "next/server";
import { syncQuestionsFromSheet } from "@/scripts/sync-questions-from-sheet";

/**
 * GET handler for Vercel Cron
 *
 * Vercel Cron sends requests with:
 * - Authorization: Bearer <CRON_SECRET>
 * - User-Agent: vercel-cron/1.0
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  console.log("🔔 Cron job triggered:", {
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get("user-agent"),
    url: request.url,
  });

  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("❌ CRON_SECRET environment variable not set");
    return NextResponse.json(
      {
        success: false,
        error: "Server configuration error: CRON_SECRET not set",
      },
      { status: 500 }
    );
  }

  const expectedAuth = `Bearer ${cronSecret}`;

  if (authHeader !== expectedAuth) {
    console.error("❌ Unauthorized cron request:", {
      receivedAuth: authHeader ? "Bearer [REDACTED]" : "none",
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized: Invalid cron secret",
      },
      { status: 401 }
    );
  }

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

  try {
    console.log("✅ Authorization verified. Starting sync...");

    // Run the sync
    const result = await syncQuestionsFromSheet();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✨ Cron job completed in ${duration}s:`, {
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
        cronJobDuration: `${duration}s`,
        triggeredBy: "vercel-cron",
        triggeredAt: new Date().toISOString(),
      },
      { status: result.success ? 200 : 500 }
    );
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`❌ Cron job failed after ${duration}s:`, error);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        questionsAdded: 0,
        questionsUpdated: 0,
        questionsDeactivated: 0,
        totalProcessed: 0,
        errors: [errorMessage],
        cronJobDuration: `${duration}s`,
        triggeredBy: "vercel-cron",
        triggeredAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Explicitly disable other HTTP methods
 */
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed. Use GET request." },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: "Method not allowed. Use GET request." },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Method not allowed. Use GET request." },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Method not allowed. Use GET request." },
    { status: 405 }
  );
}
