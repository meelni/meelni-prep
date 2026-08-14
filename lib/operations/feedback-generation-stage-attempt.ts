import { createHash } from "node:crypto";

import {
  FEEDBACK_GENERATION_DEADLINE_MS,
  FEEDBACK_GENERATION_FAILURE_CLASSES,
  FEEDBACK_GENERATION_MAX_PROVIDER_ATTEMPTS,
  FEEDBACK_GENERATION_STAGES,
  type FeedbackGenerationFailureClass,
  type FeedbackGenerationStage,
} from "@/lib/evaluation/feedback-generation-policy";
import type {
  FeedbackProviderInvocationDiagnosticKind,
  FeedbackProviderUsage,
} from "@/lib/evaluation/scorer";

export const FEEDBACK_GENERATION_STAGE_ATTEMPT_OPERATIONS = [
  "queue_wait",
  "authorization",
  "claim",
  "legacy_evidence",
  "answer_blocks",
  "provider_request",
  "provider_response",
  "complete",
  "skip",
] as const;

export type FeedbackGenerationStageAttemptOperation =
  (typeof FEEDBACK_GENERATION_STAGE_ATTEMPT_OPERATIONS)[number];

export const FEEDBACK_GENERATION_STAGE_ATTEMPT_OUTCOMES = [
  "succeeded",
  "retrying",
  "skipped",
  "failed",
  "fenced",
] as const;

export type FeedbackGenerationStageAttemptOutcome =
  (typeof FEEDBACK_GENERATION_STAGE_ATTEMPT_OUTCOMES)[number];

export const FEEDBACK_GENERATION_ENVIRONMENT_CLASSES = [
  "local",
  "test",
  "preview",
  "staging",
  "production",
  "unknown",
] as const;

export type FeedbackGenerationEnvironmentClass =
  (typeof FEEDBACK_GENERATION_ENVIRONMENT_CLASSES)[number];

export const FEEDBACK_GENERATION_DURATION_BUCKETS = [
  "lt_1s",
  "1s_to_5s",
  "5s_to_15s",
  "15s_to_45s",
  "45s_to_90s",
] as const;

export type FeedbackGenerationDurationBucket =
  (typeof FEEDBACK_GENERATION_DURATION_BUCKETS)[number];

export interface FeedbackGenerationStageAttemptInput {
  /** Internal feedback-generation event fence; never a provider request id. */
  generationEventId: string;
  /** One-indexed ledger value: zero-indexed Inngest attempt plus one. */
  workflowAttempt: number;
  operation: FeedbackGenerationStageAttemptOperation;
  stage: FeedbackGenerationStage;
  /** Provider retry ordinal (1-3); null for non-provider operations. */
  providerAttempt: number | null;
  outcome: FeedbackGenerationStageAttemptOutcome;
  failureClass?: FeedbackGenerationFailureClass | null;
  retryable: boolean;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  remainingBudgetMs: number;
  retryAfterMs?: number | null;
  environmentClass: FeedbackGenerationEnvironmentClass;
  release?: string | null;
  providerDiagnosticKind?: FeedbackProviderInvocationDiagnosticKind | null;
  providerHttpStatus?: number | null;
  observedModel?: string | null;
  observedServiceTier?: string | null;
  usage?: FeedbackProviderUsage | null;
}

export interface NormalizedFeedbackGenerationStageAttempt {
  generationEventFence: string;
  workflowAttempt: number;
  operation: FeedbackGenerationStageAttemptOperation;
  stage: FeedbackGenerationStage;
  providerAttempt: number | null;
  outcome: FeedbackGenerationStageAttemptOutcome;
  failureClass: FeedbackGenerationFailureClass | null;
  retryable: boolean;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  durationBucket: FeedbackGenerationDurationBucket;
  remainingBudgetMs: number;
  retryAfterMs: number | null;
  environmentClass: FeedbackGenerationEnvironmentClass;
  release: string | null;
  providerDiagnosticKind: FeedbackProviderInvocationDiagnosticKind | null;
  providerHttpStatus: number | null;
  observedModel: string | null;
  observedServiceTier: string | null;
  usage: FeedbackProviderUsage | null;
}

export interface FeedbackGenerationRuntimeMetadata {
  environmentClass: FeedbackGenerationEnvironmentClass;
  release: string | null;
}

