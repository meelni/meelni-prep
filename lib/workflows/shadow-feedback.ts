import {
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  SHADOW_FEEDBACK_ARTIFACT_VERSION,
  SHADOW_FEEDBACK_SCHEDULING_INTENT_VERSION,
  compareShadowFeedbackWithBatch,
  createShadowFeedbackSchedulingIntents,
  parseShadowFeedbackArtifact,
  parseShadowFeedbackCostRates,
  parseShadowFeedbackSchedulingIntent,
  type CandidateAnswerBlock,
  type ShadowFeedbackArtifactMetrics,
  type ShadowFeedbackArtifactSetV1,
  type ShadowFeedbackArtifactV1,
  type ShadowFeedbackBatchAuthorityV1,
  type ShadowFeedbackComparisonReportV1,
  type ShadowFeedbackCostRatesV1,
  type ShadowFeedbackSchedulingIntentV1,
  type TrustedAnswerBlockProjection,
} from "@meelni/core";

import type { ShadowFeedbackArtifactStore } from "@/lib/db/shadow-feedback-artifacts";
import {
  isShadowFeedbackArtifactStorageEnabledContext,
  type ShadowFeedbackArtifactStorageGate,
} from "@/lib/evaluation/shadow-feedback-artifact-config";
import {
  isShadowFeedbackExecutionEnabledContext,
  type ShadowFeedbackExecutionGate,
} from "@/lib/evaluation/shadow-feedback-execution-config";
import {
  FEEDBACK_GENERATION_MAX_PROVIDER_ATTEMPTS,
  FEEDBACK_GENERATION_DEADLINE_MS,
  FEEDBACK_PROVIDER_MAX_RETRY_DELAY_MS,
  FeedbackGenerationPolicyError,
  classifyFeedbackGenerationFailure,
  deadlineExceededFailure,
  getFeedbackGenerationDeadlineAt,
  planFeedbackProviderAttempt,
  type FeedbackGenerationFailure,
} from "@/lib/evaluation/feedback-generation-policy";
import type { FeedbackProviderUsage } from "@/lib/evaluation/scorer";
import {
  prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot,
  type FrozenCandidateAnswerBlockEvidenceSnapshot,
} from "@/lib/evaluation/session-validator";
import { withDeadline } from "@/lib/http/deadline";

export const SHADOW_FEEDBACK_EVALUATION_EVENT_VERSION =
  "feedback.shadow-evaluation-event.v1" as const;

const MAX_EVENT_BYTES = 8_000;
const MAX_EVENT_ID_LENGTH = 256;
const MAX_VERSION_LENGTH = 96;
const MAX_INTENTS_PER_SESSION = 100;
export const SHADOW_FEEDBACK_COMPARISON_WAIT_MS = 5_000;
export const SHADOW_FEEDBACK_COMPARISON_MAX_WAIT_MS =
  FEEDBACK_GENERATION_DEADLINE_MS;
export const SHADOW_FEEDBACK_COMPARISON_MAX_READS =
  SHADOW_FEEDBACK_COMPARISON_MAX_WAIT_MS / SHADOW_FEEDBACK_COMPARISON_WAIT_MS +
  1;

export interface ShadowFeedbackRuntimeDescriptor {
  rubricVersion: string;
  promptVersion: string;
  selectionSchemaVersion: string;
  modelVersion: string;
  costRates: ShadowFeedbackCostRatesV1 | null;
}

export interface ShadowFeedbackEvaluator {
  evaluate(input: {
    answerBlock: CandidateAnswerBlock;
    roundType: "product_sense" | "execution" | "behavioral" | "strategy";
    attempt: number;
    deadlineAtMs: number;
    requestTimeoutMs: number;
    idempotencyKey: string;
  }): Promise<unknown>;
}

export interface ShadowFeedbackEvaluationRuntime
  extends ShadowFeedbackRuntimeDescriptor {
  evaluator: ShadowFeedbackEvaluator;
}

export interface ShadowFeedbackEvaluationEventDataV1 {
  contractVersion: typeof SHADOW_FEEDBACK_EVALUATION_EVENT_VERSION;
  userId: string;
  intent: ShadowFeedbackSchedulingIntentV1;
}

export interface ShadowFeedbackFrozenEvidence
  extends FrozenCandidateAnswerBlockEvidenceSnapshot {
  terminalFreezeAnchorAtMs: number | null;
}

