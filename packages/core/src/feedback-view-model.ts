import { calculateOverallScore, type FeedbackDimension } from "./evaluation";
import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackEvaluationState,
  type FeedbackEvidence,
  type FeedbackV2Item,
  type FeedbackV2Result,
  type FeedbackV2Scores,
} from "./feedback-v2";
import {
  EVIDENCE_LIMITED_ACTIONS,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS,
  EVIDENCE_LIMITED_STRENGTH_SIGNALS,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  parsePersistedEvidenceLimitedFeedback,
  selectEvidenceLimitedPracticeFocus,
  type EvidenceLimitedImprovementItem,
  type EvidenceLimitedStrengthItem,
  type EvidenceLimitedFeedbackResult,
} from "./feedback-evidence-limited";
import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION,
  FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION,
  parsePersistedDimensionCoverageFeedback,
  selectDimensionCoveragePracticeFocus,
  type DimensionCoverageFeedbackMode,
  type DimensionCoveragePracticeFocusSource,
  type DimensionCoverageResultDimensions,
} from "./feedback-dimension-coverage";
import type { CandidateAnswerBlock } from "./answer-blocks";
import type { TrustedAnswerBlockProjection } from "./trusted-answer-block-authority";
import type { RoundType } from "./interview";
import type { FeedbackOutcomeReason } from "./feedback-outcome";
import {
  MAX_CANONICAL_EVENT_ID_LENGTH,
  prepareFeedbackTranscript,
} from "./feedback-transcript";
import {
  decodeSavedInterviewWorkspace,
  type SavedInterviewWorkspace,
} from "./saved-interview-workspace";

export const LEGACY_FEEDBACK_RUBRIC_VERSION = "1.0.0" as const;
export const FEEDBACK_REVIEW_PRESENTATION_VERSION =
  "feedback.review-outcome.v1" as const;

export interface PersistedCompletedFeedback {
  id: unknown;
  sessionId: unknown;
  structureScore: unknown;
  clarityScore: unknown;
  insightScore: unknown;
  communicationScore: unknown;
  leadershipScore: unknown;
  overallScore: unknown;
  strengths: unknown;
  improvements: unknown;
  drills: unknown;
  summary: unknown;
  rubricVersion: unknown;
  schemaVersion: unknown;
  promptVersion: unknown;
  modelVersion: unknown;
  evaluationState: unknown;
  feedbackMode?: unknown;
  feedbackRoundType?: unknown;
  dimensionCoverage?: unknown;
  verifiedPrefixScope?: unknown;
  createdAt: unknown;
}

export interface PersistedFeedbackEvidenceTurn {
  eventId: unknown;
  speaker: unknown;
  text: unknown;
  contractVersion: unknown;
}

export interface PresentCompletedFeedbackOptions {
  evidenceTurns: readonly PersistedFeedbackEvidenceTurn[];
  answerBlocks?: readonly CandidateAnswerBlock[];
  expectedRoundType?: RoundType;
  frozenEvidenceState?: "complete" | "partial";
  verifiedPrefixProjection?: TrustedAnswerBlockProjection;
  scoreWithheldReason?: FeedbackScoreWithheldReason;
}

export type FeedbackScoreWithheldReason =
  | "rubric_coverage"
  | "verified_evidence_integrity";

export interface FeedbackCoachingSignalView {
  dimension: FeedbackDimension;
  label: string;
  citation: string;
  transcriptRef: string;
  evidenceSupport: "exact_candidate_citation";
}

export interface FeedbackPracticeFocusView {
  dimension: FeedbackDimension;
  title: string;
  guidance: string;
  rationale: string;
  citation: string;
  transcriptRef: string;
}

export interface FeedbackEvidenceLimitedFindingView {
  dimension: FeedbackDimension;
  observation: string;
  citation: string;
  transcriptRef: string;
  nextStep: string;
  evidenceSupport: "exact_candidate_citation";
}

export interface FeedbackDimensionEvidenceView {
  label: string;
  citation: string;
  transcriptRef: string;
}

export interface FeedbackDimensionResultView {
  coverage: "sufficient" | "partial" | "absent";
  score: number | null;
  evidence: FeedbackDimensionEvidenceView[];
}

export type FeedbackDimensionResultsView = Record<
  FeedbackDimension,
  FeedbackDimensionResultView
>;

export interface FeedbackEvidenceLimitedPracticeFocusView {
  dimension: FeedbackDimension;
  title: string;
  guidance: string;
  citation: string;
  transcriptRef: string;
}

export interface FeedbackScoreView {
  structure: number;
  clarity: number;
  insight: number;
  communication: number;
  leadership: number;
  overall: number;
}

/** SAV-201 may populate this seam. SAV-200 never ranks recommendations. */
export interface FeedbackNextPracticeRecommendation {
  version: string;
  dimension: FeedbackDimension;
  title: string;
  rationale: string;
  actionId: string;
}

interface CompletedFeedbackIdentityBase {
  id: string;
  sessionId: string;
  summary: string;
  createdAt: string;
  nextPracticeRecommendation: FeedbackNextPracticeRecommendation | null;
}

interface CompletedFeedbackBase extends CompletedFeedbackIdentityBase {
  scores: FeedbackScoreView;
}

export interface FeedbackV2View extends CompletedFeedbackBase {
  kind: "v2";
  evaluationState: FeedbackEvaluationState;
  schemaVersion: typeof FEEDBACK_SCHEMA_VERSION;
  promptVersion: typeof FEEDBACK_PROMPT_VERSION;
  modelVersion: string;
  rubricVersion: typeof FEEDBACK_RUBRIC_VERSION;
  strengths: FeedbackV2Item[];
  improvements: FeedbackV2Item[];
}

export interface FeedbackLegacyView extends CompletedFeedbackBase {
  kind: "legacy";
  rubricVersion: typeof LEGACY_FEEDBACK_RUBRIC_VERSION;
  strengths: string[];
  improvements: string[];
}

export interface FeedbackEvidenceLimitedView
  extends CompletedFeedbackIdentityBase {
  kind: "evidence-limited";
  presentationVersion: typeof FEEDBACK_REVIEW_PRESENTATION_VERSION;
  strengths: FeedbackEvidenceLimitedFindingView[];
  improvements: FeedbackEvidenceLimitedFindingView[];
  scoreWithheldReason: FeedbackScoreWithheldReason;
  prioritizedPracticeFocus: FeedbackEvidenceLimitedPracticeFocusView;
}

export interface FeedbackDimensionCoverageView
  extends CompletedFeedbackIdentityBase {
  kind: "dimension-coverage";
  presentationVersion: typeof FEEDBACK_REVIEW_PRESENTATION_VERSION;
  mode: DimensionCoverageFeedbackMode;
  dimensions: FeedbackDimensionResultsView;
  overallScore: number | null;
  scoreWithheldReason: FeedbackScoreWithheldReason | null;
  coachingSignals: FeedbackCoachingSignalView[];
  prioritizedPracticeFocus: FeedbackPracticeFocusView | null;
  verifiedScope: {
    kind: "verified_prefix";
    reviewedAnswerCount: number;
    excludedTail: boolean;
  } | null;
}

