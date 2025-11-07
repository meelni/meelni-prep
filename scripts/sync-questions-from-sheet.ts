/**
 * Sync Interview Questions from Google Sheet
 *
 * This script syncs PM interview questions from a Google Sheet to the database.
 * It supports two methods:
 * - Method A: Fetch from public CSV URL (recommended, simpler)
 * - Method B: Use Google Sheets API (requires API key)
 *
 * Usage:
 *   npm run sync:questions              # Sync questions
 *   npm run sync:questions -- --dry-run # Preview changes without applying
 *   npm run sync:questions -- --verbose # Show detailed logs
 *
 * Environment variables required:
 *   GOOGLE_SHEET_CSV_URL  (Method A - recommended)
 *   or
 *   GOOGLE_SHEETS_API_KEY + GOOGLE_SHEET_ID (Method B)
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { db } from "@/lib/db";
import { interviewQuestion } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { fetchSheetAsCSV, fetchSheetViaAPI, validateSheetRow, type SheetRow } from "@/lib/google-sheets-client";

// Question type mapping from Google Sheet to database
const QUESTION_TYPE_MAPPING: Record<string, string> = {
  "A/B Testing": "A/B Testing",
  "Product design / strategy": "Product design/strategy",
  "Product design/strategy": "Product design/strategy",
  "Behavioral": "Behavioral",
  "Execution": "Execution",
  "Product Sense": "Product Sense",
  "Pricing": "Pricing",
  "Estimation": "Estimation",
  "Product Strategy": "Product Strategy",
};

// Valid question types in our database
const VALID_QUESTION_TYPES = new Set([
  "A/B Testing",
  "Product design/strategy",
  "Behavioral",
  "Execution",
  "Product Sense",
  "Pricing",
  "Estimation",
  "Product Strategy",
]);

interface SyncStats {
  newQuestions: number;
  updatedQuestions: number;
  deactivatedQuestions: number;
  skippedQuestions: number;
  errors: number;
}

interface SyncOptions {
  dryRun: boolean;
  verbose: boolean;
}

/**
 * Main sync function
 */
