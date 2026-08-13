import type { FeedbackDimension } from "./evaluation";
import {
  EVIDENCE_LIMITED_ACTIONS,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS,
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  type EvidenceLimitedActionCode,
  type EvidenceLimitedImprovementSignalCode,
} from "./feedback-evidence-limited";
import {
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
} from "./feedback-dimension-coverage";
import type { FeedbackScoreWithheldReason } from "./feedback-view-model";
import { FEEDBACK_RUBRIC_VERSION } from "./feedback-v2";
import {
  FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
  FOCUSED_PRACTICE_SELF_REVIEW_VERSION,
  completeFocusedPracticeAttempt,
  parseFocusedPracticeAttempt,
  parseFocusedPracticeCompletionInput,
  type CompletedFocusedPracticeAttempt,
  type FocusedPracticeAttempt,
  type FocusedPracticeAttemptCompletion,
  type FocusedPracticeCompletionInput,
  type FocusedPracticeResponse,
  type FocusedPracticeSelfReview,
  type InProgressFocusedPracticeAttempt,
} from "./focused-practice-attempt";
import {
  FOCUSED_PRACTICE_DIMENSION_ACTION_CODE,
  FOCUSED_PRACTICE_GROUNDED_PLAN_CONTRACT_VERSION,
  buildFocusedPracticeGroundedPlan,
  parseAvailableFocusedPracticeGroundedPlan,
  type AvailableFocusedPracticeGroundedPlan,
} from "./focused-practice-grounded-plan";

export const FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION =
  "focused-practice-attempt.v2" as const;
export const FOCUSED_PRACTICE_SOURCE_FINGERPRINT_VERSION =
  "focused-practice-source-fingerprint.v1" as const;

export type FocusedPracticeGroundedFeedbackVersionSnapshot =
  | {
      schemaVersion: typeof FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION;
      promptVersion: typeof FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION;
      rubricVersion: typeof FEEDBACK_RUBRIC_VERSION;
      modelVersion: string;
      evaluationState: "partial";
      reviewOutcome: "coaching_review";
      scoreWithheldReason: FeedbackScoreWithheldReason;
      sourceFingerprint: string;
    }
  | {
      schemaVersion: typeof FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION;
      promptVersion: typeof FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION;
      rubricVersion: typeof FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION;
      modelVersion: string;
      evaluationState: "partial";
      reviewOutcome: "partial_scorecard" | "coaching_review";
      scoreWithheldReason: FeedbackScoreWithheldReason;
      sourceFingerprint: string;
    };

export interface FocusedPracticeExactCandidateEvidenceSnapshot {
  kind: "exact_candidate_citation";
  transcriptRefs: readonly string[];
  quote: string;
}

export type FocusedPracticeGroundedSourceFindingSnapshot =
  | {
      kind: "evidence_limited_improvement";
      dimension: FeedbackDimension;
      observation: string;
      nextStep: string;
      signalCode: EvidenceLimitedImprovementSignalCode;
      actionCode: EvidenceLimitedActionCode;
      evidence: FocusedPracticeExactCandidateEvidenceSnapshot;
    }
  | {
      kind: "dimension_coverage_focus";
      dimension: FeedbackDimension;
      observation: string;
      nextStep: string;
      facetCode: string;
      facetLabel: string;
      answerBlockRef: string;
      actionCode: typeof FOCUSED_PRACTICE_DIMENSION_ACTION_CODE;
      evidence: FocusedPracticeExactCandidateEvidenceSnapshot;
    };

interface FocusedPracticeGroundedAttemptBase {
  readonly attemptId: string;
  readonly userId: string;
  readonly sourceSessionId: string;
  readonly sourceFeedbackId: string;
  readonly contractVersion: typeof FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION;
  readonly feedbackVersion: FocusedPracticeGroundedFeedbackVersionSnapshot;
  readonly plan: AvailableFocusedPracticeGroundedPlan;
  readonly sourceFinding: FocusedPracticeGroundedSourceFindingSnapshot;
  readonly startedAt: string;
}

export interface InProgressFocusedPracticeGroundedAttempt
  extends FocusedPracticeGroundedAttemptBase {
  readonly state: "in_progress";
  readonly lifecycleVersion: 0;
  readonly completedAt: null;
  readonly completion: null;
}

export interface CompletedFocusedPracticeGroundedAttempt
  extends FocusedPracticeGroundedAttemptBase {
  readonly state: "completed";
  readonly lifecycleVersion: 1;
  readonly completedAt: string;
  readonly completion: FocusedPracticeAttemptCompletion;
}

