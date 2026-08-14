import {
  isDimensionCoverageFeedbackResult,
  isValidRoundType,
  type CandidateAnswerBlock,
  type FeedbackEvaluationState,
  type FeedbackEvaluationResult,
  type RoundType,
  type SkippedFeedbackOutcomeReason,
} from "@meelni/core";

import {
  createDrizzleFeedbackGenerationStore,
  type FeedbackGenerationRecord,
  type FeedbackGenerationStore,
} from "@/lib/db/feedback-generation-state";
import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import { getSessionById } from "@/lib/db/sessions";
import { getFrozenFeedbackEvaluationEvidence } from "@/lib/db/transcripts";
import { withDeadline } from "@/lib/http/deadline";
import {
  FeedbackProviderInvocationError,
  type StartFeedbackObservabilityTrace,
} from "@/lib/evaluation/scorer";
import { generateDimensionCoverageFeedback } from "@/lib/evaluation/dimension-coverage-scorer";
import {
  FeedbackGenerationPolicyError,
  FEEDBACK_GENERATION_MAX_PROVIDER_ATTEMPTS,
  assertFeedbackGenerationBudget,
  classifyFeedbackGenerationFailure,
  deadlineExceededFailure,
  feedbackGenerationStatusReason,
  getFeedbackGenerationDeadlineAt,
  getFeedbackGenerationRemainingBudgetMs,
  planFeedbackProviderAttempt,
  type FeedbackGenerationFailure,
  type FeedbackGenerationStage,
} from "@/lib/evaluation/feedback-generation-policy";
import {
  reportFeedbackGenerationAttempt,
  type FeedbackGenerationAttemptOutcome,
  type FeedbackGenerationAttemptReporter,
} from "@/lib/operations/feedback-generation-attempt";
import {
  SessionTier,
  prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot,
  validateSessionCompleteness,
  type SessionValidation,
} from "@/lib/evaluation/session-validator";
import { resolveFeedbackGenerationEligibility } from "./feedback-generation-evidence";

export interface GenerateFeedbackWorkflowInput {
  sessionId: string;
  userId: string;
  eventId: string;
  requestedAtMs?: number;
  /** Zero-indexed durable function attempt; used only to refresh fence reads. */
  executionAttempt?: number;
}

export interface FeedbackGenerationSession {
  userId: string;
  roundType: string;
  endingAtMs?: number | null;
}

export interface FeedbackGenerationSteps {
  run<T>(name: string, work: () => Promise<T>): Promise<T>;
  sleep(name: string, durationMs: number): Promise<void>;
  sendInsights(input: {
    id: string;
    name: "insights/update.requested";
    data: { userId: string; sessionId: string };
  }): Promise<void>;
}

export interface GenerateFeedbackWorkflowDeps {
  store: FeedbackGenerationStore;
  steps: FeedbackGenerationSteps;
  now(): Date;
  isDeletionPending(userId: string): Promise<boolean>;
  getSession(sessionId: string): Promise<FeedbackGenerationSession | null>;
  validateLegacy(sessionId: string): Promise<SessionValidation>;
  getAnswerBlockEvidence(sessionId: string): Promise<{
    blocks: CandidateAnswerBlock[];
    eligible: boolean;
    evidenceFailureReason: SkippedFeedbackOutcomeReason | null;
    snapshotState?: "complete" | "partial" | null;
  }>;
  evaluate(input: {
    roundType: RoundType;
    answerBlocks: readonly CandidateAnswerBlock[];
    allowNumericalScores: boolean;
    attempt: number;
    deadlineAtMs: number;
    requestTimeoutMs: number;
    now(): number;
    reportAttempt: FeedbackGenerationAttemptReporter;
  }): Promise<FeedbackEvaluationResult>;
  reportAttempt: FeedbackGenerationAttemptReporter;
  /** In-memory compatibility only for the pre-v3 synthetic calibration harness. */
  allowLegacyEvaluationForSyntheticCalibration?: true;
  /** Preserves the calibration harness's authenticated provider diagnostics. */
  preserveEvaluatorFailuresForSyntheticCalibration?: true;
}

