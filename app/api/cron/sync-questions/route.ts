/**
 * Vercel Cron Job Endpoint: Sync Questions from Google Sheets
 * 
 * TEMPORARILY DISABLED: The syncQuestions function needs to be updated to return
 * a result object instead of void. This will be fixed in a future update.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { 
      success: false, 
      error: "Cron sync endpoint temporarily disabled. Use manual sync script instead." 
    },
    { status: 501 }
  );
}