export interface FeedbackInvalidView {
  kind: "invalid";
  reason: "incompatible_or_corrupt";
}

export type CompletedFeedbackView =
  | FeedbackV2View
  | FeedbackEvidenceLimitedView
  | FeedbackDimensionCoverageView
  | FeedbackLegacyView
  | FeedbackInvalidView;

export interface SkippedFeedbackDetails {
  outcome: "unable_to_review";
  scoreWithheldReason: FeedbackScoreWithheldReason;
  recovery:
    | "start_another_interview"
    | "credit_returned"
    | "credit_recovery_in_progress"
    | "review_recovery_available"
    | null;
}

export type FeedbackLifecycleResponse = (
  | { status: "missing"; retryable: true; message?: string }
  | {
      status: "session_not_ended";
      retryable: false;
      message?: string;
    }
  | {
      status: "settling";
      retryable: boolean;
      delayed?: boolean;
      message?: string;
    }
  | {
      status: "pending";
      retryable: boolean;
      delayed?: boolean;
      estimatedTimeRemaining?: number;
    }
  | {
      status: "processing";
      retryable: boolean;
      delayed?: boolean;
      estimatedTimeRemaining?: number;
    }
  | {
      status: "dispatch_failed";
      retryable: boolean;
      message: string;
      outcomeReason: Extract<FeedbackOutcomeReason, "dispatch_failed">;
    }
  | {
      status: "completed";
      retryable: false;
      feedback: CompletedFeedbackView;
    }
  | {
      status: "failed";
      retryable: boolean;
      message: string;
      outcomeReason: Extract<FeedbackOutcomeReason, "generation_failed">;
    }
  | {
      status: "skipped";
      retryable: boolean;
      details: SkippedFeedbackDetails;
    }
) & { workspace?: SavedInterviewWorkspace };

export type FeedbackViewState =
  | { kind: "unavailable"; message: string }
  | { kind: "missing"; retryable: true; message?: string }
  | { kind: "session-active"; message?: string }
  | {
      kind: "settling";
      retryable: boolean;
      delayed: boolean;
      message?: string;
    }
  | { kind: "pending"; retryable: boolean; delayed: boolean }
  | { kind: "processing"; retryable: boolean; delayed: boolean }
  | {
      kind: "dispatch-failed";
      retryable: boolean;
      message: string;
      outcomeReason: "dispatch_failed";
    }
  | { kind: "completed-full"; feedback: FeedbackV2View }
  | { kind: "completed-partial"; feedback: FeedbackV2View }
  | {
      kind: "completed-evidence-limited";
      feedback: FeedbackEvidenceLimitedView;
    }
  | {
      kind: "completed-full-scorecard";
      feedback: FeedbackDimensionCoverageView;
    }
  | {
      kind: "completed-partial-scorecard";
      feedback: FeedbackDimensionCoverageView;
    }
  | {
      kind: "completed-coaching-review";
      feedback: FeedbackDimensionCoverageView;
    }
  | { kind: "completed-legacy"; feedback: FeedbackLegacyView }
  | { kind: "completed-invalid" }
  | {
      kind: "failed-retryable";
      message: string;
      outcomeReason: "generation_failed";
    }
  | {
      kind: "failed-terminal";
      message: string;
      outcomeReason: "generation_failed";
    }
  | { kind: "no-reviewable-answer"; details: SkippedFeedbackDetails }
  | {
      kind: "transcript-integrity-degraded";
      retryable: boolean;
      details: SkippedFeedbackDetails;
    };

const DIMENSIONS = new Set<FeedbackDimension>([
  "structure",
  "clarity",
  "insight",
  "communication",
  "leadership",
]);

const FEEDBACK_READ_LIMITS = {
  identifier: 256,
  evidenceTurnIdentifier: MAX_CANONICAL_EVENT_ID_LENGTH,
  modelVersion: 256,
  summary: 4_000,
  findingText: 2_000,
  evidenceQuote: 4_000,
  legacyNote: 4_000,
  storedPracticeSuggestion: 2_000,
  numericString: 32,
} as const;
const MAX_PERSISTED_EVIDENCE_TURNS = 1_000;

export function presentCompletedFeedback(
  input: PersistedCompletedFeedback,
  options: PresentCompletedFeedbackOptions
): CompletedFeedbackView {
  try {
    if (hasLegacyVersionTuple(input)) return parseLegacyFeedback(input);
    if (
      input.schemaVersion === FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION ||
      input.schemaVersion === FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION
    ) {
      if (
        options.expectedRoundType === undefined ||
        options.frozenEvidenceState === undefined
      ) {
        throw new Error("verified v3 presentation context required");
      }
      if (input.feedbackRoundType !== options.expectedRoundType) {
        throw new Error("feedback round mismatch");
      }
      return parseDimensionCoverageFeedbackView(
        input,
        options.answerBlocks ?? [],
        options.frozenEvidenceState,
        options.verifiedPrefixProjection
      );
    }
    if (input.schemaVersion === FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION) {
      return parseEvidenceLimitedFeedbackView(
        input,
        options.evidenceTurns,
        options.scoreWithheldReason ?? "rubric_coverage"
      );
    }
    return parseV2Feedback(input, options.evidenceTurns);
  } catch {
    return { kind: "invalid", reason: "incompatible_or_corrupt" };
  }
}

/**
 * Rebuild the strict internal Feedback v2 contract from bounded persistence
 * fields and canonical transcript evidence. Unlike the customer presenter,
 * this retains validated stored practice-suggestion strings because the
 * deterministic recommendation contract requires the complete v2 shape.
 */
export function parsePersistedFeedbackV2(
  input: PersistedCompletedFeedback,
  options: PresentCompletedFeedbackOptions
): FeedbackV2Result {
  requireExact(input.schemaVersion, FEEDBACK_SCHEMA_VERSION);
  requireExact(input.promptVersion, FEEDBACK_PROMPT_VERSION);
  requireExact(input.rubricVersion, FEEDBACK_RUBRIC_VERSION);
  const evaluationState = requireEvaluationState(input.evaluationState);
  const scores = parseScores(input);
  const evidenceByTurn = parseCanonicalEvidenceTurns(options.evidenceTurns);
  const strengths = parseV2Items(input.strengths, "strengths", evidenceByTurn);
  const improvements = parseV2Items(
    input.improvements,
    "improvements",
    evidenceByTurn
  );
  requireUniqueEvidence([...strengths, ...improvements]);
  const drills = parseStringArray(
    input.drills,
    1,
    3,
    FEEDBACK_READ_LIMITS.storedPracticeSuggestion
  );

  // Validate the row-level provenance fields even though they do not cross the
  // provider-neutral Feedback v2 return contract.
  requireBoundedString(input.id, FEEDBACK_READ_LIMITS.identifier);
  requireBoundedString(input.sessionId, FEEDBACK_READ_LIMITS.identifier);
  requireDateString(input.createdAt);

  return {
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    modelVersion: requireBoundedString(
      input.modelVersion,
      FEEDBACK_READ_LIMITS.modelVersion
    ),
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState,
    scores: {
      structure: scores.structure,
      clarity: scores.clarity,
      insight: scores.insight,
      communication: scores.communication,
      leadership: scores.leadership,
    },
    overallScore: scores.overall,
    strengths,
    improvements,
    drills,
    summary: requireBoundedString(input.summary, FEEDBACK_READ_LIMITS.summary),
  };
}

