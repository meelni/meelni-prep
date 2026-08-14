import { isDeadlineExceededError } from "@/lib/http/deadline";
import {
  FEEDBACK_CONFIGURATION_INVALID_OPENAI_KEY,
  FEEDBACK_CONFIGURATION_MISSING_OPENAI_KEY,
  FeedbackProviderInvocationError,
  type FeedbackProviderInvocationDiagnosticKind,
  type FeedbackProviderUsage,
  getEvaluationFailureCode,
} from "./scorer";

export const FEEDBACK_GENERATION_DEADLINE_MS = 90_000;
export const FEEDBACK_GENERATION_PERSISTENCE_RESERVE_MS = 5_000;
export const FEEDBACK_PROVIDER_MIN_ATTEMPT_TIMEOUT_MS = 5_000;
export const FEEDBACK_PROVIDER_MAX_ATTEMPT_TIMEOUT_MS = 75_000;
export const FEEDBACK_GENERATION_MAX_PROVIDER_ATTEMPTS = 3;
export const FEEDBACK_PROVIDER_DEFAULT_RETRY_DELAY_MS = 1_000;
export const FEEDBACK_PROVIDER_MAX_RETRY_DELAY_MS = 60_000;

export const FEEDBACK_GENERATION_STAGES = [
  "claim",
  "evidence_preparation",
  "provider",
  "validation",
  "persistence",
] as const;

export type FeedbackGenerationStage =
  (typeof FEEDBACK_GENERATION_STAGES)[number];

export const FEEDBACK_GENERATION_FAILURE_CLASSES = [
  "deadline_exceeded",
  "transport_timeout",
  "transport_network",
  "provider_rate_limited",
  "provider_capacity",
  "provider_authentication",
  "provider_configuration",
  "provider_contract",
  "evidence_integrity",
  "fenced",
  "persistence",
  "internal",
] as const;

export type FeedbackGenerationFailureClass =
  (typeof FEEDBACK_GENERATION_FAILURE_CLASSES)[number];

export interface FeedbackGenerationFailure {
  stage: FeedbackGenerationStage;
  failureClass: FeedbackGenerationFailureClass;
  retryable: boolean;
  retryAfterMs: number | null;
  providerDiagnosticKind: FeedbackProviderInvocationDiagnosticKind | null;
  providerHttpStatus: number | null;
  usage: FeedbackProviderUsage | null;
  observedModel: string | null;
  observedServiceTier: string | null;
}

export interface FeedbackProviderAttemptPlan {
  attempt: number;
  delayMs: number;
  requestTimeoutMs: number;
  remainingBudgetMs: number;
}

export class FeedbackGenerationPolicyError extends Error {
  constructor(
    readonly failure: FeedbackGenerationFailure,
    safeMessage = feedbackGenerationStatusReason(failure)
  ) {
    super(safeMessage);
    this.name = "FeedbackGenerationPolicyError";
  }
}

export function getFeedbackGenerationDeadlineAt(input: {
  requestedAtMs?: number;
  nowMs: number;
}): number {
  const requestedAtMs =
    typeof input.requestedAtMs === "number" &&
    Number.isFinite(input.requestedAtMs) &&
    input.requestedAtMs >= 0 &&
    input.requestedAtMs <= input.nowMs
      ? input.requestedAtMs
      : input.nowMs;
  return requestedAtMs + FEEDBACK_GENERATION_DEADLINE_MS;
}