export type FocusedPracticeGroundedAttempt =
  | InProgressFocusedPracticeGroundedAttempt
  | CompletedFocusedPracticeGroundedAttempt;

export type AnyFocusedPracticeAttempt =
  | FocusedPracticeAttempt
  | FocusedPracticeGroundedAttempt;
export type AnyInProgressFocusedPracticeAttempt =
  | InProgressFocusedPracticeAttempt
  | InProgressFocusedPracticeGroundedAttempt;
export type AnyCompletedFocusedPracticeAttempt =
  | CompletedFocusedPracticeAttempt
  | CompletedFocusedPracticeGroundedAttempt;

export type FocusedPracticeLegacyAttemptView =
  | Omit<InProgressFocusedPracticeAttempt, "userId" | "sourceFeedbackId">
  | Omit<CompletedFocusedPracticeAttempt, "userId" | "sourceFeedbackId">;

export interface FocusedPracticeGroundedPlanView {
  state: "available";
  contractVersion: typeof FOCUSED_PRACTICE_GROUNDED_PLAN_CONTRACT_VERSION;
  durationMinutes: 5;
  title: string;
  objective: string;
  instructions: readonly [string, string];
  successCriterion: string;
  selfReviewPrompt: string;
  source: {
    questionId: string;
    questionText: string;
    roundType: AvailableFocusedPracticeGroundedPlan["source"]["roundType"];
    focusDimension: FeedbackDimension;
  };
}

interface FocusedPracticeGroundedAttemptViewBase {
  attemptId: string;
  sourceSessionId: string;
  contractVersion: typeof FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION;
  plan: FocusedPracticeGroundedPlanView;
  startedAt: string;
}
export interface InProgressFocusedPracticeGroundedAttemptView
  extends FocusedPracticeGroundedAttemptViewBase {
  state: "in_progress";
  lifecycleVersion: 0;
  completedAt: null;
  completion: null;
}
export interface CompletedFocusedPracticeGroundedAttemptView
  extends FocusedPracticeGroundedAttemptViewBase {
  state: "completed";
  lifecycleVersion: 1;
  completedAt: string;
  completion: FocusedPracticeAttemptCompletion;
}
export type FocusedPracticeGroundedAttemptView =
  | InProgressFocusedPracticeGroundedAttemptView
  | CompletedFocusedPracticeGroundedAttemptView;
export type FocusedPracticeAttemptView =
  | FocusedPracticeLegacyAttemptView
  | FocusedPracticeGroundedAttemptView;

export function createFocusedPracticeGroundedAttempt(input: {
  attemptId: string;
  userId: string;
  sourceSessionId: string;
  sourceFeedbackId: string;
  feedbackVersion: FocusedPracticeGroundedFeedbackVersionSnapshot;
  plan: AvailableFocusedPracticeGroundedPlan;
  sourceFinding: FocusedPracticeGroundedSourceFindingSnapshot;
  startedAt: Date;
}):
  | { state: "created"; attempt: InProgressFocusedPracticeGroundedAttempt }
  | { state: "invalid"; reason: "invalid_attempt" } {
  const plan = parseAvailableFocusedPracticeGroundedPlan(input.plan);
  const feedbackVersion = parseFeedbackVersion(input.feedbackVersion);
  const sourceFinding = plan
    ? parseGroundedSourceFinding(input.sourceFinding, plan)
    : null;
  if (
    !isIdentity(input.attemptId) ||
    !isIdentity(input.userId) ||
    !isIdentity(input.sourceSessionId) ||
    !isIdentity(input.sourceFeedbackId) ||
    !feedbackVersion ||
    !plan ||
    !sourceFinding ||
    !feedbackMatchesFocusKind(feedbackVersion, sourceFinding) ||
    !isValidDate(input.startedAt)
  ) {
    return { state: "invalid", reason: "invalid_attempt" };
  }
  return {
    state: "created",
    attempt: freezeGroundedAttempt({
      attemptId: input.attemptId,
      userId: input.userId,
      sourceSessionId: input.sourceSessionId,
      sourceFeedbackId: input.sourceFeedbackId,
      contractVersion: FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION,
      lifecycleVersion: 0,
      state: "in_progress",
      feedbackVersion,
      plan,
      sourceFinding,
      startedAt: input.startedAt.toISOString(),
      completedAt: null,
      completion: null,
    }),
  };
}

