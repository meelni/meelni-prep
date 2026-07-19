import { ALL_INTERVIEW_TYPES, type RoundType } from "./interview";
import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackV2Item,
  type FeedbackV2Result,
} from "./feedback-v2";
import { calculateOverallScore, type FeedbackDimension } from "./evaluation";

export const DRILL_RECOMMENDATION_CONTRACT_VERSION =
  "drill-recommendation.v1" as const;
export const DRILL_TEMPLATE_VERSION = "pm-drill-templates.v1" as const;

export const DRILL_RECOMMENDATION_SOURCE_STATES = [
  "completed",
  "pending",
  "processing",
  "failed",
  "skipped",
  "insufficient",
  "abandoned",
] as const;

export type DrillRecommendationSourceState =
  (typeof DRILL_RECOMMENDATION_SOURCE_STATES)[number];

export const DRILL_EVIDENCE_GAPS = [
  "grounded_full",
  "grounded_partial",
] as const;

export type DrillEvidenceGap = (typeof DRILL_EVIDENCE_GAPS)[number];

export const DRILL_RECOMMENDATION_UNAVAILABLE_REASONS = [
  "invalid_round",
  "invalid_source_state",
  "unsupported_template_version",
  "feedback_pending",
  "feedback_processing",
  "feedback_failed",
  "feedback_skipped",
  "feedback_insufficient",
  "feedback_abandoned",
  "missing_validated_feedback",
  "invalid_scores",
  "missing_grounded_improvement",
] as const;

export type DrillRecommendationUnavailableReason =
  (typeof DRILL_RECOMMENDATION_UNAVAILABLE_REASONS)[number];

export interface DrillRecommendationInput {
  roundType: RoundType | string;
  sourceState: DrillRecommendationSourceState | string;
  templateVersion: typeof DRILL_TEMPLATE_VERSION | string;
  feedback: FeedbackV2Result | null;
}

export interface RecommendedDrill {
  state: "recommended";
  contractVersion: typeof DRILL_RECOMMENDATION_CONTRACT_VERSION;
  templateVersion: typeof DRILL_TEMPLATE_VERSION;
  drillId: string;
  roundType: RoundType;
  weakestDimension: FeedbackDimension;
  weakestScore: number;
  tiedDimensions: FeedbackDimension[];
  evidenceGap: DrillEvidenceGap;
  sourceFinding: {
    transcriptRefs: string[];
    confidence: number;
  };
}

export interface UnavailableDrillRecommendation {
  state: "unavailable";
  contractVersion: typeof DRILL_RECOMMENDATION_CONTRACT_VERSION;
  templateVersion: string;
  reason: DrillRecommendationUnavailableReason;
}

export type DrillRecommendation =
  | RecommendedDrill
  | UnavailableDrillRecommendation;

/**
 * Trusted in-process resolution used by workflows that must snapshot the exact
 * grounded finding selected alongside the public recommendation contract.
 */
export interface DrillRecommendationResolution {
  recommendation: DrillRecommendation;
  sourceFinding: FeedbackV2Item | null;
}

const SCORE_DIMENSIONS = [
  "structure",
  "clarity",
  "insight",
  "communication",
  "leadership",
] as const satisfies readonly FeedbackDimension[];

export const ROUND_DIMENSION_TIE_BREAK_ORDER = {
  product_sense: [
    "insight",
    "structure",
    "clarity",
    "communication",
    "leadership",
  ],
  execution: ["structure", "insight", "clarity", "communication", "leadership"],
  behavioral: [
    "leadership",
    "structure",
    "insight",
    "clarity",
    "communication",
  ],
  strategy: ["insight", "structure", "leadership", "clarity", "communication"],
} as const satisfies Record<RoundType, readonly FeedbackDimension[]>;

const SOURCE_STATE_UNAVAILABLE_REASON = {
  pending: "feedback_pending",
  processing: "feedback_processing",
  failed: "feedback_failed",
  skipped: "feedback_skipped",
  insufficient: "feedback_insufficient",
  abandoned: "feedback_abandoned",
} as const satisfies Record<
  Exclude<DrillRecommendationSourceState, "completed">,
  DrillRecommendationUnavailableReason
>;

export function recommendDrill(
  input: DrillRecommendationInput
): DrillRecommendation {
  return resolveDrillRecommendation(input).recommendation;
}