export type GenerateFeedbackWorkflowResult =
  | {
      status: "completed";
      disposition: "applied" | "already_terminal";
      sessionId: string;
      overallScore?: number;
      endToFeedbackMs?: number;
    }
  | {
      status: "skipped";
      disposition: "applied" | "already_terminal";
      sessionId: string;
      reason?: SkippedFeedbackOutcomeReason;
      endToFeedbackMs?: number;
    }
  | {
      status: "processing";
      disposition: "in_progress";
      sessionId: string;
    }
  | {
      status: "pending" | "failed" | "missing";
      disposition: "fenced" | "not_found";
      sessionId: string;
    };

export async function generateFeedbackWorkflow(
  input: GenerateFeedbackWorkflowInput,
  deps: GenerateFeedbackWorkflowDeps
): Promise<GenerateFeedbackWorkflowResult> {
  const deadlineAtMs = getFeedbackGenerationDeadlineAt({
    requestedAtMs: input.requestedAtMs,
    nowMs: deps.now().getTime(),
  });
  const executionAttempt = getFeedbackGenerationExecutionAttempt(input);
  const authorization = await runObservedFeedbackStage(
    {
      deps,
      deadlineAtMs,
      name: "authorize-feedback-generation",
      stage: "claim",
      attempt: executionAttempt,
    },
    async () => {
      await assertAccountIsActive(input.userId, deps);
      const [session, generation] = await Promise.all([
        deps.getSession(input.sessionId),
        deps.store.get(input.sessionId),
      ]);
      if (!session || session.userId !== input.userId) {
        throw new Error("feedback_generation_not_authorized");
      }
      if (!generation) throw new Error("feedback_generation_not_found");
      if (generation.eventId !== input.eventId) {
        throw new Error("feedback_generation_event_mismatch");
      }
      return { session, generation };
    }
  );

  if (isTerminal(authorization.generation)) {
    return terminalResult(input.sessionId, authorization.generation);
  }

  const claimed = await runObservedFeedbackStage(
    {
      deps,
      deadlineAtMs,
      name: "claim-feedback-generation",
      stage: "claim",
      attempt: executionAttempt,
    },
    () =>
      deps.store.claim({
        sessionId: input.sessionId,
        eventId: input.eventId,
        now: deps.now(),
        deadlineAt: new Date(deadlineAtMs),
      })
  );
  if (!claimed) {
    reportAttemptEvidence(deps, deadlineAtMs, {
      stage: "claim",
      attempt: executionAttempt,
      outcome: "fenced",
      failure: classifyFeedbackGenerationFailure(
        new Error("feedback_generation_fenced"),
        "claim"
      ),
      durationMs: 0,
    });
    const current = await deps.steps.run("read-feedback-generation-claim", () =>
      deps.store.get(input.sessionId)
    );
    return unclaimedResult(input, current);
  }

  await assertAccountIsActive(input.userId, deps);

  const eligibility = resolveFeedbackGenerationEligibility(
    claimed.completionTier
  );
  if (eligibility.disposition === "committed_eligible") {
    const committedState = toEvaluationState(eligibility.tier);
    if (!committedState) {
      throwFeedbackGenerationPolicyFailure(
        "feedback_generation_invalid_committed_tier",
        "evidence_preparation"
      );
    }
  } else if (eligibility.disposition === "legacy_requires_validation") {
    const validation = await runObservedFeedbackStage(
      {
        deps,
        deadlineAtMs,
        name: "validate-legacy-session",
        stage: "evidence_preparation",
        attempt: executionAttempt,
      },
      () => deps.validateLegacy(input.sessionId)
    );
    const validatedState = toEvaluationState(validation.tier);
    if (!validation.isValid || !validatedState) {
      return skipClaimedFeedback({
        input,
        deps,
        endingAtMs: authorization.session.endingAtMs,
        reason: validation.evidenceFailureReason ?? "no_reviewable_answer",
        completionTier: "insufficient",
        deadlineAtMs,
      });
    }
  } else {
    return skipClaimedFeedback({
      input,
      deps,
      endingAtMs: authorization.session.endingAtMs,
      reason:
        claimed.outcomeReason === "transcript_integrity_degraded"
          ? "transcript_integrity_degraded"
          : "no_reviewable_answer",
      deadlineAtMs,
    });
  }

  const evidence = await runObservedFeedbackStage(
    {
      deps,
      deadlineAtMs,
      name: "fetch-feedback-answer-blocks",
      stage: "evidence_preparation",
      attempt: executionAttempt,
    },
    () => deps.getAnswerBlockEvidence(input.sessionId)
  );
  if (!evidence.eligible || evidence.blocks.length === 0) {
    return skipClaimedFeedback({
      input,
      deps,
      endingAtMs: authorization.session.endingAtMs,
      reason: evidence.evidenceFailureReason ?? "no_reviewable_answer",
      completionTier: "insufficient",
      deadlineAtMs,
    });
  }
  if (!isValidRoundType(authorization.session.roundType)) {
    throwFeedbackGenerationPolicyFailure(
      "feedback_generation_round_type_invalid",
      "evidence_preparation"
    );
  }
  const roundType = authorization.session.roundType;

  await assertAccountIsActive(input.userId, deps);

  const allowNumericalScores =
    evidence.snapshotState !== "partial" &&
    claimed.completionStats?.feedbackModeConstraint !== "evidence_limited_only";
  let evaluated: {
    evaluation: FeedbackEvaluationResult;
    processingDurationMs: number;
  } | null = null;

  let attempt = 1;
  let plan = planFeedbackProviderAttempt({
    attempt,
    deadlineAtMs,
    nowMs: deps.now().getTime(),
  });
  for (;;) {
    if (!plan) {
      const failure = deadlineExceededFailure("provider");
      reportAttemptEvidence(deps, deadlineAtMs, {
        stage: "provider",
        attempt: Math.min(attempt, 3),
        outcome: "failed",
        failure,
        durationMs: 0,
      });
      throw new FeedbackGenerationPolicyError(failure);
    }

    const current = await deps.steps.run(
      `read-current-feedback-evaluation-${attempt}-execution-${input.executionAttempt ?? 0}`,
      () => deps.store.get(input.sessionId)
    );
    if (current?.eventId === input.eventId && current.status === "completed") {
      await sendInsightsUpdate(input, deps);
      return terminalResult(input.sessionId, current);
    }
    if (
      !current ||
      current.status !== "processing" ||
      current.eventId !== input.eventId
    ) {
      reportAttemptEvidence(deps, deadlineAtMs, {
        stage: "provider",
        attempt,
        outcome: "fenced",
        failure: classifyFeedbackGenerationFailure(
          new Error("feedback_generation_fenced"),
          "provider"
        ),
        durationMs: 0,
      });
      return unclaimedResult(input, current);
    }

    const attemptPlan = plan;
    const attemptResult = await deps.steps.run(
      `evaluate-feedback-attempt-${attempt}`,
      async () => {
        const startedAtMs = deps.now().getTime();
        try {
          assertFeedbackGenerationBudget(deadlineAtMs, startedAtMs, "provider");
          const evaluation = await withDeadline(
            "feedback_provider_attempt",
            deps.evaluate({
              roundType,
              answerBlocks: evidence.blocks,
              allowNumericalScores,
              attempt,
              deadlineAtMs,
              requestTimeoutMs: attemptPlan.requestTimeoutMs,
              now: () => deps.now().getTime(),
              reportAttempt: deps.reportAttempt,
            }),
            attemptPlan.requestTimeoutMs
          );
          assertFeedbackGenerationBudget(
            deadlineAtMs,
            deps.now().getTime(),
            "validation"
          );
          if (
            !isDimensionCoverageFeedbackResult(evaluation) &&
            deps.allowLegacyEvaluationForSyntheticCalibration !== true
          ) {
            throw new Error("feedback_generation_dimension_coverage_required");
          }
          if (
            !allowNumericalScores &&
            isDimensionCoverageFeedbackResult(evaluation) &&
            evaluation.mode !== "coaching_review"
          ) {
            throw new Error(
              "feedback_generation_qualitative_constraint_violated"
            );
          }
          return {
            disposition: "evaluated" as const,
            evaluation,
            processingDurationMs: Math.max(
              0,
              deps.now().getTime() -
                (claimed.processingStartedAt?.getTime() ?? startedAtMs)
            ),
          };
        } catch (error) {
          if (deps.preserveEvaluatorFailuresForSyntheticCalibration === true) {
            throw error;
          }
          if (!isClosedEvaluationFailure(error)) throw error;
          return {
            disposition: "failed" as const,
            failure: classifyFeedbackGenerationFailure(error, "validation"),
            durationMs: Math.max(0, deps.now().getTime() - startedAtMs),
            safeMessage: safeFeedbackGenerationErrorMessage(
              error,
              classifyFeedbackGenerationFailure(error, "validation")
            ),
          };
        }
      }
    );

    if (attemptResult.disposition === "evaluated") {
      evaluated = attemptResult;
      break;
    }

    const retryPlan = attemptResult.failure.retryable
      ? planFeedbackProviderAttempt({
          attempt: attempt + 1,
          deadlineAtMs,
          nowMs: deps.now().getTime(),
          retryAfterMs: attemptResult.failure.retryAfterMs,
        })
      : null;
    reportAttemptEvidence(deps, deadlineAtMs, {
      stage: attemptResult.failure.stage,
      attempt,
      outcome: retryPlan ? "retrying" : "failed",
      failure: attemptResult.failure,
      durationMs: attemptResult.durationMs,
      retryAfterMs: retryPlan?.delayMs ?? null,
    });
    if (!retryPlan) {
      throw new FeedbackGenerationPolicyError(
        attemptResult.failure,
        attemptResult.safeMessage
      );
    }
    if (retryPlan.delayMs > 0) {
      await deps.steps.sleep(
        `wait-feedback-evaluation-retry-${attempt}`,
        retryPlan.delayMs
      );
    }
    attempt += 1;
    plan = retryPlan;
  }

  const applied = await runObservedFeedbackStage(
    {
      deps,
      deadlineAtMs,
      name: "complete-feedback-generation",
      stage: "persistence",
      attempt: executionAttempt,
    },
    () =>
      assertAccountIsActive(input.userId, deps).then(() =>
        deps.store.complete({
          sessionId: input.sessionId,
          eventId: input.eventId,
          evaluation: evaluated!.evaluation,
          processingDurationMs: evaluated!.processingDurationMs,
          deadlineAt: new Date(deadlineAtMs),
        })
      )
  );
  if (!applied) {
    const current = await deps.steps.run(
      "read-fenced-feedback-generation",
      () => deps.store.get(input.sessionId)
    );
    if (
      getFeedbackGenerationRemainingBudgetMs(
        deadlineAtMs,
        deps.now().getTime()
      ) <= 0
    ) {
      throw new FeedbackGenerationPolicyError(
        deadlineExceededFailure("persistence")
      );
    }
    return unclaimedResult(input, current);
  }
  const completedAt = deps.now();

  await sendInsightsUpdate(input, deps);

  return {
    status: "completed",
    disposition: "applied",
    sessionId: input.sessionId,
    ...(isDimensionCoverageFeedbackResult(evaluated.evaluation)
      ? evaluated.evaluation.overallScore !== null
        ? { overallScore: evaluated.evaluation.overallScore }
        : {}
      : "overallScore" in evaluated.evaluation
        ? { overallScore: evaluated.evaluation.overallScore }
        : {}),
    ...endToFeedbackTiming(authorization.session.endingAtMs, completedAt),
  };
}