export function parseAnyFocusedPracticeAttempt(
  value: unknown
):
  | { state: "valid"; attempt: AnyFocusedPracticeAttempt }
  | { state: "invalid"; reason: "invalid_attempt" } {
  if (
    isRecord(value) &&
    value.contractVersion === FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION
  ) {
    return parseFocusedPracticeGroundedAttempt(value);
  }
  return parseFocusedPracticeAttempt(value);
}

export function parseFocusedPracticeGroundedAttempt(
  value: unknown
):
  | { state: "valid"; attempt: FocusedPracticeGroundedAttempt }
  | { state: "invalid"; reason: "invalid_attempt" } {
  if (!isRecord(value) || !hasExactKeys(value, ATTEMPT_KEYS)) {
    return invalidAttempt();
  }
  const feedbackVersion = parseFeedbackVersion(value.feedbackVersion);
  const plan = parseAvailableFocusedPracticeGroundedPlan(value.plan);
  const sourceFinding = plan
    ? parseGroundedSourceFinding(value.sourceFinding, plan)
    : null;
  const startedAt = parseCanonicalDate(value.startedAt);
  if (
    !isIdentity(value.attemptId) ||
    !isIdentity(value.userId) ||
    !isIdentity(value.sourceSessionId) ||
    !isIdentity(value.sourceFeedbackId) ||
    value.contractVersion !==
      FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION ||
    !feedbackVersion ||
    !plan ||
    !sourceFinding ||
    !feedbackMatchesFocusKind(feedbackVersion, sourceFinding) ||
    !startedAt
  ) {
    return invalidAttempt();
  }
  const base = {
    attemptId: value.attemptId,
    userId: value.userId,
    sourceSessionId: value.sourceSessionId,
    sourceFeedbackId: value.sourceFeedbackId,
    contractVersion: FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION,
    feedbackVersion,
    plan,
    sourceFinding,
    startedAt,
  };
  if (
    value.state === "in_progress" &&
    value.lifecycleVersion === 0 &&
    value.completedAt === null &&
    value.completion === null
  ) {
    return {
      state: "valid",
      attempt: freezeGroundedAttempt({
        ...base,
        state: "in_progress",
        lifecycleVersion: 0,
        completedAt: null,
        completion: null,
      }),
    };
  }
  const completedAt = parseCanonicalDate(value.completedAt);
  const completion =
    completedAt && value.state === "completed" && value.lifecycleVersion === 1
      ? parseGroundedAttemptCompletion(value.completion, plan, sourceFinding)
      : null;
  if (
    !completedAt ||
    !completion ||
    new Date(completedAt).getTime() < new Date(startedAt).getTime()
  ) {
    return invalidAttempt();
  }
  return {
    state: "valid",
    attempt: freezeGroundedAttempt({
      ...base,
      state: "completed",
      lifecycleVersion: 1,
      completedAt,
      completion,
    }),
  };
}

export function completeAnyFocusedPracticeAttempt(input: {
  attempt: AnyFocusedPracticeAttempt;
  completion: FocusedPracticeCompletionInput;
  completedAt: Date;
}):
  | { state: "completed"; attempt: AnyCompletedFocusedPracticeAttempt }
  | { state: "already_completed"; attempt: AnyCompletedFocusedPracticeAttempt }
  | { state: "conflict"; attempt: AnyCompletedFocusedPracticeAttempt }
  | {
      state: "invalid";
      reason:
        | "invalid_completion"
        | "unsupported_completion_version"
        | "practice_not_confirmed"
        | "invalid_response"
        | "invalid_completed_at";
    } {
  if (
    input.attempt.contractVersion !==
    FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION
  ) {
    return completeFocusedPracticeAttempt({
      attempt: input.attempt,
      completion: input.completion,
      completedAt: input.completedAt,
    });
  }
  if (!isValidDate(input.completedAt)) {
    return { state: "invalid", reason: "invalid_completed_at" };
  }
  const completion = parseFocusedPracticeCompletionInput(input.completion);
  if (completion.state === "invalid") return completion;
  if (input.attempt.state === "completed") {
    return responsesEqual(
      input.attempt.completion.selfReview.response,
      completion.completion.response
    )
      ? { state: "already_completed", attempt: input.attempt }
      : { state: "conflict", attempt: input.attempt };
  }
  if (
    input.completedAt.getTime() < new Date(input.attempt.startedAt).getTime()
  ) {
    return { state: "invalid", reason: "invalid_completed_at" };
  }
  const response = completion.completion.response;
  const selfReview: FocusedPracticeSelfReview = Object.freeze({
    version: FOCUSED_PRACTICE_SELF_REVIEW_VERSION,
    kind: "self_review",
    focusDimension: input.attempt.plan.source.focusDimension,
    sourceObservation: input.attempt.sourceFinding.observation,
    sourceNextStep: input.attempt.sourceFinding.nextStep,
    successCriterion: input.attempt.plan.successCriterion,
    prompt: input.attempt.plan.selfReviewPrompt,
    response,
  });
  return {
    state: "completed",
    attempt: freezeGroundedAttempt({
      ...input.attempt,
      state: "completed",
      lifecycleVersion: 1,
      completedAt: input.completedAt.toISOString(),
      completion: Object.freeze({
        contractVersion: FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
        practicedAloud: true,
        selfReview,
      }),
    }),
  };
}