export function resolveDrillRecommendation(
  input: DrillRecommendationInput
): DrillRecommendationResolution {
  if (!isRoundType(input.roundType)) {
    return unresolved(input.templateVersion, "invalid_round");
  }
  if (!isSourceState(input.sourceState)) {
    return unresolved(input.templateVersion, "invalid_source_state");
  }
  if (input.templateVersion !== DRILL_TEMPLATE_VERSION) {
    return unresolved(input.templateVersion, "unsupported_template_version");
  }
  if (input.sourceState !== "completed") {
    return unresolved(
      input.templateVersion,
      SOURCE_STATE_UNAVAILABLE_REASON[input.sourceState]
    );
  }
  if (!isCompleteFeedbackV2Result(input.feedback)) {
    return unresolved(input.templateVersion, "missing_validated_feedback");
  }

  const scoreEntries = SCORE_DIMENSIONS.map((dimension) => ({
    dimension,
    score: input.feedback!.scores[dimension],
  }));
  if (scoreEntries.some(({ score }) => !isValidScore(score))) {
    return unresolved(input.templateVersion, "invalid_scores");
  }
  if (
    !isValidOverallScore(input.feedback.overallScore) ||
    input.feedback.overallScore !== calculateOverallScore(input.feedback.scores)
  ) {
    return unresolved(input.templateVersion, "invalid_scores");
  }

  const weakestScore = Math.min(...scoreEntries.map(({ score }) => score));
  const tiedDimensions = scoreEntries
    .filter(({ score }) => score === weakestScore)
    .map(({ dimension }) => dimension);
  const groundedImprovements = input.feedback.improvements.filter(
    isGroundedImprovement
  );
  const weakestDimension = ROUND_DIMENSION_TIE_BREAK_ORDER[
    input.roundType
  ].find(
    (dimension) =>
      tiedDimensions.includes(dimension) &&
      groundedImprovements.some((item) => item.dimension === dimension)
  );
  if (!weakestDimension) {
    return unresolved(input.templateVersion, "missing_grounded_improvement");
  }

  const sourceFinding = groundedImprovements
    .filter(({ dimension }) => dimension === weakestDimension)
    .sort(compareGroundedFindings)[0];
  if (!sourceFinding) {
    return unresolved(input.templateVersion, "missing_grounded_improvement");
  }

  const evidenceGap: DrillEvidenceGap =
    input.feedback.evaluationState === "full"
      ? "grounded_full"
      : "grounded_partial";

  return {
    recommendation: {
      state: "recommended",
      contractVersion: DRILL_RECOMMENDATION_CONTRACT_VERSION,
      templateVersion: DRILL_TEMPLATE_VERSION,
      drillId: [
        "pm-drill",
        DRILL_TEMPLATE_VERSION,
        input.roundType,
        weakestDimension,
        evidenceGap,
      ].join(":"),
      roundType: input.roundType,
      weakestDimension,
      weakestScore,
      tiedDimensions,
      evidenceGap,
      sourceFinding: {
        transcriptRefs: [...sourceFinding.transcriptRefs].sort(),
        confidence: sourceFinding.confidence,
      },
    },
    sourceFinding: cloneFeedbackItem(sourceFinding),
  };
}

function unresolved(
  templateVersion: string,
  reason: DrillRecommendationUnavailableReason
): DrillRecommendationResolution {
  return {
    recommendation: unavailable(templateVersion, reason),
    sourceFinding: null,
  };
}

function cloneFeedbackItem(item: FeedbackV2Item): FeedbackV2Item {
  return {
    ...item,
    transcriptRefs: [...item.transcriptRefs],
    evidence: item.evidence.map((entry) => ({ ...entry })),
  };
}

const FEEDBACK_ROOT_KEYS = [
  "schemaVersion",
  "promptVersion",
  "modelVersion",
  "rubricVersion",
  "evaluationState",
  "scores",
  "overallScore",
  "strengths",
  "improvements",
  "drills",
  "summary",
] as const;

const FEEDBACK_ITEM_KEYS = [
  "dimension",
  "observation",
  "transcriptRefs",
  "evidence",
  "nextStep",
  "rubricVersion",
  "confidence",
] as const;

const FEEDBACK_EVIDENCE_KEYS = ["turnRef", "quote"] as const;

function isCompleteFeedbackV2Result(
  feedback: unknown
): feedback is FeedbackV2Result {
  if (!isRecord(feedback) || !hasExactKeys(feedback, FEEDBACK_ROOT_KEYS)) {
    return false;
  }
  if (
    feedback.schemaVersion !== FEEDBACK_SCHEMA_VERSION ||
    feedback.promptVersion !== FEEDBACK_PROMPT_VERSION ||
    feedback.rubricVersion !== FEEDBACK_RUBRIC_VERSION ||
    !isNonEmptyString(feedback.modelVersion) ||
    (feedback.evaluationState !== "full" &&
      feedback.evaluationState !== "partial") ||
    !isRecord(feedback.scores) ||
    !hasExactKeys(feedback.scores, SCORE_DIMENSIONS) ||
    !Array.isArray(feedback.strengths) ||
    feedback.strengths.length < 1 ||
    feedback.strengths.length > 5 ||
    !Array.isArray(feedback.improvements) ||
    feedback.improvements.length < 1 ||
    feedback.improvements.length > 5 ||
    !Array.isArray(feedback.drills) ||
    feedback.drills.length < 1 ||
    feedback.drills.length > 3 ||
    !feedback.drills.every(isNonEmptyString) ||
    !isNonEmptyString(feedback.summary)
  ) {
    return false;
  }

  const findings = [...feedback.strengths, ...feedback.improvements];
  return (
    findings.every(isStrictFeedbackItem) &&
    hasUniqueEvidenceAcrossFindings(findings)
  );
}

