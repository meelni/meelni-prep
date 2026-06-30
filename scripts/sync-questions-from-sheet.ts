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
import { config } from "dotenv";
import { resolve } from "path";
const envFile = process.env.MEELNI_ENV_FILE || ".env.local";
config({ path: resolve(process.cwd(), envFile) });

import { interviewQuestion } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import {
  fetchSheetAsCSV,
  validateSheetRow,
  type SheetRow,
} from "@/lib/google-sheets-client";
import { fetchSheetViaAPI } from "@/lib/google-sheets-api";

// Question type mapping from Google Sheet to database
// Maps various input formats to canonical database types
const QUESTION_TYPE_MAPPING: Record<string, string> = {
  // A/B Testing
  "A/B Testing": "A/B Testing",
  "ab testing": "A/B Testing",
  "a/b testing": "A/B Testing",

  // Product design/strategy
  "Product design / strategy": "Product design/strategy",
  "Product design/strategy": "Product design/strategy",
  "Product Design": "Product design/strategy",
  "Product design": "Product design/strategy",
  "Product Design/Strategy": "Product design/strategy",
  "Product Design and Strategy": "Product design/strategy",
  "Product Design & Strategy": "Product design/strategy",
  Design: "Product design/strategy",
  design: "Product design/strategy",
  "Design & Strategy": "Product design/strategy",
  "Strategy/Design": "Product design/strategy",
  "strategy + design": "Product design/strategy",
  "strategy + product design": "Product design/strategy",

  // Behavioral
  Behavioral: "Behavioral",
  behavioral: "Behavioral",
  Behavioural: "Behavioral",
  Behavior: "Behavioral",
  behavior: "Behavioral",
  Behav: "Behavioral",
  "Leadership & Drive": "Behavioral",
  "Leadership and Drive": "Behavioral",
  Leadership: "Behavioral",
  "L&D": "Behavioral",

  // Execution
  Execution: "Execution",
  execution: "Execution",
  "Product Execution": "Execution",
  "Product execution": "Execution",
  "Craft & Execution": "Execution",
  "Craft and Execution": "Execution",
  "Craft and Exec": "Execution",
  "Execute with Judgement": "Execution",

  // Product Sense
  "Product Sense": "Product Sense",
  "Product sense": "Product Sense",
  "product sense": "Product Sense",
  "Produce Sense": "Product Sense",
  Sense: "Product Sense",
  Product: "Product Sense",
  product: "Product Sense",
  "Product Insights": "Product Sense",
  "Product Thinking": "Product Sense",

  // Pricing
  Pricing: "Pricing",
  pricing: "Pricing",

  // Estimation
  Estimation: "Estimation",
  estimation: "Estimation",

  // Product Strategy
  "Product Strategy": "Product Strategy",
  "Product strategy": "Product Strategy",
  "product strategy": "Product Strategy",
  Strategy: "Product Strategy",
  strategy: "Product Strategy",
  "Strategic insights": "Product Strategy",

  // Analytical/Analytics (map to Execution for now)
  "Analytical Thinking": "Execution",
  "Analytical thinking": "Execution",
  "analytical thinking": "Execution",
  Analytical: "Execution",
  analytical: "Execution",
  Analytics: "Execution",
  analytics: "Execution",
  "Product Analytics": "Execution",
  "Product analytics": "Execution",
  "Product Analysis": "Execution",
  Metrics: "Execution",
  "Analytical Execution": "Execution",
  "Analytical/Execution": "Execution",
  "Analytical / Execution": "Execution",

  // Product Prioritization (map to Execution)
  "Product Prioritization": "Execution",
  "Product prioritization": "Execution",
  "Product Priortization": "Execution",

  // System Design / Technical (map to Product design/strategy)
  "System Design": "Product design/strategy",
  "System design": "Product design/strategy",
  Technical: "Product design/strategy",
  technical: "Product design/strategy",

  // Various product-related categories (map to Product Sense)
  "Product Improvement": "Product Sense",
  "Product Values": "Product Sense",
  "Product Retrospective": "Product Sense",
  "Product Metrics": "Product Sense",
  "Product Launch": "Product Sense",
  "Product Analytical": "Product Sense",
  "Product Prioritisation": "Execution",

  // Compound types (map to primary category)
  "Product/Strategy": "Product Strategy",
  "Product, Strategy": "Product Strategy",
  "Strategy, Product Sense": "Product Strategy",
  "Product Strategy and Design": "Product design/strategy",
  "Product strategy and design": "Product design/strategy",
  "Product Insights / Strategy": "Product Strategy",
  "Product Strategy/Execution": "Product Strategy",
  "Strategy/Estimation": "Product Strategy",
  "Execution, Tradeoff": "Execution",
  "Analytical Thinking / Product Execution": "Execution",
  "Analytical Thinking / Binary Tradeoff": "Execution",
  "Analytics / Execution": "Execution",

  // Googleyness/Culture fit (map to Behavioral)
  Googleyness: "Behavioral",
  Googlines: "Behavioral",
  "GCA, RRK": "Behavioral",

  // GTM/Strategy (map to Product Strategy)
  GTM: "Product Strategy",
  Roadmap: "Product Strategy",

  // Market Research (map to Product Sense)
  "Market Research": "Product Sense",

  // Various/All/Traditional (map to Product Sense as default)
  Various: "Product Sense",
  various: "Product Sense",
  All: "Product Sense",
  Traditional: "Product Sense",
  "Past Experience and": "Behavioral",
  "-": "Product Sense",

  // More variations with spaces/typos
  "Product design ": "Product design/strategy",
  "Product ": "Product Sense",
  "Analytics ": "Execution",
  "analytics ": "Execution",
  "Analytical ": "Execution",
  "analytical ": "Execution",
  "Strategy ": "Product Strategy",
  "strategy ": "Product Strategy",
  "Execution ": "Execution",
  "execution ": "Execution",
  sense: "Product Sense",
  "sense ": "Product Sense",
  "Sense ": "Product Sense",
  "Product sense ": "Product Sense",
  "Product Sense. ": "Product Sense",
  "Design ": "Product design/strategy",
  "design ": "Product design/strategy",

  // Typos and misspellings
  Startegy: "Product Strategy",
  startegy: "Product Strategy",
  Stategy: "Product Strategy",
  Straegy: "Product Strategy",
  Stratigic: "Product Strategy",
  "Prodcut Strategy": "Product Strategy",
  "Product Startegy": "Product Strategy",
  "Produce Execution": "Execution",
  "Product Executio": "Execution",
  "Product Exectuion": "Execution",
  exection: "Execution",
  excution: "Execution",
  "Produce Design": "Product design/strategy",
  "Prouct design": "Product design/strategy",
  behavorial: "Behavioral",
  Behaviorial: "Behavioral",
  Beehavioral: "Behavioral",
  Behaviour: "Behavioral",
  "behavior ": "Behavioral",
  behaviour: "Behavioral",
  Analytic: "Execution",
  Analitical: "Execution",
  Analutical: "Execution",
  "Analytican Thinking": "Execution",
  "Analytical Thnking": "Execution",

  // More compound types
  "Product Sense + Execution": "Execution",
  "Product Sense/Execution": "Execution",
  "Product Sense/Strategy": "Product Strategy",
  "Product Sense/Design": "Product design/strategy",
  "Product Sense and Strategy": "Product Strategy",
  "product sense, execution": "Execution",
  "Product design, execution": "Execution",
  "product design, execution ": "Execution",
  "Strategy and Design": "Product design/strategy",
  "Strategy + design": "Product design/strategy",
  "Strategy & product sense": "Product Strategy",
  "Product and Strategy": "Product Strategy",
  "Product + Strategy": "Product Strategy",
  "Product & Strategy": "Product Strategy",
  "Product & Strategy both": "Product Strategy",
  "strategy / behavioral": "Product Strategy",

  // Additional mappings for common variations
  "Product Prioritization/Sense": "Execution",
  "product prioritization": "Execution",
  Prioritization: "Execution",
  "craft & execution": "Execution",
  "craft and execution": "Execution",
  "Problem space understanding": "Product Sense",
  "product analytics": "Execution",
  "Prod Analytics": "Execution",
  "Prod Analytics ": "Execution",
  "Product Insights, Strategic Insights": "Product Strategy",
  "Product Insights, Strategic Insights ": "Product Strategy",
  "Strategic Insights": "Product Strategy",
  test: "Product Sense",
  "analytics/execution ": "Execution",

  // Estimation combinations
  "Strategy, Estimation": "Product Strategy",
  "Strategy, Estimation, Pricing": "Product Strategy",
  "Product, Estimation": "Estimation",
  "Product + Estimation": "Estimation",

  // Leadership/Behavioral variations
  "Leadership and drive": "Behavioral",
  "Leadership & drive": "Behavioral",
  "Leadership + Drive": "Behavioral",
  "Leadership, Behavioral": "Behavioral",
  "Leadership/Behavioral": "Behavioral",
  "Behavioural - AZ LP": "Behavioral",

  // System Design variations
  "System Design (PM)": "Product design/strategy",
  "System Design (PM interview)": "Product design/strategy",
  "Pseudo system design": "Product design/strategy",

  // Product Insights variations
  "Product insight": "Product Sense",
  "Product Insights, Product Sense": "Product Sense",
  "Product Insight/Vision": "Product Sense",
  "Product Insight/Design": "Product design/strategy",

  // Other specific cases
  "Customer pain point": "Product Sense",
  "Problem solving": "Product Sense",
  "Root cause analysis": "Execution",
  "RCA / Execution": "Execution",
  Troubleshooting: "Execution",
  NA: "Product Sense",
  "Feature Design": "Product design/strategy",
  "New Product Launch": "Product Sense",
  "Product Development Life Cycle": "Product Sense",
  "product design": "Product design/strategy",
  "Product Strategy (Mission Driven, Ecosystem Thinking)": "Product Strategy",
  "Product Design, Execution, Tradeoff": "Product design/strategy",
  "Product Design (Technical)": "Product design/strategy",
  "Data orientation": "Execution",
  "Data orientation ": "Execution",
  "Leadership/ behavioral": "Behavioral",
  "Leadership/ behavioral ": "Behavioral",
  "Design, Strategy": "Product design/strategy",
  "Behavioral + Product Sense": "Behavioral",
  "Product Roadmap and Prioritisation": "Execution",
  Engineering: "Product design/strategy",
  "Engineering ": "Product design/strategy",
  "Analytics + Strategy": "Execution",
  "Designing products and compatible products": "Product design/strategy",
  "Estimation, Design, Metrics": "Estimation",
  "Program Management": "Execution",
  "Program Management ": "Execution",
  "Execution, Statistics": "Execution",
  "Analytics/Stratergy": "Execution",
  "Product- technical": "Product design/strategy",
  "Design, Product Roadmap": "Product design/strategy",
  "Product Design, Improvement, Estimation": "Product design/strategy",
  "Product Strategy, sense, and design": "Product Strategy",
  "Product Strategy, sense, and design ": "Product Strategy",
  "Product Execution and Metrics and Hypothetical Question Evaluation":
    "Execution",
  "Execution and metrics": "Execution",
  "Execution and metrics ": "Execution",
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

function mapQuestionType(rawQuestionType: string): string | null {
  const trimmed = rawQuestionType.trim();
  const mapped = QUESTION_TYPE_MAPPING[trimmed];
  if (mapped) {
    return mapped;
  }

  const normalized = trimmed.toLowerCase();

  if (
    normalized.includes("behavior") ||
    normalized.includes("behaviour") ||
    normalized.includes("leadership") ||
    normalized.includes("googleyness") ||
    normalized.includes("collaboration") ||
    normalized.includes("stakeholder") ||
    normalized.includes("culture fit")
  ) {
    return "Behavioral";
  }

  if (
    normalized.includes("a/b") ||
    normalized.includes("ab test") ||
    normalized.includes("experiment")
  ) {
    return "A/B Testing";
  }

  if (normalized.includes("pricing") || normalized.includes("monetiz")) {
    return "Pricing";
  }

  if (
    normalized.includes("estimat") ||
    normalized.includes("guesstimate") ||
    normalized.includes("market sizing")
  ) {
    return "Estimation";
  }

  if (
    normalized.includes("execution") ||
    normalized.includes("analyt") ||
    normalized.includes("metric") ||
    normalized.includes("priorit") ||
    normalized.includes("rca") ||
    normalized.includes("root cause") ||
    normalized.includes("success metric") ||
    normalized.includes("tradeoff") ||
    normalized.includes("trade-off") ||
    normalized.includes("craft")
  ) {
    return "Execution";
  }

  if (
    normalized.includes("strategy") ||
    normalized.includes("strategic") ||
    normalized.includes("vision") ||
    normalized.includes("growth") ||
    normalized.includes("go to market") ||
    normalized.includes("gtm") ||
    normalized.includes("roadmap") ||
    normalized.includes("business case")
  ) {
    return "Product Strategy";
  }

  if (
    normalized.includes("design") ||
    normalized.includes("technical") ||
    normalized.includes("system")
  ) {
    return "Product design/strategy";
  }

  if (
    normalized.includes("product") ||
    normalized.includes("insight") ||
    normalized.includes("sense") ||
    normalized.includes("problem space") ||
    normalized.includes("customer pain")
  ) {
    return "Product Sense";
  }

  return null;
}

interface SyncStats {
  newQuestions: number;
  updatedQuestions: number;
  deactivatedQuestions: number;
  skippedQuestions: number;
  errors: number;
  skipReasons: Map<string, number>;
}

interface SyncOptions {
  dryRun: boolean;
  verbose: boolean;
}

export interface SyncResult {
  success: boolean;
  questionsAdded: number;
  questionsUpdated: number;
  questionsDeactivated: number;
  questionsSkipped: number;
  totalProcessed: number;
  errors: number;
  errorMessages?: string[];
  timestamp: string;
}

/**
 * Main sync function
 */
async function syncQuestions(options: SyncOptions): Promise<SyncResult> {
  console.log("\n🔄 Starting question sync from Google Sheet...");
  console.log(
    `Mode: ${options.dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}\n`
  );

  const stats: SyncStats = {
    newQuestions: 0,
    updatedQuestions: 0,
    deactivatedQuestions: 0,
    skippedQuestions: 0,
    errors: 0,
    skipReasons: new Map<string, number>(),
  };

  const errorMessages: string[] = [];

  try {
    // Step 1: Fetch data from Google Sheet
    const sheetRows = await fetchSheetData();

    if (sheetRows.length === 0) {
      console.log("⚠️  No questions found in sheet");
      return {
        success: true,
        questionsAdded: 0,
        questionsUpdated: 0,
        questionsDeactivated: 0,
        questionsSkipped: 0,
        totalProcessed: 0,
        errors: 0,
        timestamp: new Date().toISOString(),
      };
    }

    console.log(`📋 Found ${sheetRows.length} questions in sheet\n`);

    // Step 2: Process each question
    const validQuestions: ProcessedQuestion[] = [];

    for (let i = 0; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      const result = await processSheetRow(row);

      if (result.valid) {
        validQuestions.push(result.question!);
      } else {
        stats.skippedQuestions++;

        // Track skip reasons
        const reason = result.reason || "Unknown reason";
        stats.skipReasons.set(reason, (stats.skipReasons.get(reason) || 0) + 1);

        if (options.verbose) {
          console.log(`⏭️  Row ${i + 2}: Skipped - ${result.reason}`);
          console.log(
            `   Question text: "${row.questionText?.substring(0, 80) || "(empty)"}..."`
          );
          console.log(`   Question type: "${row.questionType || "(empty)"}"`);
          console.log(`   Company: "${row.company || "(empty)"}"`);
        }
      }
    }

    console.log(`\n✅ Validated ${validQuestions.length} questions`);
    console.log(`⏭️  Skipped ${stats.skippedQuestions} questions\n`);

    // Step 3: Get existing questions from database
    const existingQuestions = await getExistingQuestions();
    const existingQuestionTexts = new Set(
      existingQuestions.map((q) => normalizeText(q.questionText))
    );

    console.log(
      `💾 Found ${existingQuestions.length} existing questions in database\n`
    );

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
      (q) =>
        q.isActive && !sheetQuestionTexts.has(normalizeText(q.questionText))
    );

    stats.newQuestions = newQuestions.length;
    stats.deactivatedQuestions = questionsToDeactivate.length;

    // Step 5: Apply changes (or preview if dry run)
    if (options.dryRun) {
      console.log("🔍 DRY RUN - Preview of changes:\n");
      previewChanges(newQuestions, questionsToDeactivate);
    } else {
      await applyChanges(
        newQuestions,
        questionsToDeactivate,
        stats,
        options,
        errorMessages
      );
    }

    // Step 6: Print summary
    printSummary(stats, options.dryRun);

    // Return result
    return {
      success: stats.errors === 0,
      questionsAdded: stats.newQuestions,
      questionsUpdated: stats.updatedQuestions,
      questionsDeactivated: stats.deactivatedQuestions,
      questionsSkipped: stats.skippedQuestions,
      totalProcessed: sheetRows.length,
      errors: stats.errors,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("\n❌ Sync failed:", error);

    return {
      success: false,
      questionsAdded: stats.newQuestions,
      questionsUpdated: stats.updatedQuestions,
      questionsDeactivated: stats.deactivatedQuestions,
      questionsSkipped: stats.skippedQuestions,
      totalProcessed: 0,
      errors: stats.errors + 1,
      errorMessages: [errorMessage],
      timestamp: new Date().toISOString(),
    };
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
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || "Sheet1";
  const hasGoogleSheetsCredentials =
    process.env.GOOGLE_SHEETS_API_KEY ||
    process.env.GOOGLE_SHEETS_CREDENTIALS_BASE64 ||
    process.env.GOOGLE_SHEETS_CREDENTIALS ||
    (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);

  if (csvUrl) {
    console.log("📡 Using Method A: Fetching from CSV URL");
    return await fetchSheetAsCSV(csvUrl);
  } else if (sheetId && hasGoogleSheetsCredentials) {
    console.log("📡 Using Method B: Fetching via Google Sheets API");
    return await fetchSheetViaAPI(sheetId, sheetName);
  } else {
    throw new Error(
      "Missing environment variables. Set either:\n" +
        "  - GOOGLE_SHEET_CSV_URL (Method A - recommended)\n" +
        "  or\n" +
        "  - GOOGLE_SHEET_ID with GOOGLE_SHEETS_API_KEY, GOOGLE_SHEETS_CREDENTIALS_BASE64, or GOOGLE_SHEETS_CREDENTIALS (Method B)"
    );
  }
}

/**
 * Process a single sheet row into a database-ready question
 */
function processSheetRow(row: SheetRow): {
  valid: boolean;
  question?: ProcessedQuestion;
  reason?: string;
} {
  // Validate required fields
  const validation = validateSheetRow(row);
  if (!validation.valid) {
    return { valid: false, reason: validation.error };
  }

  // Map question type
  const mappedType = mapQuestionType(row.questionType);
  if (!mappedType) {
    return {
      valid: false,
      reason: `Unknown question type: "${row.questionType}"`,
    };
  }

  if (!VALID_QUESTION_TYPES.has(mappedType)) {
    return {
      valid: false,
      reason: `Invalid question type: "${mappedType}"`,
    };
  }

  // Clean company name (null if empty)
  const company =
    row.company && row.company.trim().length > 0 ? row.company.trim() : null;

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
    } catch {
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
    },
  };
}