export function presentFocusedPracticeAttempt(
  attempt: AnyFocusedPracticeAttempt
): FocusedPracticeAttemptView {
  if (
    attempt.contractVersion !==
    FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION
  ) {
    const { userId, sourceFeedbackId, ...legacy } = attempt;
    void userId;
    void sourceFeedbackId;
    return legacy;
  }
  const plan: FocusedPracticeGroundedPlanView = Object.freeze({
    state: "available",
    contractVersion: attempt.plan.contractVersion,
    durationMinutes: attempt.plan.durationMinutes,
    title: attempt.plan.title,
    objective: attempt.plan.objective,
    instructions: Object.freeze([...attempt.plan.instructions] as [
      string,
      string,
    ]),
    successCriterion: attempt.plan.successCriterion,
    selfReviewPrompt: attempt.plan.selfReviewPrompt,
    source: Object.freeze({
      questionId: attempt.plan.source.questionId,
      questionText: attempt.plan.source.questionText,
      roundType: attempt.plan.source.roundType,
      focusDimension: attempt.plan.source.focusDimension,
    }),
  });
  const base = {
    attemptId: attempt.attemptId,
    sourceSessionId: attempt.sourceSessionId,
    contractVersion: FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION,
    plan,
    startedAt: attempt.startedAt,
  };
  return attempt.state === "in_progress"
    ? Object.freeze({
        ...base,
        state: "in_progress" as const,
        lifecycleVersion: 0 as const,
        completedAt: null,
        completion: null,
      })
    : Object.freeze({
        ...base,
        state: "completed" as const,
        lifecycleVersion: 1 as const,
        completedAt: attempt.completedAt,
        completion: attempt.completion,
      });
}

export function parseFocusedPracticeAttemptView(
  value: unknown
): FocusedPracticeAttemptView | null {
  if (!isRecord(value) || typeof value.contractVersion !== "string") {
    return null;
  }
  if (
    value.contractVersion !== FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION
  ) {
    if (!hasExactKeys(value, LEGACY_VIEW_KEYS)) return null;
    const parsed = parseFocusedPracticeAttempt({
      ...value,
      userId: "00000000-0000-4000-8000-000000000001",
      sourceFeedbackId: "00000000-0000-4000-8000-000000000002",
    });
    if (parsed.state !== "valid") return null;
    return presentFocusedPracticeAttempt(parsed.attempt);
  }
  if (!hasExactKeys(value, GROUNDED_VIEW_KEYS)) return null;
  const plan = parseGroundedPlanView(value.plan);
  const startedAt = parseCanonicalDate(value.startedAt);
  if (
    !isIdentity(value.attemptId) ||
    !isIdentity(value.sourceSessionId) ||
    !plan ||
    !startedAt
  ) {
    return null;
  }
  const base = {
    attemptId: value.attemptId,
    sourceSessionId: value.sourceSessionId,
    contractVersion: FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION,
    plan,
    startedAt,
  };
  if (
    value.state === "in_progress" &&
    value.lifecycleVersion === 0 &&
    value.completedAt === null &&
    value.completion === null
  ) {
    return Object.freeze({
      ...base,
      state: "in_progress",
      lifecycleVersion: 0,
      completedAt: null,
      completion: null,
    });
  }
  const completedAt = parseCanonicalDate(value.completedAt);
  const completion =
    completedAt && value.state === "completed" && value.lifecycleVersion === 1
      ? parsePublicCompletion(value.completion, plan, completedAt, startedAt)
      : null;
  return completion && completedAt
    ? Object.freeze({
        ...base,
        state: "completed",
        lifecycleVersion: 1,
        completedAt,
        completion,
      })
    : null;
}

