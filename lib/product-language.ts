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