export function toFeedbackViewState(
  response: FeedbackLifecycleResponse
): FeedbackViewState {
  switch (response.status) {
    case "missing":
      return {
        kind: "missing",
        retryable: true,
        ...(response.message ? { message: response.message } : {}),
      };
    case "session_not_ended":
      return {
        kind: "session-active",
        ...(response.message ? { message: response.message } : {}),
      };
    case "settling":
      return {
        kind: "settling",
        retryable: response.retryable,
        delayed: response.delayed === true,
        ...(response.message ? { message: response.message } : {}),
      };
    case "pending":
      return {
        kind: "pending",
        retryable: response.retryable,
        delayed: response.delayed === true,
      };
    case "processing":
      return {
        kind: "processing",
        retryable: response.retryable,
        delayed: response.delayed === true,
      };
    case "dispatch_failed":
      return {
        kind: "dispatch-failed",
        retryable: response.retryable,
        message: response.message,
        outcomeReason: response.outcomeReason,
      };
    case "failed":
      return response.retryable
        ? {
            kind: "failed-retryable",
            message: response.message,
            outcomeReason: response.outcomeReason,
          }
        : {
            kind: "failed-terminal",
            message: response.message,
            outcomeReason: response.outcomeReason,
          };
    case "skipped":
      return response.details.scoreWithheldReason ===
        "verified_evidence_integrity"
        ? {
            kind: "transcript-integrity-degraded",
            retryable: response.retryable,
            details: response.details,
          }
        : { kind: "no-reviewable-answer", details: response.details };
    case "completed":
      if (response.feedback.kind === "invalid") {
        return { kind: "completed-invalid" };
      }
      if (response.feedback.kind === "dimension-coverage") {
        if (response.feedback.mode === "full_scorecard") {
          return {
            kind: "completed-full-scorecard",
            feedback: response.feedback,
          };
        }
        if (response.feedback.mode === "partial_scorecard") {
          return {
            kind: "completed-partial-scorecard",
            feedback: response.feedback,
          };
        }
        return {
          kind: "completed-coaching-review",
          feedback: response.feedback,
        };
      }
      if (response.feedback.kind === "legacy") {
        return { kind: "completed-legacy", feedback: response.feedback };
      }
      if (response.feedback.kind === "evidence-limited") {
        return {
          kind: "completed-evidence-limited",
          feedback: response.feedback,
        };
      }
      return response.feedback.evaluationState === "partial"
        ? { kind: "completed-partial", feedback: response.feedback }
        : { kind: "completed-full", feedback: response.feedback };
    default:
      return {
        kind: "unavailable",
        message: "Feedback returned an unsupported response.",
      };
  }
}

/** Decode the untrusted JSON returned by the feedback lifecycle API. */
export function decodeFeedbackLifecycleResponse(
  value: unknown
): FeedbackLifecycleResponse | null {
  if (!isRecord(value) || typeof value.status !== "string") return null;
  const workspace = decodeOptionalSavedInterviewWorkspace(value.workspace);
  if (workspace === null) return null;
  const workspaceField = workspace ? { workspace } : {};
  switch (value.status) {
    case "missing":
      return value.retryable === true && isOptionalString(value.message)
        ? {
            status: "missing",
            retryable: true,
            ...(value.message ? { message: value.message } : {}),
            ...workspaceField,
          }
        : null;
    case "session_not_ended":
      return value.retryable === false && isOptionalString(value.message)
        ? {
            status: "session_not_ended",
            retryable: false,
            ...(value.message ? { message: value.message } : {}),
            ...workspaceField,
          }
        : null;
    case "settling":
      return typeof value.retryable === "boolean" &&
        isOptionalBoolean(value.delayed) &&
        isOptionalString(value.message)
        ? {
            status: "settling",
            retryable: value.retryable,
            ...(value.delayed !== undefined ? { delayed: value.delayed } : {}),
            ...(value.message ? { message: value.message } : {}),
            ...workspaceField,
          }
        : null;
    case "pending":
    case "processing":
      return typeof value.retryable === "boolean" &&
        isOptionalBoolean(value.delayed) &&
        isOptionalNonNegativeNumber(value.estimatedTimeRemaining)
        ? {
            status: value.status,
            retryable: value.retryable,
            ...(value.delayed !== undefined ? { delayed: value.delayed } : {}),
            ...(value.estimatedTimeRemaining !== undefined
              ? { estimatedTimeRemaining: value.estimatedTimeRemaining }
              : {}),
            ...workspaceField,
          }
        : null;
    case "dispatch_failed":
      return typeof value.retryable === "boolean" &&
        isBoundedString(value.message, FEEDBACK_READ_LIMITS.summary) &&
        value.outcomeReason === "dispatch_failed"
        ? {
            status: "dispatch_failed",
            retryable: value.retryable,
            message: value.message,
            outcomeReason: "dispatch_failed",
            ...workspaceField,
          }
        : null;
    case "failed":
      return typeof value.retryable === "boolean" &&
        isBoundedString(value.message, FEEDBACK_READ_LIMITS.summary) &&
        value.outcomeReason === "generation_failed"
        ? {
            status: "failed",
            retryable: value.retryable,
            message: value.message,
            outcomeReason: "generation_failed",
            ...workspaceField,
          }
        : null;
    case "skipped": {
      const details = decodeSkippedDetails(value.details);
      if (typeof value.retryable !== "boolean" || !details) return null;
      const recoveryMatchesRetryability =
        details.recovery === "review_recovery_available"
          ? value.retryable === true
          : value.retryable === false;
      return recoveryMatchesRetryability
        ? {
            status: "skipped",
            retryable: value.retryable,
            details,
            ...workspaceField,
          }
        : null;
    }
    case "completed": {
      const feedback = decodeCompletedFeedbackView(value.feedback);
      return value.retryable === false && feedback
        ? { status: "completed", retryable: false, feedback, ...workspaceField }
        : null;
    }
    default:
      return null;
  }
}

function decodeOptionalSavedInterviewWorkspace(
  value: unknown
): SavedInterviewWorkspace | undefined | null {
  if (value === undefined) return undefined;
  return decodeSavedInterviewWorkspace(value);
}