export function dimensionCoverageSourceObservation(facetLabel: string): string {
  return `The recorded answer showed grounded evidence of ${facetLabel}.`;
}
export function dimensionCoverageSourceNextStep(facetLabel: string): string {
  return `In focused practice, make ${facetLabel} explicit and connect it to the next PM decision.`;
}

function parseFeedbackVersion(
  value: unknown
): FocusedPracticeGroundedFeedbackVersionSnapshot | null {
  if (!isRecord(value) || !hasExactKeys(value, FEEDBACK_VERSION_KEYS)) {
    return null;
  }
  if (
    !isBoundedText(value.modelVersion, 256) ||
    value.evaluationState !== "partial" ||
    !isFeedbackScoreWithheldReason(value.scoreWithheldReason) ||
    !isSourceFingerprint(value.sourceFingerprint)
  ) {
    return null;
  }
  if (
    value.schemaVersion === FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION &&
    value.promptVersion === FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION &&
    value.rubricVersion === FEEDBACK_RUBRIC_VERSION &&
    value.reviewOutcome === "coaching_review"
  ) {
    return Object.freeze({
      schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
      promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      modelVersion: value.modelVersion,
      evaluationState: "partial",
      reviewOutcome: "coaching_review",
      scoreWithheldReason: value.scoreWithheldReason,
      sourceFingerprint: value.sourceFingerprint,
    });
  }
  if (
    value.schemaVersion === FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION &&
    value.promptVersion === FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION &&
    value.rubricVersion === FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION &&
    (value.reviewOutcome === "partial_scorecard" ||
      value.reviewOutcome === "coaching_review") &&
    (value.reviewOutcome !== "partial_scorecard" ||
      value.scoreWithheldReason === "rubric_coverage")
  ) {
    return Object.freeze({
      schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION,
      promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
      rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
      modelVersion: value.modelVersion,
      evaluationState: "partial",
      reviewOutcome: value.reviewOutcome,
      scoreWithheldReason: value.scoreWithheldReason,
      sourceFingerprint: value.sourceFingerprint,
    });
  }
  return null;
}

function parseGroundedSourceFinding(
  value: unknown,
  plan: AvailableFocusedPracticeGroundedPlan
): FocusedPracticeGroundedSourceFindingSnapshot | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  const identity = plan.source.focusIdentity;
  const evidence = parseEvidence(value.evidence);
  if (
    !evidence ||
    value.dimension !== plan.source.focusDimension ||
    value.kind !== identity.kind
  ) {
    return null;
  }
  if (
    value.kind === "evidence_limited_improvement" &&
    identity.kind === "evidence_limited_improvement" &&
    hasExactKeys(value, EVIDENCE_LIMITED_FINDING_KEYS)
  ) {
    const signal = EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS[identity.signalCode];
    const action = EVIDENCE_LIMITED_ACTIONS[identity.actionCode];
    if (
      value.signalCode !== identity.signalCode ||
      value.actionCode !== identity.actionCode ||
      value.observation !== signal.observation ||
      value.nextStep !== action.nextStep
    ) {
      return null;
    }
    return Object.freeze({
      kind: "evidence_limited_improvement",
      dimension: identity.dimension,
      observation: signal.observation,
      nextStep: action.nextStep,
      signalCode: identity.signalCode,
      actionCode: identity.actionCode,
      evidence,
    });
  }
  if (
    value.kind === "dimension_coverage_focus" &&
    identity.kind === "dimension_coverage_focus" &&
    hasExactKeys(value, DIMENSION_COVERAGE_FINDING_KEYS) &&
    value.facetCode === identity.facetCode &&
    value.actionCode === FOCUSED_PRACTICE_DIMENSION_ACTION_CODE &&
    isIdentity(value.answerBlockRef)
  ) {
    const facet = ROUND_DIMENSION_COVERAGE_CONFIG[plan.source.roundType][
      identity.dimension
    ].facets.find((candidate) => candidate.code === identity.facetCode);
    if (
      !facet ||
      value.facetLabel !== facet.label ||
      value.observation !== dimensionCoverageSourceObservation(facet.label) ||
      value.nextStep !== dimensionCoverageSourceNextStep(facet.label)
    ) {
      return null;
    }
    return Object.freeze({
      kind: "dimension_coverage_focus",
      dimension: identity.dimension,
      observation: dimensionCoverageSourceObservation(facet.label),
      nextStep: dimensionCoverageSourceNextStep(facet.label),
      facetCode: facet.code,
      facetLabel: facet.label,
      answerBlockRef: value.answerBlockRef,
      actionCode: FOCUSED_PRACTICE_DIMENSION_ACTION_CODE,
      evidence,
    });
  }
  return null;
}

