import { inngest } from "../client";

import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import { readShadowFeedbackBatchAuthority } from "@/lib/db/shadow-feedback-batch-authority";
import { createShadowFeedbackArtifactStore } from "@/lib/db/shadow-feedback-artifacts";
import { getSessionById } from "@/lib/db/sessions";
import { getFrozenFeedbackEvaluationEvidence } from "@/lib/db/transcripts";
import { getShadowFeedbackArtifactStorageGate } from "@/lib/evaluation/shadow-feedback-artifact-config";
import { getShadowFeedbackExecutionGate } from "@/lib/evaluation/shadow-feedback-execution-config";
import {
  runShadowFeedbackComparisonRequested,
  runShadowFeedbackEvaluationRequested,
  runShadowFeedbackSchedulingRequested,
  type ShadowFeedbackEvaluationRuntime,
  type ShadowFeedbackRuntimeDescriptor,
  type ShadowFeedbackSessionAuthority,
} from "@/lib/workflows/shadow-feedback";

/**
 * SAV-447 deliberately registers no provider/model composition. Provider-free
 * tests inject a runtime into the handlers; the application remains inert even
 * if an environment capability is set until a separately reviewed adapter is
 * supplied.
 */
const registeredRuntime: ShadowFeedbackEvaluationRuntime | null = null;

export const scheduleShadowFeedback = inngest.createFunction(
  {
    id: "shadow-feedback-schedule",
    name: "Schedule Shadow Feedback",
    retries: 2,
    concurrency: [{ limit: 1, key: "event.data.sessionId" }],
  },
  { event: "feedback/generate.requested" },
  async ({ event, step }) =>
    runShadowFeedbackSchedulingRequested({
      eventId: String(event.id ?? ""),
      data: {
        sessionId: event.data?.sessionId,
        userId: event.data?.userId,
      },
      deps: {
        ...createReadDeps(registeredRuntime),
        steps: {
          async sendEvaluationIntents(events) {
            await step.sendEvent("send-shadow-feedback-intents", [...events]);
          },
        },
      },
    })
);

export const evaluateShadowFeedback = inngest.createFunction(
  {
    id: "shadow-feedback-evaluate",
    name: "Evaluate Shadow Feedback",
    retries: 2,
    concurrency: [{ limit: 1, key: "event.data.intent.key.keyFingerprint" }],
  },
  { event: "feedback/shadow.evaluate.requested" },
  async ({ event, step }) => {
    const storageGate = getShadowFeedbackArtifactStorageGate();
    return runShadowFeedbackEvaluationRequested({
      eventId: String(event.id ?? ""),
      requestedAtMs: event.ts,
      data: event.data,
      deps: {
        executionGate: getShadowFeedbackExecutionGate(),
        storageGate,
        runtime: registeredRuntime,
        store: createShadowFeedbackArtifactStore(),
        steps: {
          run<T>(name: string, work: () => Promise<T>): Promise<T> {
            return step.run(name, work) as unknown as Promise<T>;
          },
          async sleep(name, durationMs) {
            await step.sleep(name, durationMs);
          },
        },
        now: () => new Date(),
        isDeletionPending: hasAccountDeletionTombstone,
        getSession: getShadowSessionAuthority,
        getFrozenEvidence: getShadowFrozenEvidence,
      },
    });
  }
);

export const compareShadowFeedback = inngest.createFunction(
  {
    id: "shadow-feedback-compare",
    name: "Compare Shadow Feedback With Batch Authority",
    retries: 2,
    concurrency: [{ limit: 1, key: "event.data.sessionId" }],
  },
  { event: "insights/update.requested" },
  async ({ event, step }) =>
    runShadowFeedbackComparisonRequested({
      requestedAtMs: event.ts,
      data: {
        sessionId: event.data?.sessionId,
        userId: event.data?.userId,
      },
      deps: {
        ...createReadDeps(registeredRuntime),
        store: createShadowFeedbackArtifactStore(),
        steps: {
          async sleep(name, durationMs) {
            await step.sleep(name, durationMs);
          },
        },
        now: () => new Date(),
        readBatchAuthority: readShadowFeedbackBatchAuthority,
      },
    })
);

function createReadDeps(runtime: ShadowFeedbackRuntimeDescriptor | null) {
  return {
    executionGate: getShadowFeedbackExecutionGate(),
    storageGate: getShadowFeedbackArtifactStorageGate(),
    runtime,
    isDeletionPending: hasAccountDeletionTombstone,
    getSession: getShadowSessionAuthority,
    getFrozenEvidence: getShadowFrozenEvidence,
  };
}

async function getShadowSessionAuthority(
  sessionId: string
): Promise<ShadowFeedbackSessionAuthority | null> {
  const session = await getSessionById(sessionId);
  return session
    ? {
        userId: session.userId,
        roundType: session.roundType,
        terminalFreezeAnchorAtMs:
          session.transcriptEvidenceFrozenAt?.getTime() ?? null,
      }
    : null;
}

async function getShadowFrozenEvidence(sessionId: string) {
  const [evidence, session] = await Promise.all([
    getFrozenFeedbackEvaluationEvidence(sessionId),
    getSessionById(sessionId),
  ]);
  return {
    ...evidence,
    terminalFreezeAnchorAtMs:
      session?.transcriptEvidenceFrozenAt?.getTime() ?? null,
  };
}
