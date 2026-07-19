import type { FeedbackDimension } from "./evaluation";
import { DRILL_TEMPLATE_VERSION } from "./drill-recommendation";
import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackEvaluationState,
  type FeedbackV2Item,
} from "./feedback-v2";
import {
  FOCUSED_PRACTICE_DURATION_MINUTES,
  FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION,
  FOCUSED_PRACTICE_TEMPLATE_CATALOG,
  FOCUSED_PRACTICE_TEMPLATE_VERSION,
  type AvailableFocusedPracticePlan,
} from "./focused-practice-plan";
import { ALL_INTERVIEW_TYPES, type RoundType } from "./interview";

export const FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION =
  "focused-practice-attempt.v1" as const;
export const FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION =
  "focused-practice-completion.v1" as const;
export const FOCUSED_PRACTICE_SELF_REVIEW_VERSION =
  "focused-practice-self-review.v1" as const;

export const FOCUSED_PRACTICE_RESPONSE_LIMITS = Object.freeze({
  revised_answer: 8_000,
  reflection: 2_000,
} as const);

export const FOCUSED_PRACTICE_ATTEMPT_INVALID_REASONS = [
  "invalid_identity",
  "invalid_feedback_version",
  "invalid_plan",
  "invalid_source_finding",
  "invalid_started_at",
] as const;

export type FocusedPracticeAttemptInvalidReason =
  (typeof FOCUSED_PRACTICE_ATTEMPT_INVALID_REASONS)[number];

export const FOCUSED_PRACTICE_COMPLETION_INVALID_REASONS = [
  "invalid_completion",
  "unsupported_completion_version",
  "practice_not_confirmed",
  "invalid_response",
  "invalid_completed_at",
] as const;

export type FocusedPracticeCompletionInvalidReason =
  (typeof FOCUSED_PRACTICE_COMPLETION_INVALID_REASONS)[number];

export interface FocusedPracticeFeedbackVersionSnapshot {
  schemaVersion: typeof FEEDBACK_SCHEMA_VERSION;
  promptVersion: typeof FEEDBACK_PROMPT_VERSION;
  rubricVersion: typeof FEEDBACK_RUBRIC_VERSION;
  modelVersion: string;
  evaluationState: FeedbackEvaluationState;
}

export interface FocusedPracticeSourceFindingSnapshot {
  dimension: FeedbackDimension;
  observation: string;
  nextStep: string;
  transcriptRefs: readonly string[];
  confidence: number;
}

export type FocusedPracticeResponse =
  | { readonly kind: "revised_answer"; readonly text: string }
  | { readonly kind: "reflection"; readonly text: string };

export interface FocusedPracticeCompletionInput {
  contractVersion: typeof FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION;
  practicedAloud: true;
  response: FocusedPracticeResponse;
}

export interface FocusedPracticeSelfReview {
  readonly version: typeof FOCUSED_PRACTICE_SELF_REVIEW_VERSION;
  readonly kind: "self_review";
  readonly focusDimension: FeedbackDimension;
  readonly sourceObservation: string;
  readonly sourceNextStep: string;
  readonly successCriterion: string;
  readonly prompt: string;
  readonly response: FocusedPracticeResponse;
}

export interface FocusedPracticeAttemptCompletion {
  readonly contractVersion: typeof FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION;
  readonly practicedAloud: true;
  readonly selfReview: FocusedPracticeSelfReview;
}

interface FocusedPracticeAttemptBase {
  readonly attemptId: string;
  readonly userId: string;
  readonly sourceSessionId: string;
  readonly sourceFeedbackId: string;
  readonly contractVersion: typeof FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION;
  readonly feedbackVersion: FocusedPracticeFeedbackVersionSnapshot;
  readonly plan: AvailableFocusedPracticePlan;
  readonly sourceFinding: FocusedPracticeSourceFindingSnapshot;
  readonly startedAt: string;
}

export interface InProgressFocusedPracticeAttempt
  extends FocusedPracticeAttemptBase {
  readonly state: "in_progress";
  readonly lifecycleVersion: 0;
  readonly completedAt: null;
  readonly completion: null;
}

export interface CompletedFocusedPracticeAttempt
  extends FocusedPracticeAttemptBase {
  readonly state: "completed";
  readonly lifecycleVersion: 1;
  readonly completedAt: string;
  readonly completion: FocusedPracticeAttemptCompletion;
}

