import {
  prepareFeedbackTranscript,
  isEvidenceLimitedFeedbackResult,
  FEEDBACK_NUMERICAL_PRECISION_POLICY,
  type FeedbackEvaluationState,
  type FeedbackEvaluationResult,
  type PreparedFeedbackTranscript,
  type SkippedFeedbackOutcomeReason,
} from "@meelni/core";

import {
  createDrizzleFeedbackGenerationStore,
  type FeedbackGenerationRecord,
  type FeedbackGenerationStore,
} from "@/lib/db/feedback-generation-state";
import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import { getSessionById } from "@/lib/db/sessions";
import { getFrozenFeedbackTranscriptTurns } from "@/lib/db/transcripts";
import {
  generateFeedback as generateEvaluation,
  type StartFeedbackObservabilityTrace,
} from "@/lib/evaluation/scorer";
import { generateEvidenceLimitedFeedback } from "@/lib/evaluation/evidence-limited-scorer";
import {
  SessionTier,
  validateSessionCompleteness,
  type SessionValidation,
} from "@/lib/evaluation/session-validator";
import { resolveFeedbackGenerationEligibility } from "./feedback-generation-evidence";

export interface GenerateFeedbackWorkflowInput {
  sessionId: string;
  userId: string;
  eventId: string;
}

export interface FeedbackGenerationSession {
  userId: string;
  roundType: string;
  endingAtMs?: number | null;
}