export interface ShadowFeedbackSessionAuthority {
  userId: string;
  roundType: string;
  terminalFreezeAnchorAtMs: number | null;
}

export interface ShadowFeedbackSchedulingSteps {
  sendEvaluationIntents(
    events: readonly {
      id: string;
      name: "feedback/shadow.evaluate.requested";
      data: ShadowFeedbackEvaluationEventDataV1;
    }[]
  ): Promise<void>;
}

export interface ShadowFeedbackEvaluationSteps {
  run<T>(name: string, work: () => Promise<T>): Promise<T>;
  sleep(name: string, durationMs: number): Promise<void>;
}

export interface ShadowFeedbackComparisonSteps {
  sleep(name: string, durationMs: number): Promise<void>;
}

interface ShadowFeedbackGateDeps {
  executionGate: ShadowFeedbackExecutionGate;
  storageGate: ShadowFeedbackArtifactStorageGate;
}

interface ShadowFeedbackReadDeps extends ShadowFeedbackGateDeps {
  runtime: ShadowFeedbackRuntimeDescriptor | null;
  isDeletionPending(userId: string): Promise<boolean>;
  getSession(sessionId: string): Promise<ShadowFeedbackSessionAuthority | null>;
  getFrozenEvidence(sessionId: string): Promise<ShadowFeedbackFrozenEvidence>;
}

export interface ShadowFeedbackSchedulingDeps extends ShadowFeedbackReadDeps {
  steps: ShadowFeedbackSchedulingSteps;
}

export interface ShadowFeedbackEvaluationDeps extends ShadowFeedbackGateDeps {
  runtime: ShadowFeedbackEvaluationRuntime | null;
  store: ShadowFeedbackArtifactStore;
  steps: ShadowFeedbackEvaluationSteps;
  now(): Date;
  isDeletionPending(userId: string): Promise<boolean>;
  getSession(sessionId: string): Promise<ShadowFeedbackSessionAuthority | null>;
  getFrozenEvidence(sessionId: string): Promise<ShadowFeedbackFrozenEvidence>;
}

export interface ShadowFeedbackComparisonDeps extends ShadowFeedbackReadDeps {
  store: ShadowFeedbackArtifactStore;
  steps: ShadowFeedbackComparisonSteps;
  now(): Date;
  readBatchAuthority(input: {
    sessionId: string;
    projection: TrustedAnswerBlockProjection;
    terminalFreezeAnchorAtMs: number;
  }): Promise<ShadowFeedbackBatchAuthorityV1 | null>;
}

export type ShadowFeedbackSchedulingResult =
  | { status: "disabled" | "runtime_unavailable" | "fenced"; intentCount: 0 }
  | { status: "not_schedulable"; intentCount: 0 }
  | { status: "scheduled"; intentCount: number };

export type ShadowFeedbackEvaluationResult =
  | {
      status:
        | "disabled"
        | "runtime_unavailable"
        | "fenced"
        | "not_schedulable"
        | "persistence_rejected";
      outcome: null;
    }
  | {
      status: "already_terminal" | "recorded";
      outcome: "completed" | "failed";
    };

export type ShadowFeedbackComparisonResult =
  | {
      status:
        | "disabled"
        | "runtime_unavailable"
        | "fenced"
        | "not_schedulable"
        | "batch_unavailable";
      report: null;
    }
  | { status: "reported"; report: ShadowFeedbackComparisonReportV1 };