export async function failFeedbackGenerationWorkflow(
  input: GenerateFeedbackWorkflowInput & { reason: string },
  deps: Pick<
    GenerateFeedbackWorkflowDeps,
    "store" | "getSession" | "isDeletionPending"
  >
): Promise<boolean> {
  if (await deps.isDeletionPending(input.userId)) return false;
  const [session, current] = await Promise.all([
    deps.getSession(input.sessionId),
    deps.store.get(input.sessionId),
  ]);
  if (!session || session.userId !== input.userId) return false;
  if (!current || current.eventId !== input.eventId) return false;
  return deps.store.fail({
    sessionId: input.sessionId,
    eventId: input.eventId,
    reason: input.reason,
  });
}

export function createFeedbackGenerationFailureDeps(): Pick<
  GenerateFeedbackWorkflowDeps,
  "store" | "getSession" | "isDeletionPending"
> {
  return {
    store: createDrizzleFeedbackGenerationStore(),
    isDeletionPending: hasAccountDeletionTombstone,
    async getSession(sessionId) {
      const session = await getSessionById(sessionId);
      return session
        ? {
            userId: session.userId,
            roundType: session.roundType,
            endingAtMs: session.endingAt?.getTime() ?? null,
          }
        : null;
    },
  };
}

export function createGenerateFeedbackWorkflowDeps(
  steps: FeedbackGenerationSteps,
  dependencies: {
    startObservabilityTrace?: StartFeedbackObservabilityTrace;
  } = {}
): GenerateFeedbackWorkflowDeps {
  return {
    store: createDrizzleFeedbackGenerationStore(),
    steps,
    now: () => new Date(),
    reportAttempt: reportFeedbackGenerationAttempt,
    isDeletionPending: hasAccountDeletionTombstone,
    async getSession(sessionId) {
      const session = await getSessionById(sessionId);
      return session
        ? {
            userId: session.userId,
            roundType: session.roundType,
            endingAtMs: session.endingAt?.getTime() ?? null,
          }
        : null;
    },
    validateLegacy: validateSessionCompleteness,
    async getAnswerBlockEvidence(sessionId) {
      const evidence = await getFrozenFeedbackEvaluationEvidence(sessionId);
      return {
        ...prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot(evidence),
        snapshotState: evidence.snapshotState,
      };
    },
    evaluate: ({
      roundType,
      answerBlocks,
      allowNumericalScores,
      attempt,
      deadlineAtMs,
      requestTimeoutMs,
      now,
      reportAttempt,
    }) =>
      generateDimensionCoverageFeedback(
        roundType,
        answerBlocks,
        allowNumericalScores,
        {
          startObservabilityTrace: dependencies.startObservabilityTrace,
          attempt,
          deadlineAtMs,
          requestTimeoutMs,
          now,
          reportAttempt,
        }
      ),
  };
}

