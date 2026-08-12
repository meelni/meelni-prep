import {
  calculateOverallScore,
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  getCompletedFeedbackScore,
  hasServerOwnedEvidenceLimitedContent,
  LEGACY_FEEDBACK_RUBRIC_VERSION,
  parseRubricScore,
} from "@meelni/core";

export const DASHBOARD_FEEDBACK_PRESENTATION_KINDS = [
  "scored",
  "evidence_limited",
  "unavailable",
] as const;

export type DashboardFeedbackPresentationKind =
  (typeof DASHBOARD_FEEDBACK_PRESENTATION_KINDS)[number];

export const DASHBOARD_FEEDBACK_PRESENTATION_LIMITS = {
  findingsJson: 64_000,
  drillsJson: 64,
  summary: 4_000,
  version: 256,
} as const;

export interface DashboardFeedbackPresentationCandidate {
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
  strengthsJson: unknown;
  improvementsJson: unknown;
  drillsJson: unknown;
  summary: unknown;
}

/**
 * Turn bounded persistence fields into the only feedback kinds the dashboard
 * may present as reviewable. The canonical feedback route still revalidates
 * transcript citations before rendering the review itself.
 */
export function classifyDashboardFeedbackPresentation(
  candidate: DashboardFeedbackPresentationCandidate
): DashboardFeedbackPresentationKind {
  if (hasSupportedScoredMetadata(candidate)) {
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

  return Array.isArray(drills) &&
    drills.length === 0 &&
    hasServerOwnedEvidenceLimitedContent({
      strengths,
      improvements,
      summary: candidate.summary,
    })
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