function decodeSkippedDetails(value: unknown): SkippedFeedbackDetails | null {
  if (!isRecord(value)) return null;
  if (value.outcome !== "unable_to_review") return null;
  if (!isFeedbackScoreWithheldReason(value.scoreWithheldReason)) return null;
  const expectedRecovery =
    value.scoreWithheldReason === "rubric_coverage"
      ? value.recovery === "start_another_interview"
      : value.recovery === "credit_returned" ||
        value.recovery === "credit_recovery_in_progress" ||
        value.recovery === "review_recovery_available" ||
        value.recovery === null;
  if (!expectedRecovery) return null;
  if (
    Object.keys(value).some(
      (key) => !["outcome", "scoreWithheldReason", "recovery"].includes(key)
    )
  ) {
    return null;
  }
  const recovery = value.recovery as SkippedFeedbackDetails["recovery"];
  return {
    outcome: "unable_to_review",
    scoreWithheldReason: value.scoreWithheldReason,
    recovery,
  };
}

function decodeCompletedFeedbackView(
  value: unknown
): CompletedFeedbackView | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "invalid") {
    return value.reason === "incompatible_or_corrupt"
      ? { kind: "invalid", reason: "incompatible_or_corrupt" }
      : null;
  }
  if (value.kind === "evidence-limited") {
    const valid =
      isCompletedFeedbackIdentityBase(value) &&
      value.presentationVersion === FEEDBACK_REVIEW_PRESENTATION_VERSION &&
      isFeedbackScoreWithheldReason(value.scoreWithheldReason) &&
      isEvidenceLimitedFindingViewArray(value.strengths, "strength") &&
      isEvidenceLimitedFindingViewArray(value.improvements, "improvement", 1) &&
      hasUniqueEvidenceLimitedFindingIdentities(
        value.strengths,
        value.improvements
      ) &&
      isEvidenceLimitedPracticeFocusView(value.prioritizedPracticeFocus);
    if (!valid) return null;
    const focus = value.prioritizedPracticeFocus as Record<string, unknown>;
    return (value.improvements as unknown[]).some(
      (improvement) =>
        isRecord(improvement) &&
        improvement.dimension === focus.dimension &&
        improvement.observation === focus.title &&
        improvement.nextStep === focus.guidance &&
        improvement.citation === focus.citation &&
        improvement.transcriptRef === focus.transcriptRef
    )
      ? (value as unknown as FeedbackEvidenceLimitedView)
      : null;
  }
  if (value.kind === "dimension-coverage") {
    return isCompletedFeedbackIdentityBase(value) &&
      isDimensionCoverageFeedbackView(value)
      ? (value as unknown as FeedbackDimensionCoverageView)
      : null;
  }
  if (!isCompletedFeedbackBase(value)) return null;
  if (value.kind === "legacy") {
    return value.rubricVersion === LEGACY_FEEDBACK_RUBRIC_VERSION &&
      isBoundedStringArray(
        value.strengths,
        10,
        FEEDBACK_READ_LIMITS.legacyNote,
        1
      ) &&
      isBoundedStringArray(
        value.improvements,
        10,
        FEEDBACK_READ_LIMITS.legacyNote,
        1
      )
      ? (value as unknown as FeedbackLegacyView)
      : null;
  }
  if (value.kind !== "v2") return null;
  if (
    value.schemaVersion !== FEEDBACK_SCHEMA_VERSION ||
    value.promptVersion !== FEEDBACK_PROMPT_VERSION ||
    value.rubricVersion !== FEEDBACK_RUBRIC_VERSION ||
    !isBoundedString(value.modelVersion, FEEDBACK_READ_LIMITS.modelVersion) ||
    (value.evaluationState !== "full" && value.evaluationState !== "partial") ||
    !isFeedbackFindingArray(value.strengths) ||
    !isFeedbackFindingArray(value.improvements) ||
    !hasCanonicalV2Overall(value.scores)
  ) {
    return null;
  }
  return value as unknown as FeedbackV2View;
}

function isDimensionCoverageFeedbackView(
  value: Record<string, unknown>
): boolean {
  if (
    value.presentationVersion !== FEEDBACK_REVIEW_PRESENTATION_VERSION ||
    (value.mode !== "full_scorecard" &&
      value.mode !== "partial_scorecard" &&
      value.mode !== "coaching_review") ||
    !isRecord(value.dimensions)
  ) {
    return false;
  }
  const dimensions = value.dimensions;
  const verifiedScope = value.verifiedScope;
  if (
    verifiedScope !== null &&
    (!isRecord(verifiedScope) ||
      verifiedScope.kind !== "verified_prefix" ||
      !Number.isSafeInteger(verifiedScope.reviewedAnswerCount) ||
      (verifiedScope.reviewedAnswerCount as number) <= 0 ||
      (verifiedScope.reviewedAnswerCount as number) > 1_000 ||
      typeof verifiedScope.excludedTail !== "boolean" ||
      Object.keys(verifiedScope).length !== 3)
  ) {
    return false;
  }
  if (
    Object.keys(dimensions).length !== FEEDBACK_DIMENSIONS.length ||
    FEEDBACK_DIMENSIONS.some((dimension) => !(dimension in dimensions))
  ) {
    return false;
  }
  let sufficientCount = 0;
  const numericScores: Partial<Record<FeedbackDimension, number>> = {};
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const candidate = dimensions[dimension];
    if (!isRecord(candidate) || !Array.isArray(candidate.evidence))
      return false;
    const expectedCount =
      candidate.coverage === "absent"
        ? 0
        : candidate.coverage === "partial"
          ? 1
          : candidate.coverage === "sufficient"
            ? 2
            : -1;
    if (candidate.evidence.length !== expectedCount) return false;
    const facets = new Set<string>();
    for (const item of candidate.evidence) {
      if (
        !isRecord(item) ||
        !isBoundedString(item.label, 256) ||
        !isBoundedString(item.citation, 32_000) ||
        !isBoundedString(
          item.transcriptRef,
          FEEDBACK_READ_LIMITS.evidenceTurnIdentifier
        ) ||
        facets.has(item.label)
      ) {
        return false;
      }
      facets.add(item.label);
    }
    if (candidate.coverage === "sufficient") sufficientCount += 1;
    if (candidate.score !== null) {
      if (!isDimensionScore(candidate.score)) return false;
      numericScores[dimension] = candidate.score as number;
    }
    if (
      value.mode !== "coaching_review" &&
      (candidate.coverage === "sufficient") !== (candidate.score !== null)
    ) {
      return false;
    }
    if (value.mode === "coaching_review" && candidate.score !== null) {
      return false;
    }
  }
  if (value.mode === "full_scorecard") {
    if (
      !(
        sufficientCount === FEEDBACK_DIMENSIONS.length &&
        isScore(value.overallScore) &&
        calculateOverallScore(
          numericScores as Record<FeedbackDimension, number>
        ) === (value.overallScore as number)
      ) ||
      value.scoreWithheldReason !== null ||
      verifiedScope !== null
    ) {
      return false;
    }
  } else {
    if (value.overallScore !== null) {
      return false;
    }
    if (
      value.mode === "partial_scorecard" &&
      (sufficientCount === 0 ||
        (sufficientCount === FEEDBACK_DIMENSIONS.length &&
          verifiedScope === null) ||
        value.scoreWithheldReason !== "rubric_coverage")
    ) {
      return false;
    }
    if (
      value.mode === "coaching_review" &&
      !isFeedbackScoreWithheldReason(value.scoreWithheldReason)
    ) {
      return false;
    }
  }

  const expectedCoaching = buildDimensionCoverageCoachingPresentation(
    dimensions as FeedbackDimensionResultsView,
    value.mode as DimensionCoverageFeedbackMode
  );
  return (
    sameJson(value.coachingSignals, expectedCoaching.signals) &&
    sameJson(value.prioritizedPracticeFocus, expectedCoaching.practiceFocus)
  );
}