async function assertAccountIsActive(
  userId: string,
  deps: Pick<GenerateFeedbackWorkflowDeps, "isDeletionPending">
): Promise<void> {
  if (await deps.isDeletionPending(userId)) {
    const error = new Error("feedback_generation_account_deletion_pending");
    throw new FeedbackGenerationPolicyError(
      classifyFeedbackGenerationFailure(error, "claim"),
      error.message
    );
  }
}

async function skipClaimedFeedback(input: {
  input: GenerateFeedbackWorkflowInput;
  deps: GenerateFeedbackWorkflowDeps;
  endingAtMs: number | null | undefined;
  reason: SkippedFeedbackOutcomeReason;
  completionTier?: "insufficient";
  deadlineAtMs: number;
}): Promise<GenerateFeedbackWorkflowResult> {
  await assertAccountIsActive(input.input.userId, input.deps);
  const applied = await runObservedFeedbackStage(
    {
      deps: input.deps,
      deadlineAtMs: input.deadlineAtMs,
      name: "skip-feedback-generation",
      stage: "persistence",
      attempt: getFeedbackGenerationExecutionAttempt(input.input),
      successOutcome: "skipped",
    },
    () =>
      input.deps.store.skip({
        sessionId: input.input.sessionId,
        eventId: input.input.eventId,
        reason: input.reason,
        completionTier: input.completionTier,
        deadlineAt: new Date(input.deadlineAtMs),
      })
  );
  if (!applied) {
    const current = await input.deps.steps.run(
      "read-fenced-skipped-feedback",
      () => input.deps.store.get(input.input.sessionId)
    );
    return unclaimedResult(input.input, current);
  }
  return {
    status: "skipped",
    disposition: "applied",
    sessionId: input.input.sessionId,
    reason: input.reason,
    ...endToFeedbackTiming(input.endingAtMs, input.deps.now()),
  };
}