function parseEvidence(
  value: unknown
): FocusedPracticeExactCandidateEvidenceSnapshot | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, EVIDENCE_KEYS) ||
    value.kind !== "exact_candidate_citation" ||
    !Array.isArray(value.transcriptRefs) ||
    value.transcriptRefs.length < 1 ||
    value.transcriptRefs.length > 64 ||
    !value.transcriptRefs.every(isIdentity) ||
    new Set(value.transcriptRefs).size !== value.transcriptRefs.length ||
    !isBoundedText(value.quote, 32_000)
  ) {
    return null;
  }
  return Object.freeze({
    kind: "exact_candidate_citation",
    transcriptRefs: Object.freeze([...value.transcriptRefs]),
    quote: value.quote,
  });
}

function parseGroundedAttemptCompletion(
  value: unknown,
  plan: AvailableFocusedPracticeGroundedPlan,
  sourceFinding: FocusedPracticeGroundedSourceFindingSnapshot
): FocusedPracticeAttemptCompletion | null {
  if (!isRecord(value) || !hasExactKeys(value, ATTEMPT_COMPLETION_KEYS)) {
    return null;
  }
  if (
    value.contractVersion !== FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION ||
    value.practicedAloud !== true ||
    !isRecord(value.selfReview) ||
    !hasExactKeys(value.selfReview, SELF_REVIEW_KEYS)
  ) {
    return null;
  }
  const response = parseResponse(value.selfReview.response);
  const review = value.selfReview;
  if (
    !response ||
    review.version !== FOCUSED_PRACTICE_SELF_REVIEW_VERSION ||
    review.kind !== "self_review" ||
    review.focusDimension !== plan.source.focusDimension ||
    review.sourceObservation !== sourceFinding.observation ||
    review.sourceNextStep !== sourceFinding.nextStep ||
    review.successCriterion !== plan.successCriterion ||
    review.prompt !== plan.selfReviewPrompt ||
    !isRecord(review.response) ||
    review.response.kind !== response.kind ||
    review.response.text !== response.text
  ) {
    return null;
  }
  return Object.freeze({
    contractVersion: FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
    practicedAloud: true,
    selfReview: Object.freeze({
      version: FOCUSED_PRACTICE_SELF_REVIEW_VERSION,
      kind: "self_review",
      focusDimension: plan.source.focusDimension,
      sourceObservation: sourceFinding.observation,
      sourceNextStep: sourceFinding.nextStep,
      successCriterion: plan.successCriterion,
      prompt: plan.selfReviewPrompt,
      response,
    }),
  });
}

