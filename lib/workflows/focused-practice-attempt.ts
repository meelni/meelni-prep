import {
  DRILL_TEMPLATE_VERSION,
  FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION,
  buildFocusedPracticePlan,
  completeFocusedPracticeAttempt,
  createFocusedPracticeAttempt,
  parseFocusedPracticeAttempt,
  parseFocusedPracticeCompletionInput,
  parsePersistedFeedbackV2,
  resolveDrillRecommendation,
  type FocusedPracticeAttempt,
  type CompletedFocusedPracticeAttempt,
  type FocusedPracticeCompletionInput,
  type InProgressFocusedPracticeAttempt,
  type FocusedPracticeSourceQuestion,
  type PersistedCompletedFeedback,
  type PersistedFeedbackEvidenceTurn,
  type RoundType,
} from "@meelni/core";

export interface BoundedFocusedPracticeSource {
  userId: string;
  sessionId: string;
  feedbackId: string;
  roundType: RoundType | string;
  feedbackStatus: string;
  question: FocusedPracticeSourceQuestion | null;
  feedback: PersistedCompletedFeedback;
  evidenceTurns: readonly PersistedFeedbackEvidenceTurn[];
}

export interface FocusedPracticeAttemptRepository {
  findOwnedBySource(input: {
    userId: string;
    sourceSessionId: string;
    contractVersion: typeof FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION;
  }): Promise<FocusedPracticeAttempt | null>;
  loadOwnedSource(input: {
    userId: string;
    sourceSessionId: string;
  }): Promise<BoundedFocusedPracticeSource | null>;
  createOrLoadOwned(input: {
    userId: string;
    sourceSessionId: string;
    attempt: InProgressFocusedPracticeAttempt;
  }): Promise<
    | {
        disposition: "created" | "resumed";
        attempt: InProgressFocusedPracticeAttempt;
      }
    | {
        disposition: "already_completed";
        attempt: CompletedFocusedPracticeAttempt;
      }
    | {
        disposition:
          | "account_deletion_pending"
          | "not_found"
          | "source_conflict";
      }
  >;
  getOwned(input: {
    userId: string;
    attemptId: string;
  }): Promise<FocusedPracticeAttempt | null>;
  completeOwned(input: {
    userId: string;
    attemptId: string;
    expectedVersion: number;
    completion: FocusedPracticeCompletionInput;
    completedAt: Date;
  }): Promise<
    | {
        disposition: "completed" | "already_completed";
        attempt: CompletedFocusedPracticeAttempt;
      }
    | {
        disposition: "account_deletion_pending" | "not_found" | "conflict";
      }
  >;
}

export interface FocusedPracticeAttemptWorkflowDependencies {
  repository: FocusedPracticeAttemptRepository;
  isDeletionPending(userId: string): Promise<boolean>;
  now(): Date;
  createAttemptId(): string;
}

export type StartFocusedPracticeAttemptResult =
  | {
      ok: true;
      disposition: "created" | "resumed" | "already_completed";
      attempt: FocusedPracticeAttempt;
    }
  | {
      ok: false;
      reason:
        | "invalid_request"
        | "account_deletion_pending"
        | "not_found"
        | "source_unavailable"
        | "source_integrity_invalid"
        | "recommendation_unavailable"
        | "plan_unavailable"
        | "attempt_invalid"
        | "source_conflict";
    };

export type CompleteFocusedPracticeAttemptWorkflowResult =
  | {
      ok: true;
      disposition: "completed" | "already_completed";
      attempt: FocusedPracticeAttempt;
    }
  | {
      ok: false;
      reason:
        | "invalid_request"
        | "invalid_completion"
        | "account_deletion_pending"
        | "not_found"
        | "attempt_invalid"
        | "conflict";
    };