async function syncQuestions(options: SyncOptions): Promise<void> {
  console.log("\n🔄 Starting question sync from Google Sheet...");
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}\n`);

  const stats: SyncStats = {
    newQuestions: 0,
    updatedQuestions: 0,
    deactivatedQuestions: 0,
    skippedQuestions: 0,
    errors: 0,
  };

  try {
    // Step 1: Fetch data from Google Sheet
    const sheetRows = await fetchSheetData();

    if (sheetRows.length === 0) {
      console.log("⚠️  No questions found in sheet");
      return;
    }

    console.log(`📋 Found ${sheetRows.length} questions in sheet\n`);

    // Step 2: Process each question
    const validQuestions: ProcessedQuestion[] = [];

    for (const row of sheetRows) {
      const result = await processSheetRow(row, options);

      if (result.valid) {
        validQuestions.push(result.question!);
      } else {
        stats.skippedQuestions++;
        if (options.verbose) {
          console.log(`⏭️  Skipped: ${result.reason}`);
        }
      }
    }

    console.log(`\n✅ Validated ${validQuestions.length} questions`);
    console.log(`⏭️  Skipped ${stats.skippedQuestions} questions\n`);

    // Step 3: Get existing questions from database
    const existingQuestions = await getExistingQuestions();
    const existingQuestionTexts = new Set(existingQuestions.map(q => normalizeText(q.questionText)));

    console.log(`💾 Found ${existingQuestions.length} existing questions in database\n`);

    // Step 4: Determine new, updated, and deactivated questions
    const newQuestions: ProcessedQuestion[] = [];
    const sheetQuestionTexts = new Set<string>();

    for (const question of validQuestions) {
      const normalizedText = normalizeText(question.questionText);
      sheetQuestionTexts.add(normalizedText);

      if (!existingQuestionTexts.has(normalizedText)) {
        newQuestions.push(question);
      }
      // Note: We don't update existing questions to preserve any manual edits
    }

    // Questions in DB but not in sheet should be deactivated
    const questionsToDeactivate = existingQuestions.filter(
      q => q.isActive && !sheetQuestionTexts.has(normalizeText(q.questionText))
    );

    // Step 5: Apply changes (or preview if dry run)
    if (options.dryRun) {
      console.log("🔍 DRY RUN - Preview of changes:\n");
      previewChanges(newQuestions, questionsToDeactivate);
    } else {
      await applyChanges(newQuestions, questionsToDeactivate, stats, options);
    }

    // Step 6: Print summary
    printSummary(stats, options.dryRun);

  } catch (error) {
    console.error("\n❌ Sync failed:", error);
    process.exit(1);
  }
}

interface ProcessedQuestion {
  company: string | null;
  questionText: string;
  questionType: string;
  askedAt: Date | null;
}

/**
 * Fetch data from Google Sheet using configured method
 */
async function fetchSheetData(): Promise<SheetRow[]> {
  const csvUrl = process.env.GOOGLE_SHEET_CSV_URL;
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

  if (csvUrl) {
    console.log("📡 Using Method A: Fetching from CSV URL");
    return await fetchSheetAsCSV(csvUrl);
  } else if (apiKey && sheetId) {
    console.log("📡 Using Method B: Fetching via Google Sheets API");
    return await fetchSheetViaAPI(sheetId, `${sheetName}!A1:G1000`);
  } else {
    throw new Error(
      "Missing environment variables. Set either:\n" +
      "  - GOOGLE_SHEET_CSV_URL (Method A - recommended)\n" +
      "  or\n" +
      "  - GOOGLE_SHEETS_API_KEY + GOOGLE_SHEET_ID (Method B)"
    );
  }
}

/**
 * Process a single sheet row into a database-ready question
 */
function processSheetRow(
  row: SheetRow,
  options: SyncOptions
): { valid: boolean; question?: ProcessedQuestion; reason?: string } {
  // Validate required fields
  const validation = validateSheetRow(row);
  if (!validation.valid) {
    return { valid: false, reason: validation.error };
  }

  // Map question type
  const mappedType = QUESTION_TYPE_MAPPING[row.questionType.trim()];
  if (!mappedType) {
    return {
      valid: false,
      reason: `Unknown question type: "${row.questionType}"`
    };
  }

  if (!VALID_QUESTION_TYPES.has(mappedType)) {
    return {
      valid: false,
      reason: `Invalid question type: "${mappedType}"`
    };
  }

  // Clean company name (null if empty)
  const company = row.company && row.company.trim().length > 0
    ? row.company.trim()
    : null;

  // Clean question text
  const questionText = row.questionText.trim();

  if (questionText.length === 0) {
    return { valid: false, reason: "Empty question text" };
  }

  // Parse timestamp (when question was asked in real interview)
  let askedAt: Date | null = null;
  if (row.timestamp && row.timestamp.trim().length > 0) {
    try {
      const parsed = new Date(row.timestamp.trim());
      if (!isNaN(parsed.getTime())) {
        askedAt = parsed;
      }
    } catch (e) {
      // Invalid date format, keep as null
    }
  }

  return {
    valid: true,
    question: {
      company,
      questionText,
      questionType: mappedType,
      askedAt,
    }
  };
}

/**
 * Get all existing questions from database
 */
async function getExistingQuestions() {
  return await db
    .select({
      id: interviewQuestion.id,
      company: interviewQuestion.company,
      questionText: interviewQuestion.questionText,
      questionType: interviewQuestion.questionType,
      askedAt: interviewQuestion.askedAt,
      isActive: interviewQuestion.isActive,
    })
    .from(interviewQuestion);
}

/**
 * Normalize text for comparison (lowercase, trim, remove extra whitespace)
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Preview changes without applying them
 */
function previewChanges(
  newQuestions: ProcessedQuestion[],
  questionsToDeactivate: Array<{ id: string; questionText: string }>
) {
  if (newQuestions.length > 0) {
    console.log(`➕ Would add ${newQuestions.length} new questions:`);
    newQuestions.slice(0, 5).forEach(q => {
      console.log(`   • [${q.questionType}] ${q.questionText.substring(0, 70)}...`);
    });
    if (newQuestions.length > 5) {
      console.log(`   ... and ${newQuestions.length - 5} more`);
    }
    console.log();
  }

  if (questionsToDeactivate.length > 0) {
    console.log(`🔒 Would deactivate ${questionsToDeactivate.length} questions:`);
    questionsToDeactivate.slice(0, 5).forEach(q => {
      console.log(`   • ${q.questionText.substring(0, 70)}...`);
    });
    if (questionsToDeactivate.length > 5) {
      console.log(`   ... and ${questionsToDeactivate.length - 5} more`);
    }
    console.log();
  }

  if (newQuestions.length === 0 && questionsToDeactivate.length === 0) {
    console.log("✨ No changes needed - database is already in sync with sheet\n");
  }
}

/**
 * Apply changes to database
 */
async function applyChanges(
  newQuestions: ProcessedQuestion[],
  questionsToDeactivate: Array<{ id: string; questionText: string }>,
  stats: SyncStats,
  options: SyncOptions
) {
  // Insert new questions
  if (newQuestions.length > 0) {
    console.log(`➕ Adding ${newQuestions.length} new questions...`);

    for (const question of newQuestions) {
      try {
        await db.insert(interviewQuestion).values({
          company: question.company,
          questionText: question.questionText,
          questionType: question.questionType,
          askedAt: question.askedAt,
          isActive: true,
        });

        stats.newQuestions++;

        if (options.verbose) {
          console.log(`   ✓ Added: [${question.questionType}] ${question.questionText.substring(0, 60)}...`);
        }
      } catch (error) {
        stats.errors++;
        console.error(`   ✗ Error adding question: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  // Deactivate removed questions
  if (questionsToDeactivate.length > 0) {
    console.log(`\n🔒 Deactivating ${questionsToDeactivate.length} questions...`);

    for (const question of questionsToDeactivate) {
      try {
        await db
          .update(interviewQuestion)
          .set({ isActive: false })
          .where(eq(interviewQuestion.id, question.id));

        stats.deactivatedQuestions++;

        if (options.verbose) {
          console.log(`   ✓ Deactivated: ${question.questionText.substring(0, 60)}...`);
        }
      } catch (error) {
        stats.errors++;
        console.error(`   ✗ Error deactivating question: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  if (newQuestions.length === 0 && questionsToDeactivate.length === 0) {
    console.log("✨ No changes needed - database is already in sync with sheet");
  }
}

/**
 * Print sync summary
 */
function printSummary(stats: SyncStats, isDryRun: boolean) {
  console.log("\n" + "─".repeat(50));
  console.log(`📊 Sync ${isDryRun ? 'Preview' : 'Complete'}\n`);
  console.log(`   New questions:         ${stats.newQuestions}`);
  console.log(`   Updated questions:     ${stats.updatedQuestions}`);
  console.log(`   Deactivated questions: ${stats.deactivatedQuestions}`);
  console.log(`   Skipped questions:     ${stats.skippedQuestions}`);
  console.log(`   Errors:                ${stats.errors}`);
  console.log("─".repeat(50) + "\n");

  if (isDryRun) {
    console.log("💡 Run without --dry-run to apply these changes\n");
  } else if (stats.errors > 0) {
    console.log("⚠️  Some errors occurred during sync. Check logs above.\n");
  } else {
    console.log("✅ All changes applied successfully!\n");
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);

  return {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs();

  try {
    await syncQuestions(options);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { syncQuestions };