/**
 * Get all existing questions from database
 */
async function getExistingQuestions() {
  const { db } = await import("@/lib/db");

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
  return text.toLowerCase().trim().replace(/\s+/g, " ");
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
    newQuestions.slice(0, 5).forEach((q) => {
      console.log(
        `   • [${q.questionType}] ${q.questionText.substring(0, 70)}...`
      );
    });
    if (newQuestions.length > 5) {
      console.log(`   ... and ${newQuestions.length - 5} more`);
    }
    console.log();
  }

  if (questionsToDeactivate.length > 0) {
    console.log(
      `🔒 Would deactivate ${questionsToDeactivate.length} questions:`
    );
    questionsToDeactivate.slice(0, 5).forEach((q) => {
      console.log(`   • ${q.questionText.substring(0, 70)}...`);
    });
    if (questionsToDeactivate.length > 5) {
      console.log(`   ... and ${questionsToDeactivate.length - 5} more`);
    }
    console.log();
  }

  if (newQuestions.length === 0 && questionsToDeactivate.length === 0) {
    console.log(
      "✨ No changes needed - database is already in sync with sheet\n"
    );
  }
}

/**
 * Apply changes to database
 */
async function applyChanges(
  newQuestions: ProcessedQuestion[],
  questionsToDeactivate: Array<{ id: string; questionText: string }>,
  stats: SyncStats,
  options: SyncOptions,
  errorMessages: string[] = []
) {
  const { db } = await import("@/lib/db");
  stats.newQuestions = 0;
  stats.deactivatedQuestions = 0;

  // Insert new questions
  if (newQuestions.length > 0) {
    console.log(`➕ Adding ${newQuestions.length} new questions...`);

    for (const chunk of chunkArray(newQuestions, 500)) {
      try {
        await db.insert(interviewQuestion).values(
          chunk.map((question) => ({
            company: question.company,
            questionText: question.questionText,
            questionType: question.questionType,
            askedAt: question.askedAt,
            isActive: true,
          }))
        );

        stats.newQuestions += chunk.length;

        if (options.verbose) {
          console.log(`   ✓ Added ${chunk.length} questions`);
        }
      } catch (error) {
        stats.errors += chunk.length;
        const errorMsg = `Error adding question batch: ${error instanceof Error ? error.message : "Unknown error"}`;
        errorMessages.push(errorMsg);
        console.error(`   ✗ ${errorMsg}`);
      }
    }
  }

  // Deactivate removed questions
  if (questionsToDeactivate.length > 0) {
    console.log(
      `\n🔒 Deactivating ${questionsToDeactivate.length} questions...`
    );

    for (const chunk of chunkArray(questionsToDeactivate, 500)) {
      try {
        await db
          .update(interviewQuestion)
          .set({ isActive: false })
          .where(
            inArray(
              interviewQuestion.id,
              chunk.map((question) => question.id)
            )
          );

        stats.deactivatedQuestions += chunk.length;

        if (options.verbose) {
          console.log(`   ✓ Deactivated ${chunk.length} questions`);
        }
      } catch (error) {
        stats.errors += chunk.length;
        const errorMsg = `Error deactivating question batch: ${error instanceof Error ? error.message : "Unknown error"}`;
        errorMessages.push(errorMsg);
        console.error(`   ✗ ${errorMsg}`);
      }
    }
  }

  if (newQuestions.length === 0 && questionsToDeactivate.length === 0) {
    console.log(
      "✨ No changes needed - database is already in sync with sheet"
    );
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Print sync summary
 */
function printSummary(stats: SyncStats, isDryRun: boolean) {
  console.log("\n" + "─".repeat(50));
  console.log(`📊 Sync ${isDryRun ? "Preview" : "Complete"}\n`);
  console.log(`   New questions:         ${stats.newQuestions}`);
  console.log(`   Updated questions:     ${stats.updatedQuestions}`);
  console.log(`   Deactivated questions: ${stats.deactivatedQuestions}`);
  console.log(`   Skipped questions:     ${stats.skippedQuestions}`);
  console.log(`   Errors:                ${stats.errors}`);

  // Show skip reasons breakdown
  if (stats.skippedQuestions > 0 && stats.skipReasons.size > 0) {
    console.log(`\n   Skip reasons breakdown:`);
    // Sort by count (descending)
    const sortedReasons = Array.from(stats.skipReasons.entries()).sort(
      (a, b) => b[1] - a[1]
    );

    for (const [reason, count] of sortedReasons) {
      console.log(`      • ${reason}: ${count}`);
    }
  }

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
    dryRun: args.includes("--dry-run"),
    verbose: args.includes("--verbose") || args.includes("-v"),
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