function parseGroundedPlanView(
  value: unknown
): FocusedPracticeGroundedPlanView | null {
  if (!isRecord(value) || !hasExactKeys(value, GROUNDED_PLAN_VIEW_KEYS)) {
    return null;
  }
  if (
    value.state !== "available" ||
    value.contractVersion !== FOCUSED_PRACTICE_GROUNDED_PLAN_CONTRACT_VERSION ||
    value.durationMinutes !== 5 ||
    !isBoundedText(value.title, 500) ||
    !isBoundedText(value.objective, 2_000) ||
    !Array.isArray(value.instructions) ||
    value.instructions.length !== 2 ||
    !value.instructions.every((item) => isBoundedText(item, 2_000)) ||
    !isBoundedText(value.successCriterion, 2_000) ||
    !isBoundedText(value.selfReviewPrompt, 2_000) ||
    !isRecord(value.source) ||
    !hasExactKeys(value.source, GROUNDED_PLAN_SOURCE_VIEW_KEYS) ||
    !isIdentity(value.source.questionId) ||
    !isBoundedText(value.source.questionText, 2_000) ||
    !["product_sense", "execution", "behavioral", "strategy"].includes(
      value.source.roundType as string
    ) ||
    ![
      "structure",
      "clarity",
      "insight",
      "communication",
      "leadership",
    ].includes(value.source.focusDimension as string)
  ) {
    return null;
  }
  const roundType = value.source
    .roundType as FocusedPracticeGroundedPlanView["source"]["roundType"];
  const focusDimension = value.source.focusDimension as FeedbackDimension;
  const canonicalFacet =
    ROUND_DIMENSION_COVERAGE_CONFIG[roundType][focusDimension].facets[0];
  if (!canonicalFacet) return null;
  const rebuilt = buildFocusedPracticeGroundedPlan({
    sourceQuestion: {
      questionId: value.source.questionId,
      questionText: value.source.questionText,
    },
    roundType,
    focusIdentity: {
      kind: "dimension_coverage_focus",
      dimension: focusDimension,
      facetCode: canonicalFacet.code,
      actionCode: FOCUSED_PRACTICE_DIMENSION_ACTION_CODE,
    },
  });
  if (rebuilt.state !== "available") return null;
  const canonical = rebuilt.plan;
  if (
    value.title !== canonical.title ||
    value.objective !== canonical.objective ||
    value.instructions[0] !== canonical.instructions[0] ||
    value.instructions[1] !== canonical.instructions[1] ||
    value.successCriterion !== canonical.successCriterion ||
    value.selfReviewPrompt !== canonical.selfReviewPrompt
  ) {
    return null;
  }
  return Object.freeze({
    state: "available",
    contractVersion: FOCUSED_PRACTICE_GROUNDED_PLAN_CONTRACT_VERSION,
    durationMinutes: 5,
    title: canonical.title,
    objective: canonical.objective,
    instructions: Object.freeze([...canonical.instructions] as [
      string,
      string,
    ]),
    successCriterion: canonical.successCriterion,
    selfReviewPrompt: canonical.selfReviewPrompt,
    source: Object.freeze({
      questionId: value.source.questionId,
      questionText: value.source.questionText,
      roundType,
      focusDimension,
    }),
  });
}

function parsePublicCompletion(
  value: unknown,
  plan: FocusedPracticeGroundedPlanView,
  completedAt: string,
  startedAt: string
): FocusedPracticeAttemptCompletion | null {
  if (new Date(completedAt).getTime() < new Date(startedAt).getTime()) {
    return null;
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ATTEMPT_COMPLETION_KEYS) ||
    value.contractVersion !== FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION ||
    value.practicedAloud !== true ||
    !isRecord(value.selfReview) ||
    !hasExactKeys(value.selfReview, SELF_REVIEW_KEYS)
  ) {
    return null;
  }
  const review = value.selfReview;
  const response = parseResponse(review.response);
  const focusCopy = parseCanonicalPublicFocusCopy(
    plan,
    review.sourceObservation,
    review.sourceNextStep
  );
  if (
    !response ||
    !focusCopy ||
    review.version !== FOCUSED_PRACTICE_SELF_REVIEW_VERSION ||
    review.kind !== "self_review" ||
    review.focusDimension !== plan.source.focusDimension ||
    review.successCriterion !== plan.successCriterion ||
    review.prompt !== plan.selfReviewPrompt
  ) {
    return null;
  }
  return Object.freeze({
    contractVersion: FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
    practicedAloud: true,
    selfReview: Object.freeze({
      version: FOCUSED_PRACTICE_SELF_REVIEW_VERSION,
      kind: "self_review" as const,
      focusDimension: plan.source.focusDimension,
      sourceObservation: focusCopy.observation,
      sourceNextStep: focusCopy.nextStep,
      successCriterion: plan.successCriterion,
      prompt: plan.selfReviewPrompt,
      response,
    }),
  });
}

function feedbackMatchesFocusKind(
  feedbackVersion: FocusedPracticeGroundedFeedbackVersionSnapshot,
  sourceFinding: FocusedPracticeGroundedSourceFindingSnapshot
): boolean {
  return feedbackVersion.schemaVersion ===
    FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION
    ? sourceFinding.kind === "evidence_limited_improvement"
    : sourceFinding.kind === "dimension_coverage_focus";
}

function parseCanonicalPublicFocusCopy(
  plan: FocusedPracticeGroundedPlanView,
  observation: unknown,
  nextStep: unknown
): { observation: string; nextStep: string } | null {
  if (typeof observation !== "string" || typeof nextStep !== "string") {
    return null;
  }
  const dimension = plan.source.focusDimension;
  const evidenceLimitedObservation = Object.values(
    EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS
  ).some(
    (signal) =>
      signal.dimension === dimension && signal.observation === observation
  );
  const evidenceLimitedNextStep = Object.values(EVIDENCE_LIMITED_ACTIONS).some(
    (action) => action.dimension === dimension && action.nextStep === nextStep
  );
  if (evidenceLimitedObservation && evidenceLimitedNextStep) {
    return { observation, nextStep };
  }

  const dimensionCoverageMatch = ROUND_DIMENSION_COVERAGE_CONFIG[
    plan.source.roundType
  ][dimension].facets.some(
    (facet) =>
      dimensionCoverageSourceObservation(facet.label) === observation &&
      dimensionCoverageSourceNextStep(facet.label) === nextStep
  );
  return dimensionCoverageMatch ? { observation, nextStep } : null;
}