export function getFeedbackGenerationRemainingBudgetMs(
  deadlineAtMs: number,
  nowMs: number
): number {
  if (!Number.isFinite(deadlineAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.floor(deadlineAtMs - nowMs));
}

export function planFeedbackProviderAttempt(input: {
  attempt: number;
  deadlineAtMs: number;
  nowMs: number;
  retryAfterMs?: number | null;
}): FeedbackProviderAttemptPlan | null {
  if (
    !Number.isInteger(input.attempt) ||
    input.attempt < 1 ||
    input.attempt > FEEDBACK_GENERATION_MAX_PROVIDER_ATTEMPTS
  ) {
    return null;
  }
  const remainingBudgetMs = getFeedbackGenerationRemainingBudgetMs(
    input.deadlineAtMs,
    input.nowMs
  );
  const delayMs =
    input.attempt === 1
      ? 0
      : normalizeRetryDelay(
          input.retryAfterMs ?? defaultRetryDelay(input.attempt - 1)
        );
  const requestTimeoutMs = Math.min(
    FEEDBACK_PROVIDER_MAX_ATTEMPT_TIMEOUT_MS,
    remainingBudgetMs - delayMs - FEEDBACK_GENERATION_PERSISTENCE_RESERVE_MS
  );
  if (requestTimeoutMs < FEEDBACK_PROVIDER_MIN_ATTEMPT_TIMEOUT_MS) return null;
  return {
    attempt: input.attempt,
    delayMs,
    requestTimeoutMs,
    remainingBudgetMs,
  };
}

export function deadlineExceededFailure(
  stage: FeedbackGenerationStage
): FeedbackGenerationFailure {
  return failure(stage, "deadline_exceeded");
}

export function classifyFeedbackGenerationFailure(
  error: unknown,
  fallbackStage: FeedbackGenerationStage
): FeedbackGenerationFailure {
  if (error instanceof FeedbackGenerationPolicyError) return error.failure;
  if (isDeadlineExceededError(error)) {
    return deadlineExceededFailure(fallbackStage);
  }

  const messages = collectMessages(error);
  if (
    messages.some(
      (message) =>
        message.includes("event_mismatch") ||
        message.includes("not_authorized") ||
        message.includes("not_found") ||
        message.includes("account_deletion_pending") ||
        message.includes("fenced")
    )
  ) {
    return failure(fallbackStage, "fenced");
  }
  if (
    messages.some(
      (message) =>
        message.includes("transcript_integrity") ||
        message.includes("evidence_integrity") ||
        message.includes("invalid_committed_tier") ||
        message.includes("round_type_invalid") ||
        message.includes("snapshot") ||
        message.includes("persistence_contract_invalid")
    )
  ) {
    return failure("evidence_preparation", "evidence_integrity");
  }

  const stableCode = getEvaluationFailureCode(error);
  if (
    stableCode === FEEDBACK_CONFIGURATION_MISSING_OPENAI_KEY ||
    messages.some((message) => message.includes("OPENAI_API_KEY"))
  ) {
    return failure("provider", "provider_configuration");
  }
  if (stableCode === FEEDBACK_CONFIGURATION_INVALID_OPENAI_KEY) {
    return failure("provider", "provider_authentication");
  }

  const providerError = findProviderError(error);
  if (providerError) {
    const diagnostics = {
      providerDiagnosticKind: providerError.diagnostic?.kind ?? null,
      providerHttpStatus: providerError.diagnostic?.httpStatus ?? null,
      usage: providerError.usage ?? null,
      observedModel: providerError.observedModel ?? null,
      observedServiceTier: providerError.observedServiceTier ?? null,
      retryAfterMs: providerError.diagnostic?.retryAfterMs ?? null,
    };
    if (providerError.code !== "evaluation_provider_invocation_failed") {
      return {
        ...failure("validation", "provider_contract"),
        ...diagnostics,
      };
    }
    switch (providerError.diagnostic?.kind) {
      case "provider_timeout":
      case "provider_aborted":
        return {
          ...failure("provider", "transport_timeout", true),
          ...diagnostics,
        };
      case "provider_network":
        return {
          ...failure("provider", "transport_network", true),
          ...diagnostics,
        };
      case "provider_rate_limited":
        return {
          ...failure("provider", "provider_rate_limited", true),
          ...diagnostics,
        };
      case "provider_server_error":
        return {
          ...failure("provider", "provider_capacity", true),
          ...diagnostics,
        };
      case "provider_authentication":
      case "provider_permission":
        return {
          ...failure("provider", "provider_authentication"),
          ...diagnostics,
        };
      case "provider_not_found":
        return {
          ...failure("provider", "provider_configuration"),
          ...diagnostics,
        };
      case "provider_bad_request":
      case "provider_conflict":
      case "provider_unprocessable":
        return {
          ...failure("validation", "provider_contract"),
          ...diagnostics,
        };
      default:
        return { ...failure("provider", "internal"), ...diagnostics };
    }
  }

  if (
    fallbackStage === "validation" ||
    messages.some(
      (message) =>
        message.includes("dimension_coverage_required") ||
        message.includes("qualitative_constraint") ||
        message.includes("provider_returned")
    )
  ) {
    return failure("validation", "provider_contract");
  }
  if (fallbackStage === "persistence") {
    return failure("persistence", "persistence", true);
  }
  return failure(
    fallbackStage,
    "internal",
    fallbackStage === "claim" || fallbackStage === "evidence_preparation"
  );
}

export function assertFeedbackGenerationBudget(
  deadlineAtMs: number,
  nowMs: number,
  stage: FeedbackGenerationStage
): void {
  if (getFeedbackGenerationRemainingBudgetMs(deadlineAtMs, nowMs) <= 0) {
    throw new FeedbackGenerationPolicyError(deadlineExceededFailure(stage));
  }
}

export function feedbackGenerationStatusReason(
  value: FeedbackGenerationFailure
): string {
  return `feedback_generation_${value.failureClass}`;
}

/** Inngest owns raw transient stage failures; closed policy outcomes do not replay. */
export function isDurableFeedbackGenerationRetry(error: unknown): boolean {
  return !(error instanceof FeedbackGenerationPolicyError);
}

function failure(
  stage: FeedbackGenerationStage,
  failureClass: FeedbackGenerationFailureClass,
  retryable = false
): FeedbackGenerationFailure {
  return {
    stage,
    failureClass,
    retryable,
    retryAfterMs: null,
    providerDiagnosticKind: null,
    providerHttpStatus: null,
    usage: null,
    observedModel: null,
    observedServiceTier: null,
  };
}

function normalizeRetryDelay(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return FEEDBACK_PROVIDER_DEFAULT_RETRY_DELAY_MS;
  }
  return Math.min(
    FEEDBACK_PROVIDER_MAX_RETRY_DELAY_MS,
    Math.max(0, Math.floor(value))
  );
}

function defaultRetryDelay(completedAttempts: number): number {
  return Math.min(
    FEEDBACK_PROVIDER_DEFAULT_RETRY_DELAY_MS *
      2 ** Math.max(0, completedAttempts - 1),
    FEEDBACK_PROVIDER_MAX_RETRY_DELAY_MS
  );
}

function findProviderError(
  error: unknown
): FeedbackProviderInvocationError | null {
  let current = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 6 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof FeedbackProviderInvocationError) return current;
    current = current instanceof Error ? current.cause : undefined;
  }
  return null;
}

function collectMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 6 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    } else if (typeof current === "string") {
      messages.push(current);
      break;
    } else {
      break;
    }
  }
  return messages;
}