const OPERATIONS = new Set<string>(
  FEEDBACK_GENERATION_STAGE_ATTEMPT_OPERATIONS
);
const STAGES = new Set<string>(FEEDBACK_GENERATION_STAGES);
const OUTCOMES = new Set<string>(FEEDBACK_GENERATION_STAGE_ATTEMPT_OUTCOMES);
const FAILURE_CLASSES = new Set<string>(FEEDBACK_GENERATION_FAILURE_CLASSES);
const ENVIRONMENTS = new Set<string>(FEEDBACK_GENERATION_ENVIRONMENT_CLASSES);
const PROVIDER_DIAGNOSTIC_KINDS = new Set<string>([
  "provider_bad_request",
  "provider_authentication",
  "provider_permission",
  "provider_not_found",
  "provider_conflict",
  "provider_unprocessable",
  "provider_rate_limited",
  "provider_timeout",
  "provider_network",
  "provider_aborted",
  "provider_server_error",
  "provider_unknown",
]);
const OPERATION_STAGES: Record<
  FeedbackGenerationStageAttemptOperation,
  FeedbackGenerationStage
> = {
  queue_wait: "claim",
  authorization: "claim",
  claim: "claim",
  legacy_evidence: "evidence_preparation",
  answer_blocks: "evidence_preparation",
  provider_request: "provider",
  provider_response: "validation",
  complete: "persistence",
  skip: "persistence",
};
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

/** Rejects open metadata and returns only the persisted content-free shape. */
export function normalizeFeedbackGenerationStageAttempt(
  input: FeedbackGenerationStageAttemptInput
): NormalizedFeedbackGenerationStageAttempt | null {
  if (
    typeof input.generationEventId !== "string" ||
    input.generationEventId !== input.generationEventId.trim() ||
    input.generationEventId.length < 1 ||
    input.generationEventId.length > 256 ||
    !Number.isInteger(input.workflowAttempt) ||
    input.workflowAttempt < 1 ||
    input.workflowAttempt > 3 ||
    !OPERATIONS.has(input.operation) ||
    !STAGES.has(input.stage) ||
    OPERATION_STAGES[input.operation] !== input.stage ||
    !OUTCOMES.has(input.outcome) ||
    !ENVIRONMENTS.has(input.environmentClass) ||
    !validProviderAttempt(input.operation, input.providerAttempt) ||
    !validDate(input.startedAt) ||
    !validDate(input.completedAt) ||
    input.completedAt.getTime() < input.startedAt.getTime() ||
    !boundedMilliseconds(input.durationMs) ||
    !Number.isInteger(input.durationMs) ||
    input.completedAt.getTime() - input.startedAt.getTime() !==
      input.durationMs ||
    !boundedMilliseconds(input.remainingBudgetMs) ||
    (input.retryAfterMs != null && !boundedMilliseconds(input.retryAfterMs)) ||
    !validOutcomeFailureTuple(input) ||
    !validOptionalLabel(input.release) ||
    !validOptionalLabel(input.observedModel) ||
    !validOptionalLabel(input.observedServiceTier) ||
    (input.providerDiagnosticKind != null &&
      !PROVIDER_DIAGNOSTIC_KINDS.has(input.providerDiagnosticKind)) ||
    (input.providerHttpStatus != null &&
      (!Number.isInteger(input.providerHttpStatus) ||
        input.providerHttpStatus < 100 ||
        input.providerHttpStatus > 599)) ||
    !validProviderContext(input)
  ) {
    return null;
  }
  const usage = normalizeUsage(input.usage);
  if (input.usage != null && usage === null) return null;
  const durationMs = Math.round(input.durationMs);
  return {
    generationEventFence: feedbackGenerationEventFence(input.generationEventId),
    workflowAttempt: input.workflowAttempt,
    operation: input.operation,
    stage: input.stage,
    providerAttempt: input.providerAttempt,
    outcome: input.outcome,
    failureClass: input.failureClass ?? null,
    retryable: input.retryable,
    startedAt: new Date(input.startedAt),
    completedAt: new Date(input.completedAt),
    durationMs,
    durationBucket: durationBucket(durationMs),
    remainingBudgetMs: Math.round(input.remainingBudgetMs),
    retryAfterMs:
      input.retryAfterMs == null ? null : Math.round(input.retryAfterMs),
    environmentClass: input.environmentClass,
    release: input.release ?? null,
    providerDiagnosticKind: input.providerDiagnosticKind ?? null,
    providerHttpStatus: input.providerHttpStatus ?? null,
    observedModel: input.observedModel ?? null,
    observedServiceTier: input.observedServiceTier ?? null,
    usage,
  };
}

