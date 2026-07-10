import {
  prepareFeedbackTranscript,
  type FeedbackEvaluationState,
  type FeedbackV2Result,
  type PreparedFeedbackTranscript,
} from "@meelni/core";

import {
  createDrizzleFeedbackGenerationStore,
  type FeedbackGenerationRecord,
  type FeedbackGenerationStore,
} from "@/lib/db/feedback-generation-state";
import { getSessionById } from "@/lib/db/sessions";
import { getSessionTranscript } from "@/lib/db/transcripts";
import { generateFeedback as generateEvaluation } from "@/lib/evaluation/scorer";
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
  getSession(sessionId: string): Promise<FeedbackGenerationSession | null>;
  validateLegacy(sessionId: string): Promise<SessionValidation>;
  getTranscript(sessionId: string): Promise<PreparedFeedbackTranscript>;
  evaluate(input: {
    roundType: string;
    transcript: PreparedFeedbackTranscript["transcript"];
    evaluationState: FeedbackEvaluationState;
  }): Promise<FeedbackV2Result>;
}

export type GenerateFeedbackWorkflowResult =
  | {
      status: "completed";
      disposition: "applied" | "already_terminal";
      sessionId: string;
      overallScore?: number;
    }
  | {
      status: "skipped";
      disposition: "applied" | "already_terminal";
      sessionId: string;
      reason?: string;
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
        reason:
          validation.reasons.join(", ") ||
          "Session is not eligible for feedback",
        completionTier: "insufficient",
      });
    }
    evaluationState = validatedState;
  } else {
    return skipClaimedFeedback({
      input,
      deps,
      reason: "Session is not eligible for feedback",
    });
  }

  const transcript = await deps.steps.run("fetch-feedback-transcript", () =>
    deps.getTranscript(input.sessionId)
  );
  if (!transcript.eligible || transcript.transcript.length === 0) {
    return skipClaimedFeedback({
      input,
      deps,
      reason:
        transcript.reasons[0] || "No trustworthy transcript evidence found",
      completionTier: "insufficient",
    });
  }

  const evaluated = await deps.steps.run("evaluate-feedback", async () => {
    const startedAt = deps.now();
    const evaluation = await deps.evaluate({
      roundType: authorization.session.roundType || "product_sense",
      transcript: transcript.transcript,
      evaluationState,
    });
    if (evaluation.evaluationState !== evaluationState) {
      throw new Error("feedback_generation_evaluation_state_mismatch");
    }
    return {
      evaluation,
      processingDurationMs: Math.max(
        0,
        deps.now().getTime() - startedAt.getTime()
      ),
    };
  });

  const applied = await deps.steps.run("complete-feedback-generation", () =>
    deps.store.complete({
      sessionId: input.sessionId,
      eventId: input.eventId,
      evaluation: evaluated.evaluation,
      processingDurationMs: evaluated.processingDurationMs,
    })
  );
  if (!applied) {
    const current = await deps.steps.run("read-fenced-feedback-generation", () =>
      deps.store.get(input.sessionId)
    );
    return unclaimedResult(input, current);
  }

  await deps.steps.sendInsights({
    id: `insights:update:${input.sessionId}:${input.eventId}`,
    name: "insights/update.requested",
    data: { userId: input.userId, sessionId: input.sessionId },
  });

  return {
    status: "completed",
    disposition: "applied",
    sessionId: input.sessionId,
    overallScore: evaluated.evaluation.overallScore,
  };
}

export async function failFeedbackGenerationWorkflow(
  input: GenerateFeedbackWorkflowInput & { reason: string },
  deps: Pick<GenerateFeedbackWorkflowDeps, "store" | "getSession">
): Promise<boolean> {
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
  "store" | "getSession"
> {
  return {
    store: createDrizzleFeedbackGenerationStore(),
    async getSession(sessionId) {
      const session = await getSessionById(sessionId);
      return session
        ? { userId: session.userId, roundType: session.roundType }
        : null;
    },
  };
}

export function createGenerateFeedbackWorkflowDeps(
  steps: FeedbackGenerationSteps
): GenerateFeedbackWorkflowDeps {
  return {
    store: createDrizzleFeedbackGenerationStore(),
    steps,
    now: () => new Date(),
    async getSession(sessionId) {
      const session = await getSessionById(sessionId);
      return session
        ? { userId: session.userId, roundType: session.roundType }
        : null;
    },
    validateLegacy: validateSessionCompleteness,
    async getTranscript(sessionId) {
      return prepareFeedbackTranscript(await getSessionTranscript(sessionId), {
        requireContractV2: true,
      });
    },
    evaluate: ({ roundType, transcript, evaluationState }) =>
      generateEvaluation(roundType, transcript, evaluationState),
  };
}

async function skipClaimedFeedback(input: {
  input: GenerateFeedbackWorkflowInput;
  deps: GenerateFeedbackWorkflowDeps;
  reason: string;
  completionTier?: "insufficient";
}): Promise<GenerateFeedbackWorkflowResult> {
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
  if (
    current.eventId === input.eventId &&
    current.status === "processing"
  ) {
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

function isTerminal(
  record: Pick<FeedbackGenerationRecord, "status">
): boolean {
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
