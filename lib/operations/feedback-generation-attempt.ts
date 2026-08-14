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

export const FEEDBACK_GENERATION_ATTEMPT_OUTCOMES = [
  "succeeded",
  "retrying",
  "skipped",
  "failed",
  "fenced",
] as const;

export type FeedbackGenerationAttemptOutcome =
  (typeof FEEDBACK_GENERATION_ATTEMPT_OUTCOMES)[number];

export interface FeedbackGenerationAttemptEvent {
  event: "meelni_feedback_generation_attempt";
  version: 1;
  occurredAt: string;
  stage: FeedbackGenerationStage;
  attempt: number;
  outcome: FeedbackGenerationAttemptOutcome;
  failureClass: FeedbackGenerationFailureClass | null;
  durationMs: number;
  remainingBudgetMs: number;
  retryAfterMs: number | null;
  providerDiagnosticKind: FeedbackProviderInvocationDiagnosticKind | null;
  providerHttpStatus: number | null;
  observedModel: string | null;
  observedServiceTier: string | null;
  usage: FeedbackProviderUsage | null;
}

export interface FeedbackGenerationAttemptInput {
  stage: FeedbackGenerationStage;
  attempt: number;
  outcome: FeedbackGenerationAttemptOutcome;
  failureClass?: FeedbackGenerationFailureClass;
  durationMs: number;
  remainingBudgetMs: number;
  retryAfterMs?: number | null;
  providerDiagnosticKind?: FeedbackProviderInvocationDiagnosticKind | null;
  providerHttpStatus?: number | null;
  observedModel?: string | null;
  observedServiceTier?: string | null;
  usage?: FeedbackProviderUsage | null;
}

export type FeedbackGenerationAttemptReporter = (
  input: FeedbackGenerationAttemptInput
) => unknown;

const STAGES = new Set<string>(FEEDBACK_GENERATION_STAGES);
const OUTCOMES = new Set<string>(FEEDBACK_GENERATION_ATTEMPT_OUTCOMES);
const FAILURE_CLASSES = new Set<string>(FEEDBACK_GENERATION_FAILURE_CLASSES);
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

/** Records only bounded operational metadata; it accepts no identity or content fields. */
export function reportFeedbackGenerationAttempt(
  input: FeedbackGenerationAttemptInput,
  write: (serialized: string) => void = console.info,
  now: () => Date = () => new Date()
): FeedbackGenerationAttemptEvent | null {
  if (
    !STAGES.has(input.stage) ||
    !OUTCOMES.has(input.outcome) ||
    !Number.isInteger(input.attempt) ||
    input.attempt < 1 ||
    input.attempt > FEEDBACK_GENERATION_MAX_PROVIDER_ATTEMPTS ||
    !boundedMilliseconds(input.durationMs) ||
    !boundedMilliseconds(input.remainingBudgetMs) ||
    (input.retryAfterMs != null && !boundedMilliseconds(input.retryAfterMs)) ||
    (input.failureClass !== undefined &&
      !FAILURE_CLASSES.has(input.failureClass)) ||
    (input.providerDiagnosticKind != null &&
      !PROVIDER_DIAGNOSTIC_KINDS.has(input.providerDiagnosticKind)) ||
    (input.providerHttpStatus != null &&
      (!Number.isInteger(input.providerHttpStatus) ||
        input.providerHttpStatus < 100 ||
        input.providerHttpStatus > 599))
  ) {
    return null;
  }
  const usage = sanitizeUsage(input.usage);
  if (input.usage != null && usage === null) return null;
  const event: FeedbackGenerationAttemptEvent = {
    event: "meelni_feedback_generation_attempt",
    version: 1,
    occurredAt: now().toISOString(),
    stage: input.stage,
    attempt: input.attempt,
    outcome: input.outcome,
    failureClass: input.failureClass ?? null,
    durationMs: Math.round(input.durationMs),
    remainingBudgetMs: Math.round(input.remainingBudgetMs),
    retryAfterMs:
      input.retryAfterMs == null ? null : Math.round(input.retryAfterMs),
    providerDiagnosticKind: input.providerDiagnosticKind ?? null,
    providerHttpStatus: input.providerHttpStatus ?? null,
    observedModel: sanitizeProviderLabel(input.observedModel),
    observedServiceTier: sanitizeProviderLabel(input.observedServiceTier),
    usage,
  };
  try {
    write(JSON.stringify(event));
  } catch {
    return null;
  }
  return event;
}

function boundedMilliseconds(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= FEEDBACK_GENERATION_DEADLINE_MS
  );
}

function sanitizeProviderLabel(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/.test(value) ? value : null;
}

function sanitizeUsage(
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
  return { ...value };
}