export function feedbackGenerationEventFence(
  generationEventId: string
): string {
  return `v1:${createHash("sha256").update(generationEventId).digest("hex")}`;
}

export function resolveFeedbackGenerationRuntimeMetadata(
  environment: Record<string, string | undefined> = process.env
): FeedbackGenerationRuntimeMetadata {
  let environmentClass: FeedbackGenerationEnvironmentClass;
  if (environment.VERCEL_ENV === "production") {
    environmentClass = "production";
  } else if (
    environment.VERCEL_ENV === "preview" &&
    environment.VERCEL_GIT_COMMIT_REF === "staging"
  ) {
    environmentClass = "staging";
  } else if (environment.VERCEL_ENV === "preview") {
    environmentClass = "preview";
  } else if (environment.NODE_ENV === "test") {
    environmentClass = "test";
  } else if (environment.NODE_ENV === "development") {
    environmentClass = "local";
  } else {
    environmentClass = "unknown";
  }
  return {
    environmentClass,
    release: validOptionalLabel(environment.VERCEL_GIT_COMMIT_SHA)
      ? (environment.VERCEL_GIT_COMMIT_SHA ?? null)
      : null,
  };
}

function validProviderAttempt(
  operation: FeedbackGenerationStageAttemptOperation,
  providerAttempt: number | null
): boolean {
  const isProviderOperation =
    operation === "provider_request" || operation === "provider_response";
  return isProviderOperation
    ? Number.isInteger(providerAttempt) &&
        providerAttempt! >= 1 &&
        providerAttempt! <= FEEDBACK_GENERATION_MAX_PROVIDER_ATTEMPTS
    : providerAttempt === null;
}

function validOutcomeFailureTuple(
  input: Pick<
    FeedbackGenerationStageAttemptInput,
    "outcome" | "failureClass" | "retryable"
  >
): boolean {
  const failureClass = input.failureClass ?? null;
  if (failureClass !== null && !FAILURE_CLASSES.has(failureClass)) return false;
  if (input.outcome === "succeeded" || input.outcome === "skipped") {
    return failureClass === null && input.retryable === false;
  }
  if (input.outcome === "retrying") {
    return failureClass !== null && input.retryable === true;
  }
  if (input.outcome === "fenced") {
    return failureClass === "fenced" && input.retryable === false;
  }
  return failureClass !== null && input.retryable === false;
}

function validProviderContext(
  input: Pick<
    FeedbackGenerationStageAttemptInput,
    | "operation"
    | "outcome"
    | "retryAfterMs"
    | "providerDiagnosticKind"
    | "providerHttpStatus"
    | "observedModel"
    | "observedServiceTier"
    | "usage"
  >
): boolean {
  const providerFieldsAreNull =
    input.providerDiagnosticKind == null &&
    input.providerHttpStatus == null &&
    input.observedModel == null &&
    input.observedServiceTier == null &&
    input.usage == null;
  if (
    input.operation !== "provider_request" &&
    input.operation !== "provider_response"
  ) {
    return input.retryAfterMs == null && providerFieldsAreNull;
  }
  if (
    input.providerHttpStatus != null &&
    input.providerDiagnosticKind == null
  ) {
    return false;
  }
  if (input.operation === "provider_response") {
    return input.retryAfterMs == null;
  }
  return input.retryAfterMs == null || input.outcome === "retrying";
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function boundedMilliseconds(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= FEEDBACK_GENERATION_DEADLINE_MS
  );
}

function validOptionalLabel(value: string | null | undefined): boolean {
  return value == null || SAFE_LABEL.test(value);
}

function normalizeUsage(
  value: FeedbackProviderUsage | null | undefined
): FeedbackProviderUsage | null {
  if (value == null) return null;
  const counts = [
    value.inputTokens,
    value.cachedInputTokens,
    value.outputTokens,
    value.totalTokens,
  ];
  if (
    counts.some(
      (count) => !Number.isSafeInteger(count) || count < 0 || count > 10_000_000
    )
  ) {
    return null;
  }
  return {
    inputTokens: value.inputTokens,
    cachedInputTokens: value.cachedInputTokens,
    outputTokens: value.outputTokens,
    totalTokens: value.totalTokens,
  };
}

function durationBucket(durationMs: number): FeedbackGenerationDurationBucket {
  if (durationMs < 1_000) return "lt_1s";
  if (durationMs < 5_000) return "1s_to_5s";
  if (durationMs < 15_000) return "5s_to_15s";
  if (durationMs < 45_000) return "15s_to_45s";
  return "45s_to_90s";
}
