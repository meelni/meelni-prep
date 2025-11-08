/**
 * Manual Sync Endpoint: Sync Questions from Google Sheets
 * 
 * TEMPORARILY DISABLED: The syncQuestions function needs to be updated to return
 * a result object instead of void. This will be fixed in a future update.
 * 
 * Use the CLI script instead: npm run sync:questions
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { 
      success: false, 
      error: "Manual sync endpoint temporarily disabled. Use CLI script: npm run sync:questions" 
    },
    { status: 501 }
  );
}