function parseResponse(value: unknown): FocusedPracticeResponse | null {
  const parsed = parseFocusedPracticeCompletionInput({
    contractVersion: FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
    practicedAloud: true,
    response: value,
  });
  return parsed.state === "valid" ? parsed.completion.response : null;
}

function freezeGroundedAttempt<T extends FocusedPracticeGroundedAttempt>(
  attempt: T
): T {
  return Object.freeze({
    ...attempt,
    feedbackVersion: Object.freeze({ ...attempt.feedbackVersion }),
    sourceFinding: Object.freeze({
      ...attempt.sourceFinding,
      evidence: Object.freeze({ ...attempt.sourceFinding.evidence }),
    }),
  }) as unknown as T;
}

function responsesEqual(
  left: FocusedPracticeResponse,
  right: FocusedPracticeResponse
): boolean {
  return left.kind === right.kind && left.text === right.text;
}
function invalidAttempt() {
  return { state: "invalid" as const, reason: "invalid_attempt" as const };
}
function isFeedbackScoreWithheldReason(
  value: unknown
): value is FeedbackScoreWithheldReason {
  return value === "rubric_coverage" || value === "verified_evidence_integrity";
}
function isSourceFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
function isIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    value.length <= 512 &&
    !CONTROL_CHARACTERS.test(value)
  );
}
function isBoundedText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    !CONTROL_CHARACTERS.test(value)
  );
}
function parseCanonicalDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value
    ? value
    : null;
}
function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}

const ATTEMPT_KEYS = [
  "attemptId",
  "userId",
  "sourceSessionId",
  "sourceFeedbackId",
  "contractVersion",
  "lifecycleVersion",
  "state",
  "feedbackVersion",
  "plan",
  "sourceFinding",
  "startedAt",
  "completedAt",
  "completion",
] as const;
const FEEDBACK_VERSION_KEYS = [
  "schemaVersion",
  "promptVersion",
  "rubricVersion",
  "modelVersion",
  "evaluationState",
  "reviewOutcome",
  "scoreWithheldReason",
  "sourceFingerprint",
] as const;
const EVIDENCE_LIMITED_FINDING_KEYS = [
  "kind",
  "dimension",
  "observation",
  "nextStep",
  "signalCode",
  "actionCode",
  "evidence",
] as const;
const DIMENSION_COVERAGE_FINDING_KEYS = [
  "kind",
  "dimension",
  "observation",
  "nextStep",
  "facetCode",
  "facetLabel",
  "answerBlockRef",
  "actionCode",
  "evidence",
] as const;
const EVIDENCE_KEYS = ["kind", "transcriptRefs", "quote"] as const;
const ATTEMPT_COMPLETION_KEYS = [
  "contractVersion",
  "practicedAloud",
  "selfReview",
] as const;
const SELF_REVIEW_KEYS = [
  "version",
  "kind",
  "focusDimension",
  "sourceObservation",
  "sourceNextStep",
  "successCriterion",
  "prompt",
  "response",
] as const;
const GROUNDED_VIEW_KEYS = [
  "attemptId",
  "sourceSessionId",
  "contractVersion",
  "lifecycleVersion",
  "state",
  "plan",
  "startedAt",
  "completedAt",
  "completion",
] as const;
const LEGACY_VIEW_KEYS = [
  "attemptId",
  "sourceSessionId",
  "contractVersion",
  "lifecycleVersion",
  "state",
  "feedbackVersion",
  "plan",
  "sourceFinding",
  "startedAt",
  "completedAt",
  "completion",
] as const;
const GROUNDED_PLAN_VIEW_KEYS = [
  "state",
  "contractVersion",
  "durationMinutes",
  "title",
  "objective",
  "instructions",
  "successCriterion",
  "selfReviewPrompt",
  "source",
] as const;
const GROUNDED_PLAN_SOURCE_VIEW_KEYS = [
  "questionId",
  "questionText",
  "roundType",
  "focusDimension",
] as const;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