function endToFeedbackTiming(
  endingAtMs: number | null | undefined,
  completedAt: Date
): { endToFeedbackMs: number } | Record<string, never> {
  if (
    typeof endingAtMs !== "number" ||
    !Number.isFinite(endingAtMs) ||
    !Number.isFinite(completedAt.getTime())
  ) {
    return {};
  }
  return {
    endToFeedbackMs: Math.max(0, completedAt.getTime() - endingAtMs),
  };
}

function sendInsightsUpdate(
  input: GenerateFeedbackWorkflowInput,
  deps: Pick<GenerateFeedbackWorkflowDeps, "steps">
): Promise<void> {
  return deps.steps.sendInsights({
    id: `insights:update:${input.sessionId}:${input.eventId}`,
    name: "insights/update.requested",
    data: { userId: input.userId, sessionId: input.sessionId },
  });
}

function getFeedbackGenerationExecutionAttempt(
  input: Pick<GenerateFeedbackWorkflowInput, "executionAttempt">
): number {
  const executionAttempt = input.executionAttempt ?? 0;
  return Math.min(
    FEEDBACK_GENERATION_MAX_PROVIDER_ATTEMPTS,
    Math.max(1, Number.isInteger(executionAttempt) ? executionAttempt + 1 : 1)
  );
}

