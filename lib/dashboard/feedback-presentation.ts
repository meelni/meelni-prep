import {
  calculateOverallScore,
  classifySkippedFeedbackLifecycle,
  FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION,
  FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  getCompletedFeedbackScore,
  LEGACY_FEEDBACK_RUBRIC_VERSION,
  parseRubricScore,
  presentCompletedFeedback,
  type CandidateAnswerBlock,
  type PersistedFeedbackEvidenceTurn,
  type RoundType,
  type TrustedAnswerBlockProjection,
} from "@meelni/core";

export const DASHBOARD_FEEDBACK_PRESENTATION_KINDS = [
  "scored",
  "evidence_limited",
  "full_scorecard",
  "partial_scorecard",
  "coaching_review",
  "unable_to_review",
  "unavailable",
] as const;

export type DashboardFeedbackPresentationKind =
  (typeof DASHBOARD_FEEDBACK_PRESENTATION_KINDS)[number];

export const DASHBOARD_FEEDBACK_PRESENTATION_LIMITS = {
  // Match the canonical feedback read boundary. Dashboard reads still cap the
  // value one character beyond each limit so corrupt rows fail closed.
  findingsJson: 1_000_000,
  dimensionCoverageJson: 1_000_000,
  verifiedPrefixScopeJson: 128_000,
  drillsJson: 64_000,
  summary: 4_000,
  version: 256,
} as const;

export interface DashboardFeedbackPresentationCandidate {
  id: unknown;
  sessionId: unknown;
  status: unknown;
  outcomeReason: unknown;
  completionTier: unknown;
  overallScore: unknown;
  structureScore: unknown;
  clarityScore: unknown;
  insightScore: unknown;
  communicationScore: unknown;
  leadershipScore: unknown;
  schemaVersion: unknown;
  promptVersion: unknown;
  modelVersion: unknown;
  rubricVersion: unknown;
  evaluationState: unknown;
  feedbackMode: unknown;
  feedbackRoundType: unknown;
  dimensionCoverageJson: unknown;
  verifiedPrefixScopeJson: unknown;
  strengthsJson: unknown;
  improvementsJson: unknown;
  drillsJson: unknown;
  summary: unknown;
  createdAt: unknown;
}

/**
 * Turn bounded persistence fields into the only feedback kinds the dashboard
 * may present as reviewable. This deliberately reuses the canonical completed
 * feedback presenter so list links and the destination route share the same
 * persisted-content and frozen-evidence trust boundary.
 */
export function classifyDashboardFeedbackPresentation(
  candidate: DashboardFeedbackPresentationCandidate,
  evidenceTurns: readonly PersistedFeedbackEvidenceTurn[],
  answerBlocks: readonly CandidateAnswerBlock[] = [],
  expectedRoundType?: RoundType,
  frozenEvidenceState?: "complete" | "partial",
  verifiedPrefixProjection?: TrustedAnswerBlockProjection
): DashboardFeedbackPresentationKind {
  const strengths = decodeBoundedJson(
    candidate.strengthsJson,
    DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.findingsJson
  );
  const improvements = decodeBoundedJson(
    candidate.improvementsJson,
    DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.findingsJson
  );
  const drills = decodeBoundedJson(
    candidate.drillsJson,
    DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.drillsJson
  );
  const dimensionCoverage = decodeBoundedJson(
    candidate.dimensionCoverageJson,
    DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.dimensionCoverageJson
  );
  const verifiedPrefixScope = decodeBoundedJson(
    candidate.verifiedPrefixScopeJson,
    DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.verifiedPrefixScopeJson
  );
  const presented = presentCompletedFeedback(
    {
      id: candidate.id,
      sessionId: candidate.sessionId,
      structureScore: candidate.structureScore,
      clarityScore: candidate.clarityScore,
      insightScore: candidate.insightScore,
      communicationScore: candidate.communicationScore,
      leadershipScore: candidate.leadershipScore,
      overallScore: candidate.overallScore,
      strengths,
      improvements,
      drills,
      summary: candidate.summary,
      rubricVersion: candidate.rubricVersion,
      schemaVersion: candidate.schemaVersion,
      promptVersion: candidate.promptVersion,
      modelVersion: candidate.modelVersion,
      evaluationState: candidate.evaluationState,
      feedbackMode: candidate.feedbackMode,
      feedbackRoundType: candidate.feedbackRoundType,
      dimensionCoverage,
      verifiedPrefixScope,
      createdAt: candidate.createdAt,
    },
    {
      evidenceTurns,
      answerBlocks,
      expectedRoundType,
      frozenEvidenceState,
      verifiedPrefixProjection,
    }
  );

  if (classifySkippedFeedbackLifecycle(candidate)) {
    return "unable_to_review";
  }

  if (
    candidate.status === "completed" &&
    candidate.outcomeReason === "feedback_generated" &&
    (candidate.completionTier === "full" ||
      candidate.completionTier === "partial") &&
    (candidate.schemaVersion === FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION ||
      candidate.schemaVersion === FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION) &&
    presented.kind === "dimension-coverage"
  ) {
    return presented.mode;
  }

  if (
    hasSupportedScoredMetadata(candidate) &&
    (presented.kind === "v2" || presented.kind === "legacy")
  ) {
    return "scored";
  }

  if (
    candidate.status !== "completed" ||
    candidate.outcomeReason !== "feedback_generated" ||
    candidate.completionTier !== "partial" ||
    candidate.schemaVersion !== FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION ||
    candidate.promptVersion !== FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION ||
    candidate.rubricVersion !== FEEDBACK_RUBRIC_VERSION ||
    candidate.evaluationState !== "partial" ||
    !isBoundedNonEmptyString(
      candidate.modelVersion,
      DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.version
    ) ||
    !allScoresAreNull(candidate) ||
    !isBoundedString(
      candidate.summary,
      DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.summary
    )
  ) {
    return "unavailable";
  }

  return Array.isArray(drills) &&
    drills.length === 0 &&
    presented.kind === "evidence-limited"
    ? "evidence_limited"
    : "unavailable";
}

