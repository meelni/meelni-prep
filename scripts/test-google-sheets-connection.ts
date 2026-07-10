import { config } from "dotenv";
import { fetchSheetViaAPI } from "@/lib/google-sheets-api";
import { fetchSheetAsCSV } from "@/lib/google-sheets-client";

config({ path: process.env.MEELNI_ENV_FILE || ".env.local", quiet: true });

async function testConnection(): Promise<void> {
  const csvUrl = process.env.GOOGLE_SHEET_CSV_URL;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || "Sheet1";

  try {
    const rows = csvUrl
      ? await fetchSheetAsCSV(csvUrl)
      : sheetId
        ? await fetchSheetViaAPI(sheetId, sheetName)
        : null;

    if (!rows) {
      console.error("Google Sheets source is not configured.");
      process.exitCode = 1;
      return;
    }

    console.info(
      "question_sync_source_check",
      JSON.stringify({ outcome: "available", rows: rows.length })
    );
  } catch {
    console.error(
      "question_sync_source_check",
      JSON.stringify({ outcome: "unavailable" })
    );
    process.exitCode = 1;
  }
}

testConnection().catch(() => {
  console.error(
    "question_sync_source_check",
    JSON.stringify({ outcome: "unavailable" })
  );
  process.exitCode = 1;
});