export async function runShadowFeedbackSchedulingRequested(input: {
  eventId: string;
  data: unknown;
  deps: ShadowFeedbackSchedulingDeps;
}): Promise<ShadowFeedbackSchedulingResult> {
  if (!hasActiveCapabilities(input.deps)) {
    return { status: "disabled", intentCount: 0 };
  }
  const runtime = parseRuntimeDescriptor(input.deps.runtime);
  if (!runtime) return { status: "runtime_unavailable", intentCount: 0 };
  requireEventId(input.eventId);
  const data = parseRequestedSession(input.data);
  if (await input.deps.isDeletionPending(data.userId)) {
    return { status: "fenced", intentCount: 0 };
  }
  const session = await input.deps.getSession(data.sessionId);
  if (
    !session ||
    session.userId !== data.userId ||
    !isRoundType(session.roundType) ||
    !isEpochMs(session.terminalFreezeAnchorAtMs)
  ) {
    return { status: "fenced", intentCount: 0 };
  }
  const evidence = await input.deps.getFrozenEvidence(data.sessionId);
  if (
    evidence.terminalFreezeAnchorAtMs !== session.terminalFreezeAnchorAtMs ||
    !evidence.snapshotValid ||
    !evidence.authority
  ) {
    return { status: "not_schedulable", intentCount: 0 };
  }
  const prepared =
    prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot(evidence);
  const intents = createShadowFeedbackSchedulingIntents({
    sessionId: data.sessionId,
    projection: prepared.projection,
    terminalFreezeAnchorAtMs: session.terminalFreezeAnchorAtMs,
    rubricVersion: runtime.rubricVersion,
    promptVersion: runtime.promptVersion,
    selectionSchemaVersion: runtime.selectionSchemaVersion,
    modelVersion: runtime.modelVersion,
  });
  if (
    !prepared.eligible ||
    intents.length === 0 ||
    intents.length > MAX_INTENTS_PER_SESSION
  ) {
    return { status: "not_schedulable", intentCount: 0 };
  }
  const events = intents.map((intent) => ({
    id: deterministicEvaluationEventId(intent),
    name: "feedback/shadow.evaluate.requested" as const,
    data: parseShadowFeedbackEvaluationEventData({
      contractVersion: SHADOW_FEEDBACK_EVALUATION_EVENT_VERSION,
      userId: data.userId,
      intent,
    }),
  }));
  if (
    !(await revalidateActiveShadowFence({
      userId: data.userId,
      sessionId: data.sessionId,
      terminalFreezeAnchorAtMs: session.terminalFreezeAnchorAtMs,
      deps: input.deps,
    }))
  ) {
    return { status: "fenced", intentCount: 0 };
  }
  await input.deps.steps.sendEvaluationIntents(events);
  return { status: "scheduled", intentCount: events.length };
}