const START_KEYS = ["userId", "sourceSessionId"] as const;
const COMPLETE_KEYS = ["userId", "attemptId", "completion"] as const;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export async function startFocusedPracticeAttemptWorkflow(
  input: unknown,
  deps: FocusedPracticeAttemptWorkflowDependencies
): Promise<StartFocusedPracticeAttemptResult> {
  const parsed = parseStartInput(input);
  if (!parsed) return { ok: false, reason: "invalid_request" };
  if (await deps.isDeletionPending(parsed.userId)) {
    return { ok: false, reason: "account_deletion_pending" };
  }

  const existing = await deps.repository.findOwnedBySource({
    userId: parsed.userId,
    sourceSessionId: parsed.sourceSessionId,
    contractVersion: FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION,
  });
  // A deletion request can be accepted while the owner-scoped snapshot is
  // loading. Never return it after that boundary moves.
  if (await deps.isDeletionPending(parsed.userId)) {
    return { ok: false, reason: "account_deletion_pending" };
  }
  if (existing) {
    const decoded = parseFocusedPracticeAttempt(existing);
    if (decoded.state === "invalid") {
      return { ok: false, reason: "attempt_invalid" };
    }
    if (!matchesOwnedSource(decoded.attempt, parsed)) {
      return { ok: false, reason: "source_conflict" };
    }
    return {
      ok: true,
      disposition:
        decoded.attempt.state === "completed" ? "already_completed" : "resumed",
      attempt: decoded.attempt,
    };
  }

  const source = await deps.repository.loadOwnedSource({
    userId: parsed.userId,
    sourceSessionId: parsed.sourceSessionId,
  });
  if (!source || !matchesSourceRecord(source, parsed)) {
    return { ok: false, reason: "not_found" };
  }
  if (source.feedbackStatus !== "completed") {
    return { ok: false, reason: "source_unavailable" };
  }
  if (
    !source.question ||
    source.feedback.id !== source.feedbackId ||
    source.feedback.sessionId !== source.sessionId
  ) {
    return { ok: false, reason: "source_integrity_invalid" };
  }

  let feedback;
  try {
    feedback = parsePersistedFeedbackV2(source.feedback, {
      evidenceTurns: source.evidenceTurns,
    });
  } catch {
    return { ok: false, reason: "source_integrity_invalid" };
  }

  const resolution = resolveDrillRecommendation({
    roundType: source.roundType,
    sourceState: "completed",
    templateVersion: DRILL_TEMPLATE_VERSION,
    feedback,
  });
  if (
    resolution.recommendation.state !== "recommended" ||
    !resolution.sourceFinding
  ) {
    return { ok: false, reason: "recommendation_unavailable" };
  }

  const plan = buildFocusedPracticePlan({
    recommendation: resolution.recommendation,
    sourceQuestion: source.question,
  });
  if (plan.state !== "available") {
    return { ok: false, reason: "plan_unavailable" };
  }

  const created = createFocusedPracticeAttempt({
    attemptId: deps.createAttemptId(),
    userId: parsed.userId,
    sourceSessionId: source.sessionId,
    sourceFeedbackId: source.feedbackId,
    feedbackVersion: {
      schemaVersion: feedback.schemaVersion,
      promptVersion: feedback.promptVersion,
      rubricVersion: feedback.rubricVersion,
      modelVersion: feedback.modelVersion,
      evaluationState: feedback.evaluationState,
    },
    plan,
    sourceFinding: resolution.sourceFinding,
    startedAt: deps.now(),
  });
  if (created.state === "invalid") {
    return { ok: false, reason: "attempt_invalid" };
  }

  // Account deletion can begin during source reconstruction. Fence again
  // before the atomic source-owner check and attempt write.
  if (await deps.isDeletionPending(parsed.userId)) {
    return { ok: false, reason: "account_deletion_pending" };
  }
  const stored = await deps.repository.createOrLoadOwned({
    userId: parsed.userId,
    sourceSessionId: parsed.sourceSessionId,
    attempt: created.attempt,
  });
  // The durable adapter must acquire the account-identity lock and check the
  // tombstone in the same transaction as this mutation.
  if (stored.disposition === "account_deletion_pending") {
    return { ok: false, reason: "account_deletion_pending" };
  }
  if (stored.disposition === "not_found") {
    return { ok: false, reason: "not_found" };
  }
  if (stored.disposition === "source_conflict") {
    return { ok: false, reason: "source_conflict" };
  }
  if (!("attempt" in stored)) {
    return { ok: false, reason: "source_conflict" };
  }
  const decodedStored = parseFocusedPracticeAttempt(stored.attempt);
  if (decodedStored.state === "invalid") {
    return { ok: false, reason: "attempt_invalid" };
  }
  if (
    (stored.disposition === "already_completed") !==
    (decodedStored.attempt.state === "completed")
  ) {
    return { ok: false, reason: "attempt_invalid" };
  }
  if (
    !matchesOwnedSource(decodedStored.attempt, parsed) ||
    !matchesImmutableSource(decodedStored.attempt, created.attempt)
  ) {
    return { ok: false, reason: "source_conflict" };
  }
  if (
    stored.disposition === "created" &&
    (decodedStored.attempt.attemptId !== created.attempt.attemptId ||
      decodedStored.attempt.startedAt !== created.attempt.startedAt)
  ) {
    return { ok: false, reason: "source_conflict" };
  }
  return {
    ok: true,
    disposition: stored.disposition,
    attempt: decodedStored.attempt,
  };
}