export type FocusedPracticeAttempt =
  | InProgressFocusedPracticeAttempt
  | CompletedFocusedPracticeAttempt;

export interface CreateFocusedPracticeAttemptInput {
  attemptId: string;
  userId: string;
  sourceSessionId: string;
  sourceFeedbackId: string;
  feedbackVersion: FocusedPracticeFeedbackVersionSnapshot;
  plan: AvailableFocusedPracticePlan;
  sourceFinding: FeedbackV2Item;
  startedAt: Date;
}

export type CreateFocusedPracticeAttemptResult =
  | { state: "created"; attempt: InProgressFocusedPracticeAttempt }
  | { state: "invalid"; reason: FocusedPracticeAttemptInvalidReason };

export type CompleteFocusedPracticeAttemptResult =
  | { state: "completed"; attempt: CompletedFocusedPracticeAttempt }
  | { state: "already_completed"; attempt: CompletedFocusedPracticeAttempt }
  | { state: "conflict"; attempt: CompletedFocusedPracticeAttempt }
  | { state: "invalid"; reason: FocusedPracticeCompletionInvalidReason };

export type ParseFocusedPracticeAttemptResult =
  | { state: "valid"; attempt: FocusedPracticeAttempt }
  | { state: "invalid"; reason: "invalid_attempt" };

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

const PLAN_KEYS = [
  "state",
  "contractVersion",
  "templateVersion",
  "durationMinutes",
  "templateId",
  "title",
  "objective",
  "instructions",
  "successCriterion",
  "selfReviewPrompt",
  "source",
] as const;
const PLAN_SOURCE_KEYS = [
  "questionId",
  "questionText",
  "recommendationId",
  "roundType",
  "focusDimension",
  "evidenceGap",
  "transcriptRefs",
  "confidence",
] as const;
const FEEDBACK_VERSION_KEYS = [
  "schemaVersion",
  "promptVersion",
  "rubricVersion",
  "modelVersion",
  "evaluationState",
] as const;
const SOURCE_FINDING_KEYS = [
  "dimension",
  "observation",
  "transcriptRefs",
  "evidence",
  "nextStep",
  "rubricVersion",
  "confidence",
] as const;
const SOURCE_FINDING_SNAPSHOT_KEYS = [
  "dimension",
  "observation",
  "nextStep",
  "transcriptRefs",
  "confidence",
] as const;
const COMPLETION_KEYS = [
  "contractVersion",
  "practicedAloud",
  "response",
] as const;
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
const RESPONSE_KEYS = ["kind", "text"] as const;
const DIMENSIONS = [
  "structure",
  "clarity",
  "insight",
  "communication",
  "leadership",
] as const satisfies readonly FeedbackDimension[];
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export function createFocusedPracticeAttempt(
  input: CreateFocusedPracticeAttemptInput
): CreateFocusedPracticeAttemptResult {
  if (
    !isIdentity(input.attemptId) ||
    !isIdentity(input.userId) ||
    !isIdentity(input.sourceSessionId) ||
    !isIdentity(input.sourceFeedbackId)
  ) {
    return { state: "invalid", reason: "invalid_identity" };
  }
  if (!isFeedbackVersionSnapshot(input.feedbackVersion)) {
    return { state: "invalid", reason: "invalid_feedback_version" };
  }
  if (
    !isAvailablePlan(input.plan) ||
    !evidenceStateMatchesPlan(input.feedbackVersion.evaluationState, input.plan)
  ) {
    return { state: "invalid", reason: "invalid_plan" };
  }
  const sourceFinding = parseSourceFinding(input.sourceFinding, input.plan);
  if (!sourceFinding) {
    return { state: "invalid", reason: "invalid_source_finding" };
  }
  if (!isValidDate(input.startedAt)) {
    return { state: "invalid", reason: "invalid_started_at" };
  }

  return {
    state: "created",
    attempt: freezeAttempt({
      attemptId: input.attemptId,
      userId: input.userId,
      sourceSessionId: input.sourceSessionId,
      sourceFeedbackId: input.sourceFeedbackId,
      contractVersion: FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION,
      lifecycleVersion: 0,
      state: "in_progress",
      feedbackVersion: { ...input.feedbackVersion },
      plan: snapshotPlan(input.plan),
      sourceFinding,
      startedAt: input.startedAt.toISOString(),
      completedAt: null,
      completion: null,
    }),
  };
}