export async function runShadowFeedbackEvaluationRequested(input: {
  eventId: string;
  requestedAtMs?: number;
  data: unknown;
  deps: ShadowFeedbackEvaluationDeps;
}): Promise<ShadowFeedbackEvaluationResult> {
  if (!hasActiveCapabilities(input.deps)) {
    return { status: "disabled", outcome: null };
  }
  const runtime = parseEvaluationRuntime(input.deps.runtime);
  if (!runtime) return { status: "runtime_unavailable", outcome: null };
  requireEventId(input.eventId);
  const data = parseShadowFeedbackEvaluationEventData(input.data);
  if (!intentMatchesRuntime(data.intent, runtime)) {
    return { status: "fenced", outcome: null };
  }
  if (await input.deps.isDeletionPending(data.userId)) {
    return { status: "fenced", outcome: null };
  }
  const session = await input.deps.getSession(data.intent.key.sessionId);
  if (
    !session ||
    session.userId !== data.userId ||
    !isRoundType(session.roundType) ||
    session.terminalFreezeAnchorAtMs !== data.intent.terminalFreezeAnchorAtMs
  ) {
    return { status: "fenced", outcome: null };
  }
  const roundType = session.roundType;
  const evidence = await input.deps.getFrozenEvidence(
    data.intent.key.sessionId
  );
  if (
    evidence.terminalFreezeAnchorAtMs !==
      data.intent.terminalFreezeAnchorAtMs ||
    !evidence.snapshotValid ||
    !evidence.authority
  ) {
    return { status: "not_schedulable", outcome: null };
  }
  const prepared =
    prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot(evidence);
  const expectedIntents = createShadowFeedbackSchedulingIntents({
    sessionId: data.intent.key.sessionId,
    projection: prepared.projection,
    terminalFreezeAnchorAtMs: data.intent.terminalFreezeAnchorAtMs,
    rubricVersion: runtime.rubricVersion,
    promptVersion: runtime.promptVersion,
    selectionSchemaVersion: runtime.selectionSchemaVersion,
    modelVersion: runtime.modelVersion,
  });
  const expectedIndex = expectedIntents.findIndex(
    ({ intentId }) => intentId === data.intent.intentId
  );
  if (
    !prepared.eligible ||
    expectedIndex < 0 ||
    JSON.stringify(expectedIntents[expectedIndex]) !==
      JSON.stringify(data.intent)
  ) {
    return { status: "not_schedulable", outcome: null };
  }
  const answerBlock = prepared.projection.trustedBlocks[expectedIndex]!;
  if (
    !(await revalidateActiveShadowFence({
      userId: data.userId,
      sessionId: data.intent.key.sessionId,
      terminalFreezeAnchorAtMs: data.intent.terminalFreezeAnchorAtMs,
      deps: input.deps,
    }))
  ) {
    return { status: "fenced", outcome: null };
  }
  const existing = await input.deps.store.readExact(input.deps.storageGate, [
    data.intent.key,
  ]);
  const existingArtifact = existing.artifacts[0];
  if (existingArtifact) {
    return {
      status: "already_terminal",
      outcome: existingArtifact.outcome.state,
    };
  }
  if (existing.status === "invalid") {
    return { status: "fenced", outcome: null };
  }

  const deadlineAtMs = getFeedbackGenerationDeadlineAt({
    requestedAtMs: normalizeRequestedAtMs(input.requestedAtMs),
    nowMs: input.deps.now().getTime(),
  });
  const startedAtMs = input.deps.now().getTime();
  let retryAfterMs: number | null = null;
  for (
    let attempt = 1;
    attempt <= FEEDBACK_GENERATION_MAX_PROVIDER_ATTEMPTS;
    attempt += 1
  ) {
    const plan = planFeedbackProviderAttempt({
      attempt,
      deadlineAtMs,
      nowMs: input.deps.now().getTime(),
      retryAfterMs,
    });
    if (!plan) {
      return persistFailedArtifact({
        data,
        userId: data.userId,
        failure: deadlineExceededFailure("provider"),
        startedAtMs,
        deps: input.deps,
      });
    }
    if (plan.delayMs > 0) {
      await input.deps.steps.sleep(
        `wait-shadow-feedback-${shortIntentId(data.intent)}-${attempt - 1}`,
        plan.delayMs
      );
      if (
        !(await revalidateShadowFence({
          userId: data.userId,
          sessionId: data.intent.key.sessionId,
          terminalFreezeAnchorAtMs: data.intent.terminalFreezeAnchorAtMs,
          deps: input.deps,
        }))
      ) {
        return { status: "fenced", outcome: null };
      }
    }
    if (
      !(await revalidateActiveShadowFence({
        userId: data.userId,
        sessionId: data.intent.key.sessionId,
        terminalFreezeAnchorAtMs: data.intent.terminalFreezeAnchorAtMs,
        deps: input.deps,
      }))
    ) {
      return { status: "fenced", outcome: null };
    }
    const beforeAttempt = await input.deps.store.readExact(
      input.deps.storageGate,
      [data.intent.key]
    );
    if (beforeAttempt.artifacts[0]) {
      return {
        status: "already_terminal",
        outcome: beforeAttempt.artifacts[0].outcome.state,
      };
    }
    if (beforeAttempt.status === "invalid") {
      return { status: "fenced", outcome: null };
    }
    const attemptResult = await input.deps.steps.run(
      `evaluate-shadow-feedback-${shortIntentId(data.intent)}-${attempt}`,
      async () => {
        const attemptStartedAtMs = input.deps.now().getTime();
        try {
          if (
            !(await revalidateActiveShadowFence({
              userId: data.userId,
              sessionId: data.intent.key.sessionId,
              terminalFreezeAnchorAtMs: data.intent.terminalFreezeAnchorAtMs,
              deps: input.deps,
            }))
          ) {
            throw new Error("shadow_feedback_fenced");
          }
          const currentAttemptPlan = planFeedbackProviderAttempt({
            attempt,
            deadlineAtMs,
            nowMs: input.deps.now().getTime(),
            retryDelayApplied: true,
          });
          if (!currentAttemptPlan) {
            throw new FeedbackGenerationPolicyError(
              deadlineExceededFailure("provider")
            );
          }
          const output = await withDeadline(
            "feedback_provider_attempt",
            runtime.evaluator.evaluate({
              answerBlock,
              roundType,
              attempt,
              deadlineAtMs,
              requestTimeoutMs: currentAttemptPlan.requestTimeoutMs,
              idempotencyKey: data.intent.idempotencyKey,
            }),
            currentAttemptPlan.requestTimeoutMs
          );
          return normalizeCompletedEvaluation({
            output,
            intent: data.intent,
            roundType,
            startedAtMs: attemptStartedAtMs,
            completedAt: input.deps.now(),
          });
        } catch (error) {
          const completedAtMs = input.deps.now().getTime();
          const failure = classifyFeedbackGenerationFailure(
            error,
            "validation"
          );
          return {
            disposition: "failed" as const,
            failure: contentFreeFailure(failure),
            durationMs: boundedDuration(completedAtMs - attemptStartedAtMs),
          };
        }
      }
    );
    if (attemptResult.disposition === "completed") {
      return persistArtifact({
        userId: data.userId,
        artifact: attemptResult.artifact,
        terminalFreezeAnchorAtMs: data.intent.terminalFreezeAnchorAtMs,
        deps: input.deps,
      });
    }
    const nextPlan = attemptResult.failure.retryable
      ? planFeedbackProviderAttempt({
          attempt: attempt + 1,
          deadlineAtMs,
          nowMs: input.deps.now().getTime(),
          retryAfterMs: attemptResult.failure.retryAfterMs,
        })
      : null;
    if (!nextPlan) {
      return persistFailedArtifact({
        data,
        userId: data.userId,
        failure: attemptResult.failure,
        startedAtMs,
        deps: input.deps,
      });
    }
    retryAfterMs = attemptResult.failure.retryAfterMs;
  }
  return persistFailedArtifact({
    data,
    userId: data.userId,
    failure: deadlineExceededFailure("provider"),
    startedAtMs,
    deps: input.deps,
  });
}