export interface FeedbackGenerationSteps {
  run<T>(name: string, work: () => Promise<T>): Promise<T>;
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
  getTranscript(sessionId: string): Promise<PreparedFeedbackTranscript>;
  evaluate(input: {
    roundType: string;
    transcript: PreparedFeedbackTranscript["transcript"];
    evaluationState: FeedbackEvaluationState;
    mode: "scored" | "evidence_limited";
  }): Promise<FeedbackEvaluationResult>;
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
  await assertAccountIsActive(input.userId, deps);
  const authorization = await deps.steps.run(
    "authorize-feedback-generation",
    async () => {
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

  const claimed = await deps.steps.run("claim-feedback-generation", () =>
    deps.store.claim({
      sessionId: input.sessionId,
      eventId: input.eventId,
      now: deps.now(),
    })
  );
  if (!claimed) {
    const current = await deps.steps.run("read-feedback-generation-claim", () =>
      deps.store.get(input.sessionId)
    );
    return unclaimedResult(input, current);
  }

  await assertAccountIsActive(input.userId, deps);

  const eligibility = resolveFeedbackGenerationEligibility(
    claimed.completionTier
  );
  let evaluationState: FeedbackEvaluationState;
  if (eligibility.disposition === "committed_eligible") {
    const committedState = toEvaluationState(eligibility.tier);
    if (!committedState) {
      throw new Error("feedback_generation_invalid_committed_tier");
    }
    evaluationState = committedState;
  } else if (eligibility.disposition === "legacy_requires_validation") {
    const validation = await deps.steps.run("validate-legacy-session", () =>
      deps.validateLegacy(input.sessionId)
    );
    const validatedState = toEvaluationState(validation.tier);
    if (!validation.isValid || !validatedState) {
      return skipClaimedFeedback({
        input,
        deps,
        endingAtMs: authorization.session.endingAtMs,
        reason: validation.evidenceFailureReason ?? "no_reviewable_answer",
        completionTier: "insufficient",
      });
    }
    evaluationState = validatedState;
  } else {
    return skipClaimedFeedback({
      input,
      deps,
      endingAtMs: authorization.session.endingAtMs,
      reason:
        claimed.outcomeReason === "transcript_integrity_degraded"
          ? "transcript_integrity_degraded"
          : "no_reviewable_answer",
    });
  }

  const transcript = await deps.steps.run("fetch-feedback-transcript", () =>
    deps.getTranscript(input.sessionId)
  );
  if (!transcript.eligible || transcript.transcript.length === 0) {
    return skipClaimedFeedback({
      input,
      deps,
      endingAtMs: authorization.session.endingAtMs,
      reason: transcript.issues.some(
        (issue) =>
          issue.fatal &&
          (issue.code === "malformed_event" ||
            issue.code === "prompt_injection")
      )
        ? "transcript_integrity_degraded"
        : "no_reviewable_answer",
      completionTier: "insufficient",
    });
  }

  await assertAccountIsActive(input.userId, deps);

  const evaluated = await deps.steps.run("evaluate-feedback", async () => {
    const current = await deps.store.get(input.sessionId);
    if (
      !current ||
      current.status !== "processing" ||
      current.eventId !== input.eventId
    ) {
      return { disposition: "fenced" as const };
    }

    const startedAt = deps.now();
    const mode =
      evaluationState === "partial" &&
      (claimed.completionStats?.substantiveResponses ?? 1) <
        FEEDBACK_NUMERICAL_PRECISION_POLICY.minSubstantiveResponses
        ? "evidence_limited"
        : "scored";
    const evaluation = await deps.evaluate({
      roundType: authorization.session.roundType || "product_sense",
      transcript: transcript.transcript,
      evaluationState,
      mode,
    });
    if (evaluation.evaluationState !== evaluationState) {
      throw new Error("feedback_generation_evaluation_state_mismatch");
    }
    return {
      disposition: "evaluated" as const,
      evaluation,
      processingDurationMs: Math.max(
        0,
        deps.now().getTime() - startedAt.getTime()
      ),
    };
  });
  if (evaluated.disposition === "fenced") {
    const current = await deps.steps.run(
      "read-fenced-feedback-evaluation",
      () => deps.store.get(input.sessionId)
    );
    return unclaimedResult(input, current);
  }

  const applied = await deps.steps.run("complete-feedback-generation", () =>
    assertAccountIsActive(input.userId, deps).then(() =>
      deps.store.complete({
        sessionId: input.sessionId,
        eventId: input.eventId,
        evaluation: evaluated.evaluation,
        processingDurationMs: evaluated.processingDurationMs,
      })
    )
  );
  if (!applied) {
    const current = await deps.steps.run(
      "read-fenced-feedback-generation",
      () => deps.store.get(input.sessionId)
    );
    return unclaimedResult(input, current);
  }
  const completedAt = deps.now();

  await deps.steps.sendInsights({
    id: `insights:update:${input.sessionId}:${input.eventId}`,
    name: "insights/update.requested",
    data: { userId: input.userId, sessionId: input.sessionId },
  });

  return {
    status: "completed",
    disposition: "applied",
    sessionId: input.sessionId,
    ...(!isEvidenceLimitedFeedbackResult(evaluated.evaluation)
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
    async getTranscript(sessionId) {
      return prepareFeedbackTranscript(
        await getFrozenFeedbackTranscriptTurns(sessionId),
        { requireContractV2: true }
      );
    },
    evaluate: ({ roundType, transcript, evaluationState, mode }) =>
      mode === "evidence_limited"
        ? generateEvidenceLimitedFeedback(roundType, transcript, {
            startObservabilityTrace: dependencies.startObservabilityTrace,
          })
        : generateEvaluation(roundType, transcript, evaluationState, {
            startObservabilityTrace: dependencies.startObservabilityTrace,
          }),
  };
}

async function assertAccountIsActive(
  userId: string,
  deps: Pick<GenerateFeedbackWorkflowDeps, "isDeletionPending">
): Promise<void> {
  if (await deps.isDeletionPending(userId)) {
    throw new Error("feedback_generation_account_deletion_pending");
  }
}

async function skipClaimedFeedback(input: {
  input: GenerateFeedbackWorkflowInput;
  deps: GenerateFeedbackWorkflowDeps;
  endingAtMs: number | null | undefined;
  reason: SkippedFeedbackOutcomeReason;
  completionTier?: "insufficient";
}): Promise<GenerateFeedbackWorkflowResult> {
  await assertAccountIsActive(input.input.userId, input.deps);
  const applied = await input.deps.steps.run("skip-feedback-generation", () =>
    input.deps.store.skip({
      sessionId: input.input.sessionId,
      eventId: input.input.eventId,
      reason: input.reason,
      completionTier: input.completionTier,
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