function isCompletedFeedbackIdentityBase(
  value: Record<string, unknown>
): boolean {
  return (
    isBoundedString(value.id, FEEDBACK_READ_LIMITS.identifier) &&
    isBoundedString(value.sessionId, FEEDBACK_READ_LIMITS.identifier) &&
    isBoundedString(value.summary, FEEDBACK_READ_LIMITS.summary) &&
    isCanonicalDateString(value.createdAt) &&
    value.nextPracticeRecommendation === null
  );
}

function isCompletedFeedbackBase(value: Record<string, unknown>): boolean {
  return (
    isCompletedFeedbackIdentityBase(value) && isFeedbackScoreView(value.scores)
  );
}

function isFeedbackScoreView(value: unknown): value is FeedbackScoreView {
  if (!isRecord(value)) return false;
  return (
    [
      value.structure,
      value.clarity,
      value.insight,
      value.communication,
      value.leadership,
    ].every(isDimensionScore) && isScore(value.overall)
  );
}

function hasCanonicalV2Overall(value: unknown): boolean {
  if (!isFeedbackScoreView(value)) return false;
  return (
    calculateOverallScore({
      structure: value.structure,
      clarity: value.clarity,
      insight: value.insight,
      communication: value.communication,
      leadership: value.leadership,
    }) === value.overall
  );
}

function isDimensionScore(value: unknown): boolean {
  return Number.isInteger(value) && isScore(value);
}

function isFeedbackFindingArray(
  value: unknown,
  minimum = 1
): value is FeedbackV2Item[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= 5 &&
    value.every((entry) => {
      if (!isRecord(entry)) return false;
      return (
        typeof entry.dimension === "string" &&
        DIMENSIONS.has(entry.dimension as FeedbackDimension) &&
        isBoundedString(entry.observation, FEEDBACK_READ_LIMITS.findingText) &&
        isBoundedString(entry.nextStep, FEEDBACK_READ_LIMITS.findingText) &&
        entry.rubricVersion === FEEDBACK_RUBRIC_VERSION &&
        typeof entry.confidence === "number" &&
        Number.isFinite(entry.confidence) &&
        entry.confidence >= 0 &&
        entry.confidence <= 1 &&
        isBoundedStringArray(
          entry.transcriptRefs,
          5,
          FEEDBACK_READ_LIMITS.evidenceTurnIdentifier,
          1
        ) &&
        Array.isArray(entry.evidence) &&
        entry.evidence.length >= 1 &&
        entry.evidence.length <= 5 &&
        entry.evidence.every(
          (evidence) =>
            isRecord(evidence) &&
            isBoundedString(
              evidence.turnRef,
              FEEDBACK_READ_LIMITS.evidenceTurnIdentifier
            ) &&
            isBoundedString(evidence.quote, FEEDBACK_READ_LIMITS.evidenceQuote)
        )
      );
    })
  );
}

function isOptionalString(value: unknown): value is string | undefined {
  return (
    value === undefined || isBoundedString(value, FEEDBACK_READ_LIMITS.summary)
  );
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isOptionalNonNegativeNumber(
  value: unknown
): value is number | undefined {
  return value === undefined || isNonNegativeFiniteNumber(value);
}

function isBoundedStringArray(
  value: unknown,
  maximum: number,
  itemLimit: number,
  minimum = 0
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.every((entry) => isBoundedString(entry, itemLimit))
  );
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScore(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10
  );
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isCanonicalDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function getFeedbackConfidenceLabel(
  confidence: number
): "Strong evidence" | "Moderate evidence" | "Limited evidence" {
  if (confidence >= 0.8) return "Strong evidence";
  if (confidence >= 0.6) return "Moderate evidence";
  return "Limited evidence";
}

function parseV2Feedback(
  input: PersistedCompletedFeedback,
  evidenceTurns: readonly PersistedFeedbackEvidenceTurn[]
): FeedbackV2View {
  const feedback = parsePersistedFeedbackV2(input, { evidenceTurns });

  return {
    kind: "v2",
    id: requireBoundedString(input.id, FEEDBACK_READ_LIMITS.identifier),
    sessionId: requireBoundedString(
      input.sessionId,
      FEEDBACK_READ_LIMITS.identifier
    ),
    scores: { ...feedback.scores, overall: feedback.overallScore },
    strengths: feedback.strengths,
    improvements: feedback.improvements,
    summary: feedback.summary,
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    modelVersion: feedback.modelVersion,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: feedback.evaluationState,
    createdAt: requireDateString(input.createdAt),
    nextPracticeRecommendation: null,
  };
}

function parseDimensionCoverageFeedbackView(
  input: PersistedCompletedFeedback,
  answerBlocks: readonly CandidateAnswerBlock[],
  frozenEvidenceState: "complete" | "partial",
  verifiedPrefixProjection?: TrustedAnswerBlockProjection
): FeedbackDimensionCoverageView {
  const overallScore =
    input.overallScore === null
      ? null
      : requireNumberInRange(input.overallScore);
  const feedback = parsePersistedDimensionCoverageFeedback(
    {
      schemaVersion: input.schemaVersion,
      promptVersion: input.promptVersion,
      rubricVersion: input.rubricVersion,
      modelVersion: input.modelVersion,
      roundType: input.feedbackRoundType,
      evaluationState: input.evaluationState,
      mode: input.feedbackMode,
      dimensions: input.dimensionCoverage,
      overallScore,
      summary: input.summary,
      ...(input.schemaVersion === FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION
        ? { verifiedPrefixScope: input.verifiedPrefixScope }
        : {}),
    },
    {
      answerBlocks,
      allowNumericalScores:
        input.schemaVersion === FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION
          ? input.feedbackMode !== "coaching_review"
          : frozenEvidenceState === "complete",
      ...(verifiedPrefixProjection ? { verifiedPrefixProjection } : {}),
    }
  );
  const persistedScores: Record<FeedbackDimension, unknown> = {
    structure: input.structureScore,
    clarity: input.clarityScore,
    insight: input.insightScore,
    communication: input.communicationScore,
    leadership: input.leadershipScore,
  };
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const persisted =
      persistedScores[dimension] === null
        ? null
        : requireScore(persistedScores[dimension]);
    if (persisted !== feedback.dimensions[dimension].score) {
      throw new Error("dimension score mismatch");
    }
  }
  const isVerifiedPrefix =
    feedback.schemaVersion === FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION;
  const scoreWithheldReason: FeedbackScoreWithheldReason | null =
    feedback.mode === "full_scorecard"
      ? null
      : feedback.mode === "partial_scorecard"
        ? "rubric_coverage"
        : isVerifiedPrefix
          ? "rubric_coverage"
          : frozenEvidenceState === "partial"
            ? "verified_evidence_integrity"
            : "rubric_coverage";
  const dimensions = toDimensionResultsView(feedback.dimensions, answerBlocks);
  const coaching = buildDimensionCoverageCoachingPresentation(
    dimensions,
    feedback.mode,
    selectDimensionCoveragePracticeFocus(feedback),
    answerBlocks
  );
  return {
    kind: "dimension-coverage",
    id: requireBoundedString(input.id, FEEDBACK_READ_LIMITS.identifier),
    sessionId: requireBoundedString(
      input.sessionId,
      FEEDBACK_READ_LIMITS.identifier
    ),
    summary: feedback.summary,
    presentationVersion: FEEDBACK_REVIEW_PRESENTATION_VERSION,
    mode: feedback.mode,
    dimensions,
    overallScore: feedback.overallScore,
    scoreWithheldReason,
    coachingSignals: coaching.signals,
    prioritizedPracticeFocus: coaching.practiceFocus,
    verifiedScope: isVerifiedPrefix
      ? {
          kind: "verified_prefix",
          reviewedAnswerCount:
            feedback.verifiedPrefixScope.trustedBlockIdentities.length,
          excludedTail: true,
        }
      : null,
    createdAt: requireDateString(input.createdAt),
    nextPracticeRecommendation: null,
  };
}