export async function runShadowFeedbackComparisonRequested(input: {
  requestedAtMs?: number;
  data: unknown;
  deps: ShadowFeedbackComparisonDeps;
}): Promise<ShadowFeedbackComparisonResult> {
  if (!hasActiveCapabilities(input.deps)) {
    return { status: "disabled", report: null };
  }
  const runtime = parseRuntimeDescriptor(input.deps.runtime);
  if (!runtime) return { status: "runtime_unavailable", report: null };
  const data = parseRequestedSession(input.data);
  if (await input.deps.isDeletionPending(data.userId)) {
    return { status: "fenced", report: null };
  }
  const session = await input.deps.getSession(data.sessionId);
  if (
    !session ||
    session.userId !== data.userId ||
    !isRoundType(session.roundType) ||
    !isEpochMs(session.terminalFreezeAnchorAtMs)
  ) {
    return { status: "fenced", report: null };
  }
  const evidence = await input.deps.getFrozenEvidence(data.sessionId);
  if (
    evidence.terminalFreezeAnchorAtMs !== session.terminalFreezeAnchorAtMs ||
    !evidence.snapshotValid ||
    !evidence.authority
  ) {
    return { status: "not_schedulable", report: null };
  }
  const prepared =
    prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot(evidence);
  const intents = createShadowFeedbackSchedulingIntents({
    sessionId: data.sessionId,
    projection: prepared.projection,
    terminalFreezeAnchorAtMs: session.terminalFreezeAnchorAtMs,
    rubricVersion: runtime.rubricVersion,
    promptVersion: runtime.promptVersion,
    selectionSchemaVersion: runtime.selectionSchemaVersion,
    modelVersion: runtime.modelVersion,
  });
  if (!prepared.eligible || intents.length === 0) {
    return { status: "not_schedulable", report: null };
  }
  if (
    !(await revalidateActiveShadowFence({
      userId: data.userId,
      sessionId: data.sessionId,
      terminalFreezeAnchorAtMs: session.terminalFreezeAnchorAtMs,
      deps: input.deps,
    }))
  ) {
    return { status: "fenced", report: null };
  }
  const comparisonRequestedAtMs = normalizeComparisonRequestedAtMs(
    input.requestedAtMs,
    input.deps.now().getTime()
  );
  const comparisonDeadlineAtMs =
    comparisonRequestedAtMs + SHADOW_FEEDBACK_COMPARISON_MAX_WAIT_MS;
  let artifactSet: ShadowFeedbackArtifactSetV1 | null = null;
  for (
    let readAttempt = 1;
    readAttempt <= SHADOW_FEEDBACK_COMPARISON_MAX_READS;
    readAttempt += 1
  ) {
    if (
      !hasActiveCapabilities(input.deps) ||
      !(await revalidateShadowFence({
        userId: data.userId,
        sessionId: data.sessionId,
        terminalFreezeAnchorAtMs: session.terminalFreezeAnchorAtMs,
        deps: input.deps,
      }))
    ) {
      return { status: "fenced", report: null };
    }
    artifactSet = await input.deps.store.readExact(
      input.deps.storageGate,
      intents.map(({ key }) => key)
    );
    if (artifactSet.status === "invalid") {
      return { status: "fenced", report: null };
    }
    if (
      artifactSet.missingKeyFingerprints.length === 0 ||
      readAttempt === SHADOW_FEEDBACK_COMPARISON_MAX_READS ||
      input.deps.now().getTime() >= comparisonDeadlineAtMs
    ) {
      break;
    }
    if (
      !hasActiveCapabilities(input.deps) ||
      !(await revalidateShadowFence({
        userId: data.userId,
        sessionId: data.sessionId,
        terminalFreezeAnchorAtMs: session.terminalFreezeAnchorAtMs,
        deps: input.deps,
      }))
    ) {
      return { status: "fenced", report: null };
    }
    const remainingMs = comparisonDeadlineAtMs - input.deps.now().getTime();
    if (remainingMs <= 0) break;
    await input.deps.steps.sleep(
      `wait-shadow-feedback-artifacts-${readAttempt}`,
      Math.min(SHADOW_FEEDBACK_COMPARISON_WAIT_MS, remainingMs)
    );
  }
  if (!artifactSet) return { status: "fenced", report: null };
  if (
    !hasActiveCapabilities(input.deps) ||
    !(await revalidateShadowFence({
      userId: data.userId,
      sessionId: data.sessionId,
      terminalFreezeAnchorAtMs: session.terminalFreezeAnchorAtMs,
      deps: input.deps,
    }))
  ) {
    return { status: "fenced", report: null };
  }
  const batchAuthority = await input.deps.readBatchAuthority({
    sessionId: data.sessionId,
    projection: prepared.projection,
    terminalFreezeAnchorAtMs: session.terminalFreezeAnchorAtMs,
  });
  if (!batchAuthority) {
    return { status: "batch_unavailable", report: null };
  }
  if (
    !(await revalidateActiveShadowFence({
      userId: data.userId,
      sessionId: data.sessionId,
      terminalFreezeAnchorAtMs: session.terminalFreezeAnchorAtMs,
      deps: input.deps,
    }))
  ) {
    return { status: "fenced", report: null };
  }
  return {
    status: "reported",
    report: compareShadowFeedbackWithBatch({
      batchAuthority,
      artifactSet,
      terminalFreezeAnchorAtMs: session.terminalFreezeAnchorAtMs,
      costRates: runtime.costRates,
    }),
  };
}

