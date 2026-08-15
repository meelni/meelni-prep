import { startOpikFeedbackEvaluationTrace } from "@meelni/integrations/opik";
import { NonRetriableError } from "inngest";

import { getEvaluationFailureReason } from "@/lib/evaluation/failure-reason";
import {
  FeedbackGenerationPolicyError,
  isDurableFeedbackGenerationRetry,
} from "@/lib/evaluation/feedback-generation-policy";
import {
  createFeedbackGenerationFailureDeps,
  createGenerateFeedbackWorkflowDeps,
  failFeedbackGenerationWorkflow,
  generateFeedbackWorkflow,
  type FeedbackGenerationSteps,
  type GenerateFeedbackWorkflowDeps,
  type GenerateFeedbackWorkflowResult,
} from "@/lib/workflows/generate-feedback";
import { inngest } from "../client";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { reportInterviewEndStage } from "@/lib/operations/interview-end-stage";
import { reportFeedbackOutcome } from "@/lib/operations/feedback-outcome";

interface FeedbackGenerationEventData {
  sessionId: string;
  userId: string;
  tier?: string;
}

export interface FeedbackGenerationRequestedHandlerDeps {
  now(): number;
  createWorkflowDeps(
    steps: FeedbackGenerationSteps
  ): GenerateFeedbackWorkflowDeps;
  reportResult(input: {
    result: GenerateFeedbackWorkflowResult;
    sessionId: string;
    durationMs: number;
  }): void;
}

export const FEEDBACK_GENERATION_QUEUE_CONFIG: {
  concurrency: [
    { limit: number },
    { limit: number; key: "event.data.sessionId" },
  ];
} = {
  concurrency: [{ limit: 8 }, { limit: 1, key: "event.data.sessionId" }],
};

export async function runFeedbackGenerationRequested(input: {
  eventId: string;
  requestedAtMs?: number;
  executionAttempt?: number;
  data: FeedbackGenerationEventData;
  steps: FeedbackGenerationSteps;
  deps: FeedbackGenerationRequestedHandlerDeps;
}): Promise<GenerateFeedbackWorkflowResult> {
  if (!input.eventId) throw new Error("feedback_generation_event_id_missing");
  const startedAt = input.deps.now();
  const result = await generateFeedbackWorkflow(
    {
      sessionId: input.data.sessionId,
      userId: input.data.userId,
      eventId: input.eventId,
      requestedAtMs: input.requestedAtMs,
      executionAttempt: input.executionAttempt,
    },
    input.deps.createWorkflowDeps(input.steps)
  );
  input.deps.reportResult({
    result,
    sessionId: input.data.sessionId,
    durationMs: input.deps.now() - startedAt,
  });
  return result;
}

function createFeedbackGenerationRequestedHandlerDeps(): FeedbackGenerationRequestedHandlerDeps {
  return {
    now: () => Date.now(),
    createWorkflowDeps: (steps) =>
      createGenerateFeedbackWorkflowDeps(steps, {
        startObservabilityTrace: startOpikFeedbackEvaluationTrace,
      }),
    reportResult: ({ result, sessionId, durationMs }) => {
      const endToFeedbackMs =
        result.status === "completed" || result.status === "skipped"
          ? result.endToFeedbackMs
          : undefined;
      reportInterviewEndStage({
        stage: "feedback_generation",
        outcome:
          result.status === "completed"
            ? "succeeded"
            : result.status === "skipped"
              ? "skipped"
              : "deferred",
        durationMs: endToFeedbackMs ?? durationMs,
        sessionId,
        ...(endToFeedbackMs !== undefined
          ? { slo: "feedback_completion" as const }
          : {}),
      });
      if (result.status === "completed") {
        reportFeedbackOutcome({
          outcomeReason: "feedback_generated",
          sessionId,
        });
      } else if (result.status === "skipped" && result.reason) {
        reportFeedbackOutcome({ outcomeReason: result.reason, sessionId });
      }
    },
  };
}

export const generateFeedback = inngest.createFunction(
  {
    id: "feedback-generate",
    name: "Generate Interview Feedback",
    retries: 2,
    ...FEEDBACK_GENERATION_QUEUE_CONFIG,
    onFailure: async ({ event, step }) => {
      reportOperationalFailure({
        operation: "feedback_dispatch",
        errorCode: "feedback_generation_failed",
        severity: "critical",
        retryable: false,
      });
      reportFeedbackOutcome({
        outcomeReason: "generation_failed",
        sessionId: event.data.event.data?.sessionId,
      });
      const failedEvent = event.data.event;
      const sessionId = String(failedEvent.data?.sessionId ?? "");
      const userId = String(failedEvent.data?.userId ?? "");
      const eventId = String(failedEvent.id ?? "");
      if (!sessionId || !userId || !eventId) return;

      await step.run("fail-feedback-generation", () =>
        failFeedbackGenerationWorkflow(
          {
            sessionId,
            userId,
            eventId,
            reason: getEvaluationFailureReason(event.data.error),
          },
          createFeedbackGenerationFailureDeps()
        )
      );
    },
  },
  { event: "feedback/generate.requested" },
  async ({ event, step, attempt }) => {
    const { sessionId, userId } = event.data as FeedbackGenerationEventData;
    const eventId = event.id;
    if (!eventId) throw new Error("feedback_generation_event_id_missing");
    const steps: FeedbackGenerationSteps = {
      run<T>(name: string, work: () => Promise<T>): Promise<T> {
        return step.run(name, work) as unknown as Promise<T>;
      },
      async sleep(name, durationMs) {
        await step.sleep(name, durationMs);
      },
      async sendInsights(insightsEvent) {
        await step.sendEvent("trigger-insights-update", insightsEvent);
      },
    };

    const handlerDeps = createFeedbackGenerationRequestedHandlerDeps();
    const startedAt = handlerDeps.now();
    try {
      return await runFeedbackGenerationRequested({
        eventId,
        requestedAtMs: event.ts,
        executionAttempt: attempt,
        data: { sessionId, userId },
        steps,
        deps: handlerDeps,
      });
    } catch (error) {
      reportInterviewEndStage({
        stage: "feedback_generation",
        outcome: "failed",
        durationMs: handlerDeps.now() - startedAt,
        sessionId,
      });
      if (
        !isDurableFeedbackGenerationRetry(error) &&
        error instanceof FeedbackGenerationPolicyError
      ) {
        throw new NonRetriableError(error.message, { cause: error });
      }
      throw error;
    }
  }
);