function parseEvidenceLimitedFeedbackView(
  input: PersistedCompletedFeedback,
  evidenceTurns: readonly PersistedFeedbackEvidenceTurn[],
  scoreWithheldReason: FeedbackScoreWithheldReason
): FeedbackEvidenceLimitedView {
  const transcript = [...parseCanonicalEvidenceTurns(evidenceTurns)].map(
    ([eventId, text]) => ({ eventId, speaker: "user" as const, text })
  );
  const feedback: EvidenceLimitedFeedbackResult =
    parsePersistedEvidenceLimitedFeedback(
      {
        schemaVersion: input.schemaVersion,
        promptVersion: input.promptVersion,
        rubricVersion: input.rubricVersion,
        evaluationState: input.evaluationState,
        strengths: input.strengths,
        improvements: input.improvements,
        summary: input.summary,
      },
      {
        transcript,
        modelVersion: requireBoundedString(
          input.modelVersion,
          FEEDBACK_READ_LIMITS.modelVersion
        ),
      }
    );
  return {
    kind: "evidence-limited",
    id: requireBoundedString(input.id, FEEDBACK_READ_LIMITS.identifier),
    sessionId: requireBoundedString(
      input.sessionId,
      FEEDBACK_READ_LIMITS.identifier
    ),
    summary: feedback.summary,
    strengths: feedback.strengths.map(toEvidenceLimitedFindingView),
    improvements: feedback.improvements.map(toEvidenceLimitedFindingView),
    scoreWithheldReason:
      requireFeedbackScoreWithheldReason(scoreWithheldReason),
    prioritizedPracticeFocus: toEvidenceLimitedPracticeFocusView(
      selectEvidenceLimitedPracticeFocus(feedback.improvements)
    ),
    presentationVersion: FEEDBACK_REVIEW_PRESENTATION_VERSION,
    createdAt: requireDateString(input.createdAt),
    nextPracticeRecommendation: null,
  };
}

function toDimensionResultsView(
  dimensions: DimensionCoverageResultDimensions,
  answerBlocks: readonly CandidateAnswerBlock[]
): FeedbackDimensionResultsView {
  const blockById = new Map(
    answerBlocks.map((block) => [block.answerBlockId, block])
  );
  const result = {} as FeedbackDimensionResultsView;
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const source = dimensions[dimension];
    result[dimension] = {
      coverage: source.coverage,
      score: source.score,
      evidence: source.evidence.map((evidence) => {
        const block = blockById.get(evidence.answerBlockRef);
        const transcriptRef = block?.response[0]?.eventId;
        if (!transcriptRef || block.responseText !== evidence.evidenceText) {
          throw new Error("dimension evidence presentation mismatch");
        }
        return {
          label: evidence.facetLabel,
          citation: evidence.evidenceText,
          transcriptRef,
        };
      }),
    };
  }
  return result;
}

function buildDimensionCoverageCoachingPresentation(
  dimensions: FeedbackDimensionResultsView,
  mode: DimensionCoverageFeedbackMode,
  selectedSource?: DimensionCoveragePracticeFocusSource | null,
  answerBlocks: readonly CandidateAnswerBlock[] = []
): {
  signals: FeedbackCoachingSignalView[];
  practiceFocus: FeedbackPracticeFocusView | null;
} {
  if (mode !== "coaching_review") {
    return { signals: [], practiceFocus: null };
  }

  const signals = FEEDBACK_DIMENSIONS.flatMap((dimension) =>
    dimensions[dimension].evidence.map((evidence) => ({
      dimension,
      label: evidence.label,
      citation: evidence.citation,
      transcriptRef: evidence.transcriptRef,
      evidenceSupport: "exact_candidate_citation" as const,
    }))
  ).slice(0, 3);
  const selectedBlock = selectedSource
    ? answerBlocks.find(
        (block) => block.answerBlockId === selectedSource.answerBlockRef
      )
    : null;
  const selectedTranscriptRef = selectedBlock?.response[0]?.eventId;
  const exactSelectedEvidence =
    selectedSource &&
    selectedTranscriptRef &&
    selectedBlock.responseText === selectedSource.evidenceText
      ? {
          label: selectedSource.facetLabel,
          citation: selectedSource.evidenceText,
          transcriptRef: selectedTranscriptRef,
        }
      : null;
  const selectedEvidence = selectedSource ? exactSelectedEvidence : signals[0];
  const selectedDimension = selectedSource?.dimension ?? signals[0]?.dimension;
  const selectedTitle = selectedSource?.facetLabel ?? signals[0]?.label;
  if (!selectedDimension || !selectedTitle || !selectedEvidence) {
    throw new Error("coaching presentation requires grounded evidence");
  }

  return {
    signals,
    practiceFocus: {
      dimension: selectedDimension,
      title: selectedTitle,
      guidance:
        "Practice stating this PM-rubric move in one clear sentence, then connect it to your next decision.",
      rationale:
        "This focus comes from one exact citation in this interview. It was not selected from a weakest score.",
      citation: selectedEvidence.citation,
      transcriptRef: selectedEvidence.transcriptRef,
    },
  };
}