export function parseShadowFeedbackEvaluationEventData(
  value: unknown
): ShadowFeedbackEvaluationEventDataV1 {
  const root = requireRecord(value);
  requireExactKeys(root, ["contractVersion", "userId", "intent"]);
  if (root.contractVersion !== SHADOW_FEEDBACK_EVALUATION_EVENT_VERSION) {
    throw new Error("shadow_feedback_event_version_unsupported");
  }
  const event = {
    contractVersion: SHADOW_FEEDBACK_EVALUATION_EVENT_VERSION,
    userId: requireUuid(root.userId),
    intent: parseShadowFeedbackSchedulingIntent(root.intent),
  };
  if (
    new TextEncoder().encode(JSON.stringify(event)).byteLength > MAX_EVENT_BYTES
  ) {
    throw new Error("shadow_feedback_event_too_large");
  }
  return event;
}

function normalizeCompletedEvaluation(input: {
  output: unknown;
  intent: ShadowFeedbackSchedulingIntentV1;
  roundType: "product_sense" | "execution" | "behavioral" | "strategy";
  startedAtMs: number;
  completedAt: Date;
}) {
  const root = requireRecord(input.output);
  requireExactKeys(root, ["outcome", "usage"]);
  const usage = parseUsage(root.usage);
  const artifact = parseShadowFeedbackArtifact({
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_VERSION,
    key: input.intent.key,
    outcome: root.outcome,
    metrics: {
      durationMs: boundedDuration(
        input.completedAt.getTime() - input.startedAtMs
      ),
      ...(usage ?? nullUsage()),
    },
    completedAt: input.completedAt.toISOString(),
  });
  if (
    artifact.outcome.state !== "completed" ||
    artifact.outcome.roundType !== input.roundType
  ) {
    throw new Error("shadow_feedback_evaluator_contract_invalid");
  }
  return { disposition: "completed" as const, artifact };
}