/** Strict decoder for repository-hydrated attempt rows. */
export function parseFocusedPracticeAttempt(
  value: unknown
): ParseFocusedPracticeAttemptResult {
  if (!isRecord(value) || !hasExactKeys(value, ATTEMPT_KEYS)) {
    return invalidAttempt();
  }
  if (
    !isIdentity(value.attemptId) ||
    !isIdentity(value.userId) ||
    !isIdentity(value.sourceSessionId) ||
    !isIdentity(value.sourceFeedbackId) ||
    value.contractVersion !== FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION ||
    !isFeedbackVersionSnapshot(
      value.feedbackVersion as FocusedPracticeFeedbackVersionSnapshot
    ) ||
    !isAvailablePlan(value.plan as AvailableFocusedPracticePlan) ||
    !evidenceStateMatchesPlan(
      (value.feedbackVersion as FocusedPracticeFeedbackVersionSnapshot)
        .evaluationState,
      value.plan as AvailableFocusedPracticePlan
    )
  ) {
    return invalidAttempt();
  }
  const plan = snapshotPlan(value.plan as AvailableFocusedPracticePlan);
  const sourceFinding = parseSourceFindingSnapshot(value.sourceFinding, plan);
  const startedAt = parseCanonicalDate(value.startedAt);
  if (!sourceFinding || !startedAt) return invalidAttempt();

  const base = {
    attemptId: value.attemptId,
    userId: value.userId,
    sourceSessionId: value.sourceSessionId,
    sourceFeedbackId: value.sourceFeedbackId,
    contractVersion: FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION,
    feedbackVersion: {
      ...(value.feedbackVersion as FocusedPracticeFeedbackVersionSnapshot),
    },
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
      attempt: freezeAttempt({
        ...base,
        state: "in_progress",
        lifecycleVersion: 0,
        completedAt: null,
        completion: null,
      }),
    };
  }
  if (value.state !== "completed" || value.lifecycleVersion !== 1) {
    return invalidAttempt();
  }
  const completedAt = parseCanonicalDate(value.completedAt);
  const completion = parseAttemptCompletion(
    value.completion,
    plan,
    sourceFinding
  );
  if (
    !completedAt ||
    new Date(completedAt).getTime() < new Date(startedAt).getTime() ||
    !completion
  ) {
    return invalidAttempt();
  }
  return {
    state: "valid",
    attempt: freezeAttempt({
      ...base,
      state: "completed",
      lifecycleVersion: 1,
      completedAt,
      completion,
    }),
  };
}

export function parseFocusedPracticeCompletionInput(
  value: unknown
):
  | { state: "valid"; completion: FocusedPracticeCompletionInput }
  | { state: "invalid"; reason: FocusedPracticeCompletionInvalidReason } {
  if (!isRecord(value) || !hasExactKeys(value, COMPLETION_KEYS)) {
    return { state: "invalid", reason: "invalid_completion" };
  }
  if (value.contractVersion !== FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION) {
    return { state: "invalid", reason: "unsupported_completion_version" };
  }
  if (value.practicedAloud !== true) {
    return { state: "invalid", reason: "practice_not_confirmed" };
  }
  const response = parseResponse(value.response);
  if (!response) {
    return { state: "invalid", reason: "invalid_response" };
  }
  return {
    state: "valid",
    completion: Object.freeze({
      contractVersion: FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
      practicedAloud: true,
      response,
    }),
  };
}