function toEvidenceLimitedFindingView(
  finding: EvidenceLimitedStrengthItem | EvidenceLimitedImprovementItem
): FeedbackEvidenceLimitedFindingView {
  const evidence = finding.evidence[0];
  if (!evidence || finding.evidence.length !== 1) {
    throw new Error("coaching finding requires one exact citation");
  }
  return {
    dimension: finding.dimension,
    observation: finding.observation,
    citation: evidence.quote,
    transcriptRef: evidence.turnRef,
    nextStep: finding.nextStep,
    evidenceSupport: "exact_candidate_citation",
  };
}

function toEvidenceLimitedPracticeFocusView(
  finding: EvidenceLimitedImprovementItem
): FeedbackEvidenceLimitedPracticeFocusView {
  const view = toEvidenceLimitedFindingView(finding);
  return {
    dimension: view.dimension,
    title: view.observation,
    guidance: view.nextStep,
    citation: view.citation,
    transcriptRef: view.transcriptRef,
  };
}

function isEvidenceLimitedFindingViewArray(
  value: unknown,
  kind: "strength" | "improvement",
  min = 0
): value is FeedbackEvidenceLimitedFindingView[] {
  const signals =
    kind === "strength"
      ? Object.values(EVIDENCE_LIMITED_STRENGTH_SIGNALS)
      : Object.values(EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS);
  const actions = Object.values(EVIDENCE_LIMITED_ACTIONS);
  const transcriptRefs = new Set<string>();
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= 3 &&
    value.every((finding) => {
      if (
        !isRecord(finding) ||
        !DIMENSIONS.has(finding.dimension as FeedbackDimension) ||
        !isBoundedString(
          finding.observation,
          FEEDBACK_READ_LIMITS.findingText
        ) ||
        !isBoundedString(
          finding.citation,
          FEEDBACK_READ_LIMITS.evidenceQuote
        ) ||
        !isBoundedString(
          finding.transcriptRef,
          FEEDBACK_READ_LIMITS.evidenceTurnIdentifier
        ) ||
        !isBoundedString(finding.nextStep, FEEDBACK_READ_LIMITS.findingText) ||
        finding.evidenceSupport !== "exact_candidate_citation"
      ) {
        return false;
      }
      const signal = signals.find(
        (candidate) =>
          candidate.dimension === finding.dimension &&
          candidate.observation === finding.observation
      );
      const action = actions.find(
        (candidate) =>
          candidate.dimension === finding.dimension &&
          candidate.nextStep === finding.nextStep
      );
      if (transcriptRefs.has(finding.transcriptRef)) return false;
      transcriptRefs.add(finding.transcriptRef);
      return signal !== undefined && action !== undefined;
    })
  );
}

function hasUniqueEvidenceLimitedFindingIdentities(
  strengths: unknown,
  improvements: unknown
): boolean {
  if (!Array.isArray(strengths) || !Array.isArray(improvements)) return false;
  const findings = [...strengths, ...improvements];
  const observations = new Set<string>();
  const nextSteps = new Set<string>();
  for (const finding of findings) {
    if (!isRecord(finding)) return false;
    const observation = finding.observation as string;
    const nextStep = finding.nextStep as string;
    if (observations.has(observation) || nextSteps.has(nextStep)) {
      return false;
    }
    observations.add(observation);
    nextSteps.add(nextStep);
  }
  return true;
}

function isEvidenceLimitedPracticeFocusView(
  value: unknown
): value is FeedbackEvidenceLimitedPracticeFocusView {
  return (
    isRecord(value) &&
    DIMENSIONS.has(value.dimension as FeedbackDimension) &&
    isBoundedString(value.title, FEEDBACK_READ_LIMITS.findingText) &&
    isBoundedString(value.guidance, FEEDBACK_READ_LIMITS.findingText) &&
    isBoundedString(value.citation, FEEDBACK_READ_LIMITS.evidenceQuote) &&
    isBoundedString(
      value.transcriptRef,
      FEEDBACK_READ_LIMITS.evidenceTurnIdentifier
    )
  );
}

function isFeedbackScoreWithheldReason(
  value: unknown
): value is FeedbackScoreWithheldReason {
  return value === "rubric_coverage" || value === "verified_evidence_integrity";
}

function requireFeedbackScoreWithheldReason(
  value: unknown
): FeedbackScoreWithheldReason {
  if (!isFeedbackScoreWithheldReason(value)) {
    throw new Error("invalid score-withheld reason");
  }
  return value;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseLegacyFeedback(
  input: PersistedCompletedFeedback
): FeedbackLegacyView {
  requireExact(input.rubricVersion, LEGACY_FEEDBACK_RUBRIC_VERSION);
  const scores = parseLegacyScores(input);
  // Historical suggestions are validated as persisted input but never cross
  // the customer read boundary.
  parseStringArray(
    input.drills,
    0,
    5,
    FEEDBACK_READ_LIMITS.storedPracticeSuggestion
  );
  return {
    kind: "legacy",
    id: requireBoundedString(input.id, FEEDBACK_READ_LIMITS.identifier),
    sessionId: requireBoundedString(
      input.sessionId,
      FEEDBACK_READ_LIMITS.identifier
    ),
    scores,
    strengths: parseLegacyItems(input.strengths, "strengths"),
    improvements: parseLegacyItems(input.improvements, "improvements"),
    summary: requireBoundedString(input.summary, FEEDBACK_READ_LIMITS.summary),
    rubricVersion: LEGACY_FEEDBACK_RUBRIC_VERSION,
    createdAt: requireDateString(input.createdAt),
    nextPracticeRecommendation: null,
  };
}

function parseLegacyScores(
  input: PersistedCompletedFeedback
): FeedbackScoreView {
  return {
    structure: requireScore(input.structureScore),
    clarity: requireScore(input.clarityScore),
    insight: requireScore(input.insightScore),
    communication: requireScore(input.communicationScore),
    leadership: requireScore(input.leadershipScore),
    // Historical writes stored a separately model-authored overall score.
    // Preserve it as historical data instead of applying the v2 weighting.
    overall: requireNumberInRange(input.overallScore),
  };
}

function parseScores(input: PersistedCompletedFeedback): FeedbackScoreView {
  const dimensionScores: FeedbackV2Scores = {
    structure: requireScore(input.structureScore),
    clarity: requireScore(input.clarityScore),
    insight: requireScore(input.insightScore),
    communication: requireScore(input.communicationScore),
    leadership: requireScore(input.leadershipScore),
  };
  const calculatedOverall = calculateOverallScore(dimensionScores);
  const storedOverall = requireNumberInRange(input.overallScore);
  if (storedOverall !== calculatedOverall) throw new Error("score mismatch");
  return { ...dimensionScores, overall: calculatedOverall };
}

function parseV2Items(
  value: unknown,
  path: string,
  evidenceByTurn: ReadonlyMap<string, string>
): FeedbackV2Item[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    throw new Error(`${path} is invalid`);
  }
  return value.map((entry) => {
    const item = requireRecord(entry);
    requireExactKeys(item, [
      "dimension",
      "observation",
      "transcriptRefs",
      "evidence",
      "nextStep",
      "rubricVersion",
      "confidence",
    ]);
    if (
      typeof item.dimension !== "string" ||
      !DIMENSIONS.has(item.dimension as FeedbackDimension)
    ) {
      throw new Error("dimension is invalid");
    }
    requireExact(item.rubricVersion, FEEDBACK_RUBRIC_VERSION);
    const transcriptRefs = parseStringArray(
      item.transcriptRefs,
      1,
      5,
      FEEDBACK_READ_LIMITS.evidenceTurnIdentifier
    );
    if (new Set(transcriptRefs).size !== transcriptRefs.length) {
      throw new Error("duplicate transcript reference");
    }
    const evidence = parseEvidence(item.evidence, evidenceByTurn);
    const evidenceRefs = new Set(evidence.map((entry) => entry.turnRef));
    if (
      evidenceRefs.size !== transcriptRefs.length ||
      transcriptRefs.some((reference) => !evidenceRefs.has(reference))
    ) {
      throw new Error("evidence references do not match");
    }
    return {
      dimension: item.dimension as FeedbackDimension,
      observation: requireBoundedString(
        item.observation,
        FEEDBACK_READ_LIMITS.findingText
      ),
      transcriptRefs,
      evidence,
      nextStep: requireBoundedString(
        item.nextStep,
        FEEDBACK_READ_LIMITS.findingText
      ),
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      confidence: requireConfidence(item.confidence),
    };
  });
}