async function persistFailedArtifact(input: {
  data: ShadowFeedbackEvaluationEventDataV1;
  userId: string;
  failure: Pick<FeedbackGenerationFailure, "failureClass" | "usage">;
  startedAtMs: number;
  deps: ShadowFeedbackEvaluationDeps;
}): Promise<ShadowFeedbackEvaluationResult> {
  const completedAt = input.deps.now();
  const artifact = parseShadowFeedbackArtifact({
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_VERSION,
    key: input.data.intent.key,
    outcome: {
      state: "failed",
      failureClass: input.failure.failureClass,
    },
    metrics: {
      durationMs: boundedDuration(completedAt.getTime() - input.startedAtMs),
      ...(input.failure.usage ?? nullUsage()),
    },
    completedAt: completedAt.toISOString(),
  });
  return persistArtifact({
    userId: input.userId,
    artifact,
    terminalFreezeAnchorAtMs: input.data.intent.terminalFreezeAnchorAtMs,
    deps: input.deps,
  });
}

async function persistArtifact(input: {
  userId: string;
  artifact: ShadowFeedbackArtifactV1;
  terminalFreezeAnchorAtMs: number;
  deps: ShadowFeedbackEvaluationDeps;
}): Promise<ShadowFeedbackEvaluationResult> {
  const fence = {
    userId: input.userId,
    sessionId: input.artifact.key.sessionId,
    terminalFreezeAnchorAtMs: input.terminalFreezeAnchorAtMs,
    deps: input.deps,
  };
  if (!(await revalidateActiveShadowFence(fence))) {
    return { status: "fenced", outcome: null };
  }
  const write = await input.deps.steps.run(
    `persist-shadow-feedback-${shortKey(input.artifact.key.keyFingerprint)}`,
    async () => {
      if (!(await revalidateActiveShadowFence(fence))) {
        return "fenced" as const;
      }
      return input.deps.store.record(input.deps.storageGate, {
        userId: input.userId,
        artifact: input.artifact,
      });
    }
  );
  if (write === "fenced") return { status: "fenced", outcome: null };
  if (write !== "inserted" && write !== "duplicate") {
    return { status: "persistence_rejected", outcome: null };
  }
  return {
    status: write === "duplicate" ? "already_terminal" : "recorded",
    outcome: input.artifact.outcome.state,
  };
}

async function revalidateShadowFence(input: {
  userId: string;
  sessionId: string;
  terminalFreezeAnchorAtMs: number;
  deps: Pick<ShadowFeedbackReadDeps, "isDeletionPending" | "getSession">;
}): Promise<boolean> {
  if (await input.deps.isDeletionPending(input.userId)) return false;
  const current = await input.deps.getSession(input.sessionId);
  return Boolean(
    current &&
      current.userId === input.userId &&
      current.terminalFreezeAnchorAtMs === input.terminalFreezeAnchorAtMs
  );
}

async function revalidateActiveShadowFence(input: {
  userId: string;
  sessionId: string;
  terminalFreezeAnchorAtMs: number;
  deps: ShadowFeedbackGateDeps &
    Pick<ShadowFeedbackReadDeps, "isDeletionPending" | "getSession">;
}): Promise<boolean> {
  return (
    hasActiveCapabilities(input.deps) && (await revalidateShadowFence(input))
  );
}

function hasActiveCapabilities(input: ShadowFeedbackGateDeps): boolean {
  return Boolean(
    input.executionGate.enabled &&
      isShadowFeedbackExecutionEnabledContext(input.executionGate.context) &&
      input.storageGate.enabled &&
      isShadowFeedbackArtifactStorageEnabledContext(input.storageGate.context)
  );
}

function parseRuntimeDescriptor(
  value: ShadowFeedbackRuntimeDescriptor | null
): ShadowFeedbackRuntimeDescriptor | null {
  if (!value) return null;
  try {
    if (
      !isVersion(value.rubricVersion) ||
      !isVersion(value.promptVersion) ||
      !isVersion(value.selectionSchemaVersion) ||
      !isVersion(value.modelVersion)
    ) {
      return null;
    }
    return {
      ...value,
      costRates:
        value.costRates === null
          ? null
          : parseShadowFeedbackCostRates(value.costRates),
    };
  } catch {
    return null;
  }
}

function parseEvaluationRuntime(
  value: ShadowFeedbackEvaluationRuntime | null
): ShadowFeedbackEvaluationRuntime | null {
  const descriptor = parseRuntimeDescriptor(value);
  return descriptor && typeof value?.evaluator?.evaluate === "function"
    ? { ...descriptor, evaluator: value.evaluator }
    : null;
}