function hasSupportedScoredMetadata(
  candidate: DashboardFeedbackPresentationCandidate
): boolean {
  const overall = getCompletedFeedbackScore({
    status: typeof candidate.status === "string" ? candidate.status : null,
    overallScore:
      typeof candidate.overallScore === "string" ||
      typeof candidate.overallScore === "number"
        ? candidate.overallScore
        : null,
  });
  const scores = {
    structure: parseCandidateScore(candidate.structureScore),
    clarity: parseCandidateScore(candidate.clarityScore),
    insight: parseCandidateScore(candidate.insightScore),
    communication: parseCandidateScore(candidate.communicationScore),
    leadership: parseCandidateScore(candidate.leadershipScore),
  };
  if (
    overall === null ||
    Object.values(scores).some((score) => score === null) ||
    !isBoundedNonEmptyString(
      candidate.summary,
      DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.summary
    )
  ) {
    return false;
  }

  if (
    candidate.schemaVersion === null &&
    candidate.promptVersion === null &&
    candidate.modelVersion === null &&
    candidate.evaluationState === null
  ) {
    return candidate.rubricVersion === LEGACY_FEEDBACK_RUBRIC_VERSION;
  }

  if (
    candidate.outcomeReason !== "feedback_generated" ||
    candidate.schemaVersion !== FEEDBACK_SCHEMA_VERSION ||
    candidate.promptVersion !== FEEDBACK_PROMPT_VERSION ||
    candidate.rubricVersion !== FEEDBACK_RUBRIC_VERSION ||
    !isBoundedNonEmptyString(
      candidate.modelVersion,
      DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.version
    ) ||
    (candidate.evaluationState !== "full" &&
      candidate.evaluationState !== "partial") ||
    candidate.completionTier !== candidate.evaluationState
  ) {
    return false;
  }

  return (
    calculateOverallScore({
      structure: scores.structure!,
      clarity: scores.clarity!,
      insight: scores.insight!,
      communication: scores.communication!,
      leadership: scores.leadership!,
    }) === overall
  );
}

function parseCandidateScore(value: unknown): number | null {
  return typeof value === "string" || typeof value === "number"
    ? parseRubricScore(value)
    : null;
}

function allScoresAreNull(candidate: DashboardFeedbackPresentationCandidate) {
  return [
    candidate.overallScore,
    candidate.structureScore,
    candidate.clarityScore,
    candidate.insightScore,
    candidate.communicationScore,
    candidate.leadershipScore,
  ].every((score) => score === null);
}

function decodeBoundedJson(value: unknown, limit: number): unknown {
  if (!isBoundedString(value, limit)) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isBoundedString(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length <= limit;
}

function isBoundedNonEmptyString(
  value: unknown,
  limit: number
): value is string {
  return isBoundedString(value, limit) && value.trim().length > 0;
}