function unclaimedResult(
  input: GenerateFeedbackWorkflowInput,
  current: FeedbackGenerationRecord | null
): GenerateFeedbackWorkflowResult {
  if (!current) {
    return {
      status: "missing",
      disposition: "not_found",
      sessionId: input.sessionId,
    };
  }
  if (current.eventId === input.eventId && isTerminal(current)) {
    return terminalResult(input.sessionId, current);
  }
  if (current.eventId === input.eventId && current.status === "processing") {
    return {
      status: "processing",
      disposition: "in_progress",
      sessionId: input.sessionId,
    };
  }
  return {
    status:
      current.status === "pending" || current.status === "failed"
        ? current.status
        : "failed",
    disposition: "fenced",
    sessionId: input.sessionId,
  };
}

function isTerminal(record: Pick<FeedbackGenerationRecord, "status">): boolean {
  return record.status === "completed" || record.status === "skipped";
}

function terminalResult(
  sessionId: string,
  record: Pick<FeedbackGenerationRecord, "status">
): GenerateFeedbackWorkflowResult {
  return record.status === "completed"
    ? { status: "completed", disposition: "already_terminal", sessionId }
    : { status: "skipped", disposition: "already_terminal", sessionId };
}

function toEvaluationState(value: SessionTier): FeedbackEvaluationState | null {
  if (value === SessionTier.FULL) return "full";
  if (value === SessionTier.PARTIAL) return "partial";
  return null;
}