function intentMatchesRuntime(
  intent: ShadowFeedbackSchedulingIntentV1,
  runtime: ShadowFeedbackRuntimeDescriptor
): boolean {
  return (
    intent.contractVersion === SHADOW_FEEDBACK_SCHEDULING_INTENT_VERSION &&
    intent.key.rubricVersion === runtime.rubricVersion &&
    intent.key.promptVersion === runtime.promptVersion &&
    intent.key.selectionSchemaVersion === runtime.selectionSchemaVersion &&
    intent.key.modelVersion === runtime.modelVersion
  );
}

function parseRequestedSession(value: unknown): {
  sessionId: string;
  userId: string;
} {
  const root = requireRecord(value);
  requireExactKeys(root, ["sessionId", "userId"]);
  return {
    sessionId: requireUuid(root.sessionId),
    userId: requireUuid(root.userId),
  };
}

function deterministicEvaluationEventId(
  intent: ShadowFeedbackSchedulingIntentV1
): string {
  return `shadow-feedback-evaluate:${shortIntentId(intent)}`;
}

function shortIntentId(intent: ShadowFeedbackSchedulingIntentV1): string {
  return intent.intentId.slice(-32);
}

function shortKey(keyFingerprint: string): string {
  return keyFingerprint.slice(-32);
}

function contentFreeFailure(
  failure: FeedbackGenerationFailure
): Pick<
  FeedbackGenerationFailure,
  "failureClass" | "retryable" | "retryAfterMs" | "usage"
> {
  return {
    failureClass: failure.failureClass,
    retryable: failure.retryable,
    retryAfterMs: normalizeContentFreeRetryAfterMs(failure.retryAfterMs),
    usage: normalizeContentFreeUsage(failure.usage),
  };
}

function normalizeContentFreeRetryAfterMs(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.min(FEEDBACK_PROVIDER_MAX_RETRY_DELAY_MS, Math.floor(value));
}

function normalizeContentFreeUsage(
  value: FeedbackProviderUsage | null
): FeedbackProviderUsage | null {
  if (value === null) return null;
  try {
    return parseUsage(value);
  } catch {
    return null;
  }
}

function parseUsage(value: unknown): FeedbackProviderUsage | null {
  if (value === null) return null;
  const root = requireRecord(value);
  requireExactKeys(root, [
    "inputTokens",
    "cachedInputTokens",
    "outputTokens",
    "totalTokens",
  ]);
  const inputTokens = requireTokenCount(root.inputTokens);
  const cachedInputTokens = requireTokenCount(root.cachedInputTokens);
  const outputTokens = requireTokenCount(root.outputTokens);
  const totalTokens = requireTokenCount(root.totalTokens);
  if (
    cachedInputTokens > inputTokens ||
    totalTokens !== inputTokens + outputTokens
  ) {
    throw new Error("shadow_feedback_usage_invalid");
  }
  return { inputTokens, cachedInputTokens, outputTokens, totalTokens };
}

function nullUsage(): Omit<ShadowFeedbackArtifactMetrics, "durationMs"> {
  return {
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    totalTokens: null,
  };
}

function boundedDuration(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(90_000, Math.max(0, Math.floor(value)));
}

function normalizeRequestedAtMs(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function normalizeComparisonRequestedAtMs(
  value: number | undefined,
  nowMs: number
): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= nowMs
    ? value
    : nowMs;
}

function requireTokenCount(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 10_000_000
  ) {
    throw new Error("shadow_feedback_usage_invalid");
  }
  return value as number;
}

function requireEventId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_EVENT_ID_LENGTH
  ) {
    throw new Error("shadow_feedback_event_id_invalid");
  }
  return value;
}

function requireUuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
      value
    )
  ) {
    throw new Error("shadow_feedback_uuid_invalid");
  }
  return value;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("shadow_feedback_shape_invalid");
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error("shadow_feedback_shape_invalid");
  }
}

function isVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_VERSION_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value)
  );
}

function isEpochMs(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRoundType(
  value: string
): value is "product_sense" | "execution" | "behavioral" | "strategy" {
  return (
    value === "product_sense" ||
    value === "execution" ||
    value === "behavioral" ||
    value === "strategy"
  );
}

export const DEFAULT_SHADOW_FEEDBACK_RUNTIME_VERSIONS = Object.freeze({
  rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  selectionSchemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
});