export async function completeFocusedPracticeAttemptWorkflow(
  input: unknown,
  deps: FocusedPracticeAttemptWorkflowDependencies
): Promise<CompleteFocusedPracticeAttemptWorkflowResult> {
  const parsed = parseCompleteInput(input);
  if (!parsed) return { ok: false, reason: "invalid_request" };
  const completion = parseFocusedPracticeCompletionInput(parsed.completion);
  if (completion.state === "invalid") {
    return { ok: false, reason: "invalid_completion" };
  }
  if (await deps.isDeletionPending(parsed.userId)) {
    return { ok: false, reason: "account_deletion_pending" };
  }

  const existing = await deps.repository.getOwned({
    userId: parsed.userId,
    attemptId: parsed.attemptId,
  });
  if (!existing) {
    return { ok: false, reason: "not_found" };
  }
  const decodedExisting = parseFocusedPracticeAttempt(existing);
  if (decodedExisting.state === "invalid") {
    return { ok: false, reason: "attempt_invalid" };
  }
  if (decodedExisting.attempt.userId !== parsed.userId) {
    return { ok: false, reason: "not_found" };
  }
  if (decodedExisting.attempt.attemptId !== parsed.attemptId) {
    return { ok: false, reason: "not_found" };
  }
  if (await deps.isDeletionPending(parsed.userId)) {
    return { ok: false, reason: "account_deletion_pending" };
  }

  const stored = await deps.repository.completeOwned({
    userId: parsed.userId,
    attemptId: parsed.attemptId,
    expectedVersion: decodedExisting.attempt.lifecycleVersion,
    completion: completion.completion,
    completedAt: deps.now(),
  });
  // The durable adapter must acquire the account-identity lock and check the
  // tombstone in the same transaction as this mutation.
  if (stored.disposition === "account_deletion_pending") {
    return { ok: false, reason: "account_deletion_pending" };
  }
  if (stored.disposition === "not_found") {
    return { ok: false, reason: "not_found" };
  }
  if (stored.disposition === "conflict") {
    return { ok: false, reason: "conflict" };
  }
  if (!("attempt" in stored)) {
    return { ok: false, reason: "conflict" };
  }
  const decodedStored = parseFocusedPracticeAttempt(stored.attempt);
  if (
    decodedStored.state === "invalid" ||
    decodedStored.attempt.state !== "completed"
  ) {
    return { ok: false, reason: "attempt_invalid" };
  }
  if (
    decodedStored.attempt.userId !== parsed.userId ||
    decodedStored.attempt.attemptId !== parsed.attemptId
  ) {
    return { ok: false, reason: "not_found" };
  }
  if (
    decodedStored.attempt.startedAt !== decodedExisting.attempt.startedAt ||
    !matchesImmutableSource(decodedStored.attempt, decodedExisting.attempt)
  ) {
    return { ok: false, reason: "conflict" };
  }
  if (
    !responsesEqual(
      decodedStored.attempt.completion.selfReview.response,
      completion.completion.response
    )
  ) {
    return { ok: false, reason: "conflict" };
  }
  return {
    ok: true,
    disposition: stored.disposition,
    attempt: decodedStored.attempt,
  };
}

/** Pure helper for repository fakes and future compare-and-set adapters. */
export function transitionFocusedPracticeAttemptCompletion(input: {
  attempt: FocusedPracticeAttempt;
  completion: FocusedPracticeCompletionInput;
  completedAt: Date;
}) {
  return completeFocusedPracticeAttempt(input);
}

