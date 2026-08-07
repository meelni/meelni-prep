import { startOpikFeedbackEvaluationTrace } from "@meelni/integrations/opik";

import { getEvaluationFailureReason } from "@/lib/evaluation/failure-reason";
import {
  createFeedbackGenerationFailureDeps,
  createGenerateFeedbackWorkflowDeps,
  failFeedbackGenerationWorkflow,
  generateFeedbackWorkflow,
  type FeedbackGenerationSteps,
} from "@/lib/workflows/generate-feedback";
import { inngest } from "../client";
import { reportOperationalFailure } from "@/lib/operations/operational-events";
import { reportInterviewEndStage } from "@/lib/operations/interview-end-stage";

interface FeedbackGenerationEventData {
  sessionId: string;
  userId: string;
  tier?: string;
}

export const generateFeedback = inngest.createFunction(
  {
    id: "feedback-generate",
    name: "Generate Interview Feedback",
    retries: 2,
    throttle: { limit: 10, period: "1m" },
    concurrency: [{ limit: 1, key: "event.data.sessionId" }],
    onFailure: async ({ event, step }) => {
      reportOperationalFailure({
        operation: "feedback_dispatch",
        errorCode: "feedback_generation_failed",
        severity: "critical",
        retryable: false,
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
  async ({ event, step }) => {
    const { sessionId, userId } = event.data as FeedbackGenerationEventData;
    const eventId = event.id;
    if (!eventId) throw new Error("feedback_generation_event_id_missing");
    const steps: FeedbackGenerationSteps = {
      run<T>(name: string, work: () => Promise<T>): Promise<T> {
        return step.run(name, work) as unknown as Promise<T>;
      },
      async sendInsights(insightsEvent) {
        await step.sendEvent("trigger-insights-update", insightsEvent);
      },
    };

    const startedAt = Date.now();
    try {
      const result = await generateFeedbackWorkflow(
        { sessionId, userId, eventId },
        createGenerateFeedbackWorkflowDeps(steps, {
          startObservabilityTrace: startOpikFeedbackEvaluationTrace,
        })
      );
      reportInterviewEndStage({
        stage: "feedback_generation",
        outcome:
          result.status === "completed"
            ? "succeeded"
            : result.status === "skipped"
              ? "skipped"
              : "deferred",
        durationMs: Date.now() - startedAt,
        sessionId,
      });
      return result;
    } catch (error) {
      reportInterviewEndStage({
        stage: "feedback_generation",
        outcome: "failed",
        durationMs: Date.now() - startedAt,
        sessionId,
      });
      throw error;
    }
  }
);