function isStrictFeedbackItem(value: unknown): value is FeedbackV2Item {
  if (!isRecord(value) || !hasExactKeys(value, FEEDBACK_ITEM_KEYS)) {
    return false;
  }
  if (
    typeof value.dimension !== "string" ||
    !SCORE_DIMENSIONS.includes(value.dimension as FeedbackDimension) ||
    !isNonEmptyString(value.observation) ||
    !isNonEmptyString(value.nextStep) ||
    value.rubricVersion !== FEEDBACK_RUBRIC_VERSION ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence <= 0 ||
    value.confidence > 1 ||
    !Array.isArray(value.transcriptRefs) ||
    value.transcriptRefs.length < 1 ||
    value.transcriptRefs.length > 5 ||
    !value.transcriptRefs.every(isNonEmptyString) ||
    new Set(value.transcriptRefs).size !== value.transcriptRefs.length ||
    !Array.isArray(value.evidence) ||
    value.evidence.length < 1 ||
    value.evidence.length > 5 ||
    !value.evidence.every(isStrictEvidenceEntry)
  ) {
    return false;
  }

  const evidenceRefs = new Set(value.evidence.map(({ turnRef }) => turnRef));
  return (
    value.evidence.length === value.transcriptRefs.length &&
    evidenceRefs.size === value.transcriptRefs.length &&
    value.transcriptRefs.every((turnRef) => evidenceRefs.has(turnRef))
  );
}

function isStrictEvidenceEntry(
  value: unknown
): value is { turnRef: string; quote: string } {
  return (
    isRecord(value) &&
    hasExactKeys(value, FEEDBACK_EVIDENCE_KEYS) &&
    isNonEmptyString(value.turnRef) &&
    isNonEmptyString(value.quote)
  );
}

function hasUniqueEvidenceAcrossFindings(findings: FeedbackV2Item[]): boolean {
  const identities = findings.flatMap(({ evidence }) =>
    evidence.map(({ turnRef, quote }) => `${turnRef}\u0000${quote}`)
  );
  return new Set(identities).size === identities.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => expectedKeys.includes(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isGroundedImprovement(item: FeedbackV2Item): boolean {
  if (
    !Number.isFinite(item.confidence) ||
    item.confidence <= 0 ||
    item.confidence > 1 ||
    !item.observation.trim() ||
    !item.nextStep.trim()
  ) {
    return false;
  }
  if (item.transcriptRefs.length === 0 || item.evidence.length === 0) {
    return false;
  }
  const evidence = item.evidence as unknown[];
  if (!evidence.every(isEvidenceEntry)) return false;
  if (
    item.transcriptRefs.some(
      (turnRef) => typeof turnRef !== "string" || !turnRef.trim()
    )
  ) {
    return false;
  }
  const transcriptRefs = new Set(item.transcriptRefs);
  const evidenceKeys = new Set(
    evidence.map(({ turnRef, quote }) => `${turnRef}\u0000${quote}`)
  );
  const evidenceRefs = new Set(evidence.map(({ turnRef }) => turnRef));
  return (
    transcriptRefs.size === item.transcriptRefs.length &&
    evidence.length === item.transcriptRefs.length &&
    evidenceKeys.size === evidence.length &&
    evidenceRefs.size === transcriptRefs.size &&
    evidence.every(
      ({ turnRef, quote }) =>
        turnRef.trim().length > 0 &&
        transcriptRefs.has(turnRef) &&
        quote.trim().length > 0
    )
  );
}

function isEvidenceEntry(
  value: unknown
): value is { turnRef: string; quote: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return typeof entry.turnRef === "string" && typeof entry.quote === "string";
}

function compareGroundedFindings(
  left: FeedbackV2Item,
  right: FeedbackV2Item
): number {
  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }
  return compareOrdinal(findingKey(left), findingKey(right));
}

function findingKey(item: FeedbackV2Item): string {
  return item.evidence
    .map(({ turnRef, quote }) => `${turnRef}\u0000${quote}`)
    .sort()
    .join("\u0001");
}

function compareOrdinal(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function isValidScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10
  );
}

function isValidOverallScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10
  );
}

function isRoundType(value: string): value is RoundType {
  return (ALL_INTERVIEW_TYPES as readonly string[]).includes(value);
}

function isSourceState(value: string): value is DrillRecommendationSourceState {
  return (DRILL_RECOMMENDATION_SOURCE_STATES as readonly string[]).includes(
    value
  );
}

function unavailable(
  templateVersion: string,
  reason: DrillRecommendationUnavailableReason
): UnavailableDrillRecommendation {
  return {
    state: "unavailable",
    contractVersion: DRILL_RECOMMENDATION_CONTRACT_VERSION,
    templateVersion,
    reason,
  };
}