export function completeFocusedPracticeAttempt(input: {
  attempt: FocusedPracticeAttempt;
  completion: FocusedPracticeCompletionInput;
  completedAt: Date;
}): CompleteFocusedPracticeAttemptResult {
  if (!isValidDate(input.completedAt)) {
    return { state: "invalid", reason: "invalid_completed_at" };
  }
  const parsed = parseFocusedPracticeCompletionInput(input.completion);
  if (parsed.state === "invalid") return parsed;

  if (input.attempt.state === "completed") {
    return responsesEqual(
      input.attempt.completion.selfReview.response,
      parsed.completion.response
    )
      ? { state: "already_completed", attempt: input.attempt }
      : { state: "conflict", attempt: input.attempt };
  }
  if (
    input.completedAt.getTime() < new Date(input.attempt.startedAt).getTime()
  ) {
    return { state: "invalid", reason: "invalid_completed_at" };
  }

  const response = parsed.completion.response;
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
    attempt: freezeAttempt({
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

function parseResponse(value: unknown): FocusedPracticeResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, RESPONSE_KEYS)) return null;
  if (value.kind !== "revised_answer" && value.kind !== "reflection") {
    return null;
  }
  if (typeof value.text !== "string" || CONTROL_CHARACTERS.test(value.text)) {
    return null;
  }
  const text = value.text.replace(/\r\n?/g, "\n").trim();
  if (
    text.length < 1 ||
    text.length > FOCUSED_PRACTICE_RESPONSE_LIMITS[value.kind]
  ) {
    return null;
  }
  return Object.freeze({ kind: value.kind, text });
}

function parseSourceFinding(
  value: FeedbackV2Item,
  plan: AvailableFocusedPracticePlan
): FocusedPracticeSourceFindingSnapshot | null {
  if (!isRecord(value) || !hasExactKeys(value, SOURCE_FINDING_KEYS)) {
    return null;
  }
  const transcriptRefs = Array.isArray(value.transcriptRefs)
    ? [...value.transcriptRefs].sort()
    : [];
  if (
    value.dimension !== plan.source.focusDimension ||
    value.rubricVersion !== FEEDBACK_RUBRIC_VERSION ||
    !isBoundedText(value.observation, 2_000) ||
    !isBoundedText(value.nextStep, 2_000) ||
    transcriptRefs.length < 1 ||
    !sameStrings(transcriptRefs, plan.source.transcriptRefs) ||
    value.confidence !== plan.source.confidence
  ) {
    return null;
  }
  return Object.freeze({
    dimension: value.dimension,
    observation: value.observation,
    nextStep: value.nextStep,
    transcriptRefs: Object.freeze(transcriptRefs),
    confidence: value.confidence,
  });
}

function parseSourceFindingSnapshot(
  value: unknown,
  plan: AvailableFocusedPracticePlan
): FocusedPracticeSourceFindingSnapshot | null {
  if (!isRecord(value) || !hasExactKeys(value, SOURCE_FINDING_SNAPSHOT_KEYS)) {
    return null;
  }
  if (
    value.dimension !== plan.source.focusDimension ||
    !isBoundedText(value.observation, 2_000) ||
    !isBoundedText(value.nextStep, 2_000) ||
    !Array.isArray(value.transcriptRefs) ||
    !value.transcriptRefs.every(isIdentity) ||
    !sameStrings(value.transcriptRefs, plan.source.transcriptRefs) ||
    value.confidence !== plan.source.confidence
  ) {
    return null;
  }
  return Object.freeze({
    dimension: value.dimension as FeedbackDimension,
    observation: value.observation,
    nextStep: value.nextStep,
    transcriptRefs: Object.freeze([...value.transcriptRefs]),
    confidence: value.confidence as number,
  });
}

function parseAttemptCompletion(
  value: unknown,
  plan: AvailableFocusedPracticePlan,
  sourceFinding: FocusedPracticeSourceFindingSnapshot
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
  const review = value.selfReview;
  const response = parseResponse(review.response);
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
  const selfReview = Object.freeze({
    version: FOCUSED_PRACTICE_SELF_REVIEW_VERSION,
    kind: "self_review" as const,
    focusDimension: plan.source.focusDimension,
    sourceObservation: sourceFinding.observation,
    sourceNextStep: sourceFinding.nextStep,
    successCriterion: plan.successCriterion,
    prompt: plan.selfReviewPrompt,
    response,
  });
  return Object.freeze({
    contractVersion: FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
    practicedAloud: true as const,
    selfReview,
  });
}

function isFeedbackVersionSnapshot(
  value: FocusedPracticeFeedbackVersionSnapshot
): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, FEEDBACK_VERSION_KEYS) &&
    value.schemaVersion === FEEDBACK_SCHEMA_VERSION &&
    value.promptVersion === FEEDBACK_PROMPT_VERSION &&
    value.rubricVersion === FEEDBACK_RUBRIC_VERSION &&
    isBoundedText(value.modelVersion, 256) &&
    (value.evaluationState === "full" || value.evaluationState === "partial")
  );
}

