/** Canonical product positioning and language for customer-facing Meelni surfaces. */
export const PRODUCT_LANGUAGE = {
  category: "Live PM interview practice",
  oneLine:
    "Practice real PM interview questions out loud, handle realistic follow-ups, and get PM-calibrated feedback on what to improve next.",
  heroPromise: "Practice the answer before it counts.",
  proofPoints: [
    "Real PM interview questions across Product Sense, Execution, Strategy, and Behavioral rounds.",
    "Live voice mock interviews with follow-up questions.",
    "PM-calibrated feedback, transcripts, and practice history after completed interviews.",
  ],
} as const;

/**
 * Use these terms in new product copy. The legacy route and analytics aliases are
 * compatibility contracts, not approved customer-facing vocabulary.
 */
export const PRODUCT_LEXICON = {
  completeSession: "mock interview",
  generalActivity: "interview practice",
  individualActivity: "practice session",
  completedItem: "completed interview",
  collection: "interview history",
  focusedActivity: "focused practice",
  launchAction: "New Mock Interview",
  dashboardHome: "Overview",
  measuredTrend: "practice progress",
} as const;

export const PRODUCT_LANGUAGE_GUARDRAILS = {
  avoidFitnessMetaphors: [
    "gym",
    "rep",
    "reps",
    "workout",
    "workouts",
    "drill",
    "drills",
  ],
  avoidUnsupportedOutcomeClaims: [
    "interview ready",
    "interview-ready",
    "readiness score",
    "real-time feedback",
    "instant feedback",
    "immediate feedback",
  ],
  exceptions: [
    "Verbatim interview-question content may legitimately discuss fitness products.",
    "Documented legacy route, analytics, database, and provider identifiers may retain fitness terminology temporarily for compatibility.",
  ],
} as const;

const FOCUS_PRACTICE_REPLACEMENTS = [
  [/\bgyms\b/gi, "practice spaces"],
  [/\bgym\b/gi, "practice"],
  [/\bworkouts\b/gi, "practice plans"],
  [/\bworkout\b/gi, "practice plan"],
  [
    /\b(\d+|one|two|three|four|five|several|some|more)\s+reps\b/gi,
    "$1 practice attempts",
  ],
  [/\b(?:do|complete|repeat|run)\s+(?:some\s+)?reps\b/gi, "practice repeatedly"],
  [/\b(practice|answer|response)\s+reps\b/gi, "$1 attempts"],
  [/\b(practice|answer|response)\s+rep\b/gi, "$1 attempt"],
  [
    /\b(a|an|another|this|that|the|targeted|practice)\s+drill\b/gi,
    "$1 exercise",
  ],
  [/\b(practice|targeted)\s+drills\b/gi, "$1 exercises"],
] as const;

const FITNESS_VOCABULARY = /\b(?:gyms?|reps?|workouts?|drills?)\b/i;

function containsFitnessFraming(value: string): boolean {
  const withoutLegitimatePmUsage = value
    .replace(
      /\b(?:sales|support|field|service|account|store|partner|customer(?: success)?)\s+reps?\b/gi,
      ""
    )
    .replace(/\binterview\s+reps?\b/gi, "")
    .replace(/\bdrill(?:\s+down)?\s+into\b/gi, "");

  return FITNESS_VOCABULARY.test(withoutLegitimatePmUsage);
}

/**
 * Model output is untrusted customer copy. Keep the legacy `drills` payload key,
 * but normalize its values before they are persisted or rendered.
 */
export function normalizePracticeRecommendations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    if (typeof candidate !== "string") return [];

    let normalized = candidate.trim();
    if (!normalized) return [];

    for (const [pattern, replacement] of FOCUS_PRACTICE_REPLACEMENTS) {
      normalized = normalized.replace(pattern, replacement);
    }

    if (containsFitnessFraming(normalized)) return [];

    return [normalized];
  });
}
