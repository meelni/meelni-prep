/**
 * Sync Interview Questions from Google Sheet
 *
 * This script syncs PM interview questions from a Google Sheet to the database.
 * It supports two methods:
 * - Method A: Fetch from public CSV URL (recommended, simpler)
 * - Method B: Use Google Sheets API (requires API key)
 *
 * The CLI entrypoint is scripts/run-question-sync.ts. This module contains
 * provider preparation and taxonomy mapping shared by the locked workflow.
 *
 * Environment variables required:
 *   GOOGLE_SHEET_CSV_URL  (Method A - recommended)
 *   or
 *   GOOGLE_SHEETS_API_KEY + GOOGLE_SHEET_ID (Method B)
 */

import {
  fetchSheetAsCSV,
  validateSheetRow,
  type SheetRow,
} from "@/lib/google-sheets-client";
import { fetchSheetViaAPI } from "@/lib/google-sheets-api";
import { deduplicateQuestionSyncSource } from "@/lib/question-sync/source";
import type {
  PreparedQuestionSync,
  ProcessedQuestion,
  QuestionStorageType,
} from "@/lib/question-sync/types";
import {
  canonicalQuestionTypeLabel,
  type CanonicalQuestionType,
} from "@meelni/core";

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

// Valid provider-facing labels while the historical database constraint remains.
const VALID_QUESTION_TYPES = new Set<QuestionStorageType>([
  "Behavioral",
  "Execution",
  "Product Sense",
  "Product Strategy",
]);

function mapQuestionType(rawQuestionType: string): QuestionStorageType | null {
  const trimmed = rawQuestionType.trim();
  const mapped = QUESTION_TYPE_MAPPING[trimmed];
  if (mapped) {
    return toQuestionStorageType(canonicalQuestionTypeLabel(mapped));
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
    return "Execution";
  }

  if (normalized.includes("pricing") || normalized.includes("monetiz")) {
    return "Execution";
  }

  if (
    normalized.includes("estimat") ||
    normalized.includes("guesstimate") ||
    normalized.includes("market sizing")
  ) {
    return "Execution";
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
    return "Product Sense";
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

/** Fetch and normalize provider data before opening the database transaction. */
export async function prepareQuestionSyncSource(): Promise<PreparedQuestionSync> {
  const sheetRows = await fetchSheetData();
  const sourceTimeZone = process.env.GOOGLE_SHEET_TIME_ZONE || "UTC";
  parseGoogleSheetTimeZoneOffset(sourceTimeZone);
  const validatedQuestions: ProcessedQuestion[] = [];
  let invalidRows = 0;

  for (const row of sheetRows) {
    const result = processSheetRow(row, sourceTimeZone);
    if (result.valid && result.question)
      validatedQuestions.push(result.question);
    else invalidRows++;
  }

  const { questions, duplicates } =
    deduplicateQuestionSyncSource(validatedQuestions);

  return {
    questions,
    sourceRows: sheetRows.length,
    validRows: validatedQuestions.length,
    questionsSkipped: invalidRows + duplicates,
  };
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
    return await fetchSheetAsCSV(csvUrl);
  } else if (sheetId && hasGoogleSheetsCredentials) {
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
function processSheetRow(
  row: SheetRow,
  sourceTimeZone: string
): {
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
      reason: "Unknown question type",
    };
  }

  if (!VALID_QUESTION_TYPES.has(mappedType)) {
    return {
      valid: false,
      reason: "Invalid question type",
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

  const timestamp = row.timestamp?.trim() ?? "";
  const askedAt = timestamp
    ? parseGoogleSheetTimestamp(timestamp, sourceTimeZone)
    : null;
  if (timestamp && !askedAt) {
    return { valid: false, reason: "Invalid timestamp" };
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
 * Parse Google Forms' M/D/YYYY H:mm[:ss] timestamp without consulting the
 * process timezone. The configured source zone must be UTC or a fixed numeric
 * offset, avoiding named-zone DST overlaps and gaps.
 */
export function parseGoogleSheetTimestamp(
  value: string,
  sourceTimeZone = process.env.GOOGLE_SHEET_TIME_ZONE || "UTC"
): Date | null {
  const source = value.trim();
  if (!source) return null;

  if (/(?:z|[+-]\d{2}:?\d{2})$/i.test(source)) {
    const milliseconds = Date.parse(source);
    return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
  }

  const match = source.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
  );
  if (!match) return null;

  const [
    ,
    monthText,
    dayText,
    yearText,
    hourText,
    minuteText,
    secondText,
    meridiem,
  ] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const year = Number(yearText);
  let hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? "0");

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  }
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const offsetMinutes = parseGoogleSheetTimeZoneOffset(sourceTimeZone);
  const utcMilliseconds =
    Date.UTC(year, month - 1, day, hour, minute, second) -
    offsetMinutes * 60_000;
  const localCheck = new Date(utcMilliseconds + offsetMinutes * 60_000);
  if (
    localCheck.getUTCFullYear() !== year ||
    localCheck.getUTCMonth() !== month - 1 ||
    localCheck.getUTCDate() !== day ||
    localCheck.getUTCHours() !== hour ||
    localCheck.getUTCMinutes() !== minute ||
    localCheck.getUTCSeconds() !== second
  ) {
    return null;
  }

  return new Date(utcMilliseconds);
}

export function parseGoogleSheetTimeZoneOffset(value: string): number {
  const sourceTimeZone = value.trim();
  if (/^(?:UTC|Z)$/i.test(sourceTimeZone)) return 0;

  const match = sourceTimeZone.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new Error("invalid_google_sheet_time_zone");

  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) {
    throw new Error("invalid_google_sheet_time_zone");
  }

  const offset = hours * 60 + minutes;
  return match[1] === "-" ? -offset : offset;
}

export { mapQuestionType };

function toQuestionStorageType(
  questionType: CanonicalQuestionType | null
): QuestionStorageType | null {
  return questionType === "Strategy" ? "Product Strategy" : questionType;
}