function isAvailablePlan(value: AvailableFocusedPracticePlan): boolean {
  if (!isRecord(value) || !hasExactKeys(value, PLAN_KEYS)) return false;
  if (
    value.state !== "available" ||
    value.contractVersion !== FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION ||
    value.templateVersion !== FOCUSED_PRACTICE_TEMPLATE_VERSION ||
    value.durationMinutes !== FOCUSED_PRACTICE_DURATION_MINUTES ||
    !isIdentity(value.templateId) ||
    !isBoundedText(value.title, 500) ||
    !isBoundedText(value.objective, 2_000) ||
    !Array.isArray(value.instructions) ||
    value.instructions.length !== 2 ||
    !value.instructions.every((item) => isBoundedText(item, 2_000)) ||
    !isBoundedText(value.successCriterion, 2_000) ||
    !isBoundedText(value.selfReviewPrompt, 2_000) ||
    !isRecord(value.source) ||
    !hasExactKeys(value.source, PLAN_SOURCE_KEYS)
  ) {
    return false;
  }
  const source = value.source;
  if (
    !(
      isIdentity(source.questionId) &&
      isBoundedText(source.questionText, 2_000) &&
      isIdentity(source.recommendationId) &&
      ALL_INTERVIEW_TYPES.includes(source.roundType as RoundType) &&
      DIMENSIONS.includes(source.focusDimension as FeedbackDimension) &&
      (source.evidenceGap === "grounded_full" ||
        source.evidenceGap === "grounded_partial") &&
      Array.isArray(source.transcriptRefs) &&
      source.transcriptRefs.length >= 1 &&
      source.transcriptRefs.length <= 5 &&
      source.transcriptRefs.every(isIdentity) &&
      new Set(source.transcriptRefs).size === source.transcriptRefs.length &&
      sameStrings([...source.transcriptRefs].sort(), source.transcriptRefs) &&
      typeof source.confidence === "number" &&
      Number.isFinite(source.confidence) &&
      source.confidence > 0 &&
      source.confidence <= 1
    )
  ) {
    return false;
  }
  const recommendationId = [
    "pm-drill",
    DRILL_TEMPLATE_VERSION,
    source.roundType,
    source.focusDimension,
    source.evidenceGap,
  ].join(":");
  const template = FOCUSED_PRACTICE_TEMPLATE_CATALOG[recommendationId];
  return Boolean(
    template &&
      source.recommendationId === recommendationId &&
      value.templateId === template.templateId &&
      value.title === template.title &&
      value.objective === template.objective &&
      sameStrings(value.instructions, template.instructions) &&
      value.successCriterion === template.successCriterion &&
      value.selfReviewPrompt === template.selfReviewPrompt
  );
}

function evidenceStateMatchesPlan(
  evaluationState: FeedbackEvaluationState,
  plan: AvailableFocusedPracticePlan
): boolean {
  return (
    (evaluationState === "full" &&
      plan.source.evidenceGap === "grounded_full") ||
    (evaluationState === "partial" &&
      plan.source.evidenceGap === "grounded_partial")
  );
}

function invalidAttempt(): ParseFocusedPracticeAttemptResult {
  return { state: "invalid", reason: "invalid_attempt" };
}

function freezeAttempt<T extends FocusedPracticeAttempt>(attempt: T): T {
  const feedbackVersion = Object.freeze({ ...attempt.feedbackVersion });
  return Object.freeze({
    ...attempt,
    feedbackVersion,
  }) as unknown as T;
}

function snapshotPlan(
  plan: AvailableFocusedPracticePlan
): AvailableFocusedPracticePlan {
  const source = Object.freeze({
    ...plan.source,
    transcriptRefs: Object.freeze([...plan.source.transcriptRefs]),
  });
  return Object.freeze({
    ...plan,
    instructions: Object.freeze([...plan.instructions] as [string, string]),
    source,
  });
}

function responsesEqual(
  left: FocusedPracticeResponse,
  right: FocusedPracticeResponse
): boolean {
  return left.kind === right.kind && left.text === right.text;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
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

function isBoundedText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function parseCanonicalDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value
    ? value
    : null;
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