function parseEvidence(
  value: unknown,
  evidenceByTurn: ReadonlyMap<string, string>
): FeedbackEvidence[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    throw new Error("evidence is invalid");
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    const record = requireRecord(entry);
    requireExactKeys(record, ["turnRef", "quote"]);
    const turnRef = requireBoundedString(
      record.turnRef,
      FEEDBACK_READ_LIMITS.evidenceTurnIdentifier
    );
    if (seen.has(turnRef)) throw new Error("duplicate evidence reference");
    seen.add(turnRef);
    const quote = requireBoundedString(
      record.quote,
      FEEDBACK_READ_LIMITS.evidenceQuote
    );
    const source = evidenceByTurn.get(turnRef);
    if (source === undefined || !source.includes(quote)) {
      throw new Error("evidence is not grounded in canonical user speech");
    }
    return { turnRef, quote };
  });
}

function parseCanonicalEvidenceTurns(
  turns: readonly PersistedFeedbackEvidenceTurn[]
): ReadonlyMap<string, string> {
  if (turns.length === 0 || turns.length > MAX_PERSISTED_EVIDENCE_TURNS) {
    throw new Error("canonical evidence transcript is invalid");
  }
  const prepared = prepareFeedbackTranscript(
    turns.map((turn) => ({
      eventId: typeof turn.eventId === "string" ? turn.eventId : null,
      speaker: typeof turn.speaker === "string" ? turn.speaker : "",
      text: typeof turn.text === "string" ? turn.text : null,
      contractVersion:
        typeof turn.contractVersion === "number" ? turn.contractVersion : null,
    })),
    { requireContractV2: true }
  );
  if (!prepared.eligible) {
    throw new Error("canonical evidence transcript is invalid");
  }
  const evidenceByTurn = new Map<string, string>();
  for (const turn of prepared.transcript) {
    if (turn.speaker !== "user") {
      throw new Error("evidence transcript contains non-user speech");
    }
    evidenceByTurn.set(turn.eventId, turn.text);
  }
  return evidenceByTurn;
}

function requireUniqueEvidence(items: FeedbackV2Item[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    for (const evidence of item.evidence) {
      const identity = `${evidence.turnRef}\u0000${evidence.quote}`;
      if (seen.has(identity)) throw new Error("duplicate evidence");
      seen.add(identity);
    }
  }
}

function parseLegacyItems(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new Error(`${path} is invalid`);
  }
  return value.map((entry) => {
    if (typeof entry === "string") {
      return requireBoundedString(entry, FEEDBACK_READ_LIMITS.legacyNote);
    }
    const record = requireRecord(entry);
    requireExactKeys(record, [
      "dimension",
      "text",
      "evidence_quote",
      "example",
    ]);
    if (
      record.dimension !== undefined &&
      (typeof record.dimension !== "string" ||
        !DIMENSIONS.has(record.dimension as FeedbackDimension))
    ) {
      throw new Error("legacy dimension is invalid");
    }
    for (const optionalText of [record.evidence_quote, record.example]) {
      if (optionalText !== undefined) {
        requireBoundedString(optionalText, FEEDBACK_READ_LIMITS.legacyNote);
      }
    }
    return requireBoundedString(record.text, FEEDBACK_READ_LIMITS.legacyNote);
  });
}

function hasLegacyVersionTuple(input: PersistedCompletedFeedback): boolean {
  return (
    input.schemaVersion === null &&
    input.promptVersion === null &&
    input.modelVersion === null &&
    input.evaluationState === null
  );
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("record is invalid");
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): void {
  const expected = new Set(keys);
  if (Object.keys(value).some((key) => !expected.has(key))) {
    throw new Error("unknown field");
  }
}

function requireExact(value: unknown, expected: string): void {
  if (value !== expected) throw new Error("version mismatch");
}

function requireBoundedString(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximumLength
  ) {
    throw new Error("string is invalid");
  }
  return value;
}

function parseStringArray(
  value: unknown,
  minimum: number,
  maximum: number,
  maximumStringLength: number
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new Error("string array is invalid");
  }
  return value.map((entry) => requireBoundedString(entry, maximumStringLength));
}

function requireScore(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 10
  ) {
    throw new Error("score is invalid");
  }
  return value;
}

function requireNumberInRange(value: unknown): number {
  if (typeof value === "string") {
    if (
      value.length > FEEDBACK_READ_LIMITS.numericString ||
      !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
    ) {
      throw new Error("number string is invalid");
    }
    value = Number(value);
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 10
  ) {
    throw new Error("number is invalid");
  }
  return value;
}

function requireConfidence(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error("confidence is invalid");
  }
  return value;
}

function requireEvaluationState(value: unknown): FeedbackEvaluationState {
  if (value !== "full" && value !== "partial") {
    throw new Error("evaluation state is invalid");
  }
  return value;
}

function requireDateString(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("date is invalid");
    return value.toISOString();
  }
  const source = requireBoundedString(value, 32);
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) throw new Error("date is invalid");
  const canonical = date.toISOString();
  if (source !== canonical) {
    throw new Error("date must be canonical UTC ISO");
  }
  return canonical;
}