async function runObservedFeedbackStage<T>(
  input: {
    deps: GenerateFeedbackWorkflowDeps;
    deadlineAtMs: number;
    name: string;
    stage: FeedbackGenerationStage;
    attempt: number;
    successOutcome?: FeedbackGenerationAttemptOutcome;
  },
  work: () => Promise<T>
): Promise<T> {
  const result = await input.deps.steps.run(input.name, async () => {
    const startedAtMs = input.deps.now().getTime();
    try {
      assertFeedbackGenerationBudget(
        input.deadlineAtMs,
        startedAtMs,
        input.stage
      );
      const result = await withDeadline(
        `feedback_generation_${input.stage}`,
        work(),
        getFeedbackGenerationRemainingBudgetMs(input.deadlineAtMs, startedAtMs)
      );
      reportAttemptEvidence(input.deps, input.deadlineAtMs, {
        stage: input.stage,
        attempt: input.attempt,
        outcome: input.successOutcome ?? "succeeded",
        durationMs: Math.max(0, input.deps.now().getTime() - startedAtMs),
      });
      return { disposition: "succeeded" as const, value: result };
    } catch (error) {
      const failure = classifyFeedbackGenerationFailure(error, input.stage);
      reportAttemptEvidence(input.deps, input.deadlineAtMs, {
        stage: input.stage,
        attempt: input.attempt,
        outcome: failure.retryable ? "retrying" : "failed",
        failure,
        durationMs: Math.max(0, input.deps.now().getTime() - startedAtMs),
      });
      if (!failure.retryable) {
        return {
          disposition: "failed" as const,
          failure,
          safeMessage: safeFeedbackGenerationErrorMessage(error, failure),
        };
      }
      throw error;
    }
  });
  if (result.disposition === "failed") {
    throw new FeedbackGenerationPolicyError(result.failure, result.safeMessage);
  }
  return result.value;
}

function isClosedEvaluationFailure(error: unknown): boolean {
  if (
    error instanceof FeedbackProviderInvocationError ||
    error instanceof FeedbackGenerationPolicyError
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    (error.message === "feedback_generation_dimension_coverage_required" ||
      error.message === "feedback_generation_qualitative_constraint_violated")
  );
}

function safeFeedbackGenerationErrorMessage(
  error: unknown,
  failure: FeedbackGenerationFailure
): string {
  return error instanceof Error &&
    /^feedback_generation_[a-z0-9_]+$/.test(error.message)
    ? error.message
    : error instanceof FeedbackProviderInvocationError
      ? error.code
      : feedbackGenerationStatusReason(failure);
}

function throwFeedbackGenerationPolicyFailure(
  message: string,
  stage: FeedbackGenerationStage
): never {
  const error = new Error(message);
  throw new FeedbackGenerationPolicyError(
    classifyFeedbackGenerationFailure(error, stage),
    message
  );
}

function reportAttemptEvidence(
  deps: Pick<GenerateFeedbackWorkflowDeps, "now" | "reportAttempt">,
  deadlineAtMs: number,
  input: {
    stage: FeedbackGenerationStage;
    attempt: number;
    outcome: FeedbackGenerationAttemptOutcome;
    durationMs: number;
    failure?: FeedbackGenerationFailure;
    retryAfterMs?: number | null;
  }
): void {
  try {
    deps.reportAttempt({
      stage: input.stage,
      attempt: input.attempt,
      outcome: input.outcome,
      failureClass: input.failure?.failureClass,
      durationMs: Math.min(90_000, Math.max(0, input.durationMs)),
      remainingBudgetMs: getFeedbackGenerationRemainingBudgetMs(
        deadlineAtMs,
        deps.now().getTime()
      ),
      retryAfterMs: input.retryAfterMs,
      providerDiagnosticKind: input.failure?.providerDiagnosticKind,
      providerHttpStatus: input.failure?.providerHttpStatus,
      observedModel: input.failure?.observedModel,
      observedServiceTier: input.failure?.observedServiceTier,
      usage: input.failure?.usage,
    });
  } catch {
    // Operational evidence is best-effort and cannot change workflow state.
  }
}