function parseStartInput(
  value: unknown
): { userId: string; sourceSessionId: string } | null {
  if (!isRecord(value) || !hasExactKeys(value, START_KEYS)) return null;
  return isIdentity(value.userId) && isIdentity(value.sourceSessionId)
    ? { userId: value.userId, sourceSessionId: value.sourceSessionId }
    : null;
}

function parseCompleteInput(value: unknown): {
  userId: string;
  attemptId: string;
  completion: unknown;
} | null {
  if (!isRecord(value) || !hasExactKeys(value, COMPLETE_KEYS)) return null;
  return isIdentity(value.userId) && isIdentity(value.attemptId)
    ? {
        userId: value.userId,
        attemptId: value.attemptId,
        completion: value.completion,
      }
    : null;
}

function matchesSourceRecord(
  source: BoundedFocusedPracticeSource,
  input: { userId: string; sourceSessionId: string }
): boolean {
  return (
    source.userId === input.userId && source.sessionId === input.sourceSessionId
  );
}

function matchesOwnedSource(
  attempt: FocusedPracticeAttempt,
  input: { userId: string; sourceSessionId: string }
): boolean {
  return (
    attempt.userId === input.userId &&
    attempt.sourceSessionId === input.sourceSessionId &&
    attempt.contractVersion === FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION
  );
}

function matchesImmutableSource(
  left: FocusedPracticeAttempt,
  right: FocusedPracticeAttempt
): boolean {
  const leftPlan = left.plan;
  const rightPlan = right.plan;
  const leftPlanSource = leftPlan.source;
  const rightPlanSource = rightPlan.source;
  const leftFinding = left.sourceFinding;
  const rightFinding = right.sourceFinding;
  return (
    left.userId === right.userId &&
    left.sourceSessionId === right.sourceSessionId &&
    left.sourceFeedbackId === right.sourceFeedbackId &&
    left.feedbackVersion.schemaVersion ===
      right.feedbackVersion.schemaVersion &&
    left.feedbackVersion.promptVersion ===
      right.feedbackVersion.promptVersion &&
    left.feedbackVersion.rubricVersion ===
      right.feedbackVersion.rubricVersion &&
    left.feedbackVersion.modelVersion === right.feedbackVersion.modelVersion &&
    left.feedbackVersion.evaluationState ===
      right.feedbackVersion.evaluationState &&
    leftPlan.state === rightPlan.state &&
    leftPlan.contractVersion === rightPlan.contractVersion &&
    leftPlan.templateVersion === rightPlan.templateVersion &&
    leftPlan.durationMinutes === rightPlan.durationMinutes &&
    leftPlan.templateId === rightPlan.templateId &&
    leftPlan.title === rightPlan.title &&
    leftPlan.objective === rightPlan.objective &&
    sameStrings(leftPlan.instructions, rightPlan.instructions) &&
    leftPlan.successCriterion === rightPlan.successCriterion &&
    leftPlan.selfReviewPrompt === rightPlan.selfReviewPrompt &&
    leftPlanSource.questionId === rightPlanSource.questionId &&
    leftPlanSource.questionText === rightPlanSource.questionText &&
    leftPlanSource.recommendationId === rightPlanSource.recommendationId &&
    leftPlanSource.roundType === rightPlanSource.roundType &&
    leftPlanSource.focusDimension === rightPlanSource.focusDimension &&
    leftPlanSource.evidenceGap === rightPlanSource.evidenceGap &&
    sameStrings(
      leftPlanSource.transcriptRefs,
      rightPlanSource.transcriptRefs
    ) &&
    leftPlanSource.confidence === rightPlanSource.confidence &&
    leftFinding.dimension === rightFinding.dimension &&
    leftFinding.observation === rightFinding.observation &&
    leftFinding.nextStep === rightFinding.nextStep &&
    sameStrings(leftFinding.transcriptRefs, rightFinding.transcriptRefs) &&
    leftFinding.confidence === rightFinding.confidence
  );
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

function responsesEqual(
  left: FocusedPracticeCompletionInput["response"],
  right: FocusedPracticeCompletionInput["response"]
): boolean {
  return left.kind === right.kind && left.text === right.text;
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
