import {
  parseDimensionCoverageProviderSelection,
  type CandidateAnswerBlock,
  type DimensionCoverageFeedbackResult,
  type RoundType,
} from "@meelni/core";

import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import { getFeedbackGenerationRemainingBudgetMs } from "./feedback-generation-policy";
import type { FeedbackGenerationAttemptReporter } from "@/lib/operations/feedback-generation-attempt";
import { getFeedbackEvaluationModel } from "./model-config";
import {
  DIMENSION_COVERAGE_SYSTEM_PROMPT,
  getDimensionCoveragePrompt,
} from "./dimension-coverage-prompt";
import {
  getDimensionCoverageProviderResponseFormat,
  normalizeDimensionCoverageProviderResponse,
} from "./dimension-coverage-provider-format";
import {
  FeedbackProviderInvocationError,
  classifyProviderInvocationFailure,
  createFeedbackOpenAIClient,
  getEvaluationFailureCode,
  getFeedbackProviderRequestFields,
  parseFeedbackProviderUsage,
  type StartFeedbackObservabilityTrace,
} from "./scorer";
import { FEEDBACK_CALIBRATION_TEMPERATURE } from "./calibration-request-policy";

/**
 * Provider adapter for the closed dimension-selection contract. The raw
 * provider response and answer-block text are never logged or returned.
 */
export async function generateDimensionCoverageFeedback(
  roundType: RoundType,
  answerBlocks: readonly CandidateAnswerBlock[],
  allowNumericalScores: boolean,
  dependencies: {
    startObservabilityTrace?: StartFeedbackObservabilityTrace;
    requestTimeoutMs?: number;
    attempt?: number;
    deadlineAtMs?: number;
    now?: () => number;
    reportAttempt?: FeedbackGenerationAttemptReporter;
  } = {}
): Promise<DimensionCoverageFeedbackResult> {
  if (answerBlocks.length === 0) {
    throw new Error("feedback_dimension_coverage_requires_answer_blocks");
  }
  const modelVersion = getFeedbackEvaluationModel();
  const prompt = getDimensionCoveragePrompt(
    roundType,
    answerBlocks,
    allowNumericalScores
  );
  const trace = dependencies.startObservabilityTrace?.({
    model: modelVersion,
    prompt: `dimension-coverage:${roundType}:blocks=${answerBlocks.length}`,
  });
  const now = dependencies.now ?? Date.now;
  const attempt = dependencies.attempt ?? 1;
  const deadlineAtMs = dependencies.deadlineAtMs ?? now() + 90_000;
  const providerStartedAt = now();
  let validationStartedAt = providerStartedAt;
  try {
    const completion = await createFeedbackOpenAIClient({
      timeoutMs: dependencies.requestTimeoutMs,
    }).chat.completions.create({
      model: modelVersion,
      messages: [
        { role: "system", content: DIMENSION_COVERAGE_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: FEEDBACK_CALIBRATION_TEMPERATURE,
      response_format: getDimensionCoverageProviderResponseFormat(
        roundType,
        answerBlocks,
        allowNumericalScores
      ),
      ...getFeedbackProviderRequestFields(),
    });
    const observedServiceTier = completion.service_tier ?? null;
    safelyReportAttempt(dependencies.reportAttempt, {
      stage: "provider",
      attempt,
      outcome: "succeeded",
      durationMs: Math.max(0, now() - providerStartedAt),
      remainingBudgetMs: getFeedbackGenerationRemainingBudgetMs(
        deadlineAtMs,
        now()
      ),
      observedModel: completion.model,
      observedServiceTier,
    });
    validationStartedAt = now();
    const usage = parseFeedbackProviderUsage(
      completion.usage,
      completion.model,
      observedServiceTier
    );
    const choice = completion.choices[0];
    if (
      typeof choice?.message.refusal === "string" &&
      choice.message.refusal.trim()
    ) {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_refused",
        usage,
        completion.model,
        observedServiceTier
      );
    }
    if (choice?.finish_reason === "length") {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_incomplete",
        usage,
        completion.model,
        observedServiceTier
      );
    }
    if (choice?.finish_reason === "content_filter") {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_content_filtered",
        usage,
        completion.model,
        observedServiceTier
      );
    }
    if (choice?.finish_reason !== "stop") {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_unexpected_finish",
        usage,
        completion.model,
        observedServiceTier
      );
    }
    if (typeof choice.message.content !== "string" || !choice.message.content) {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_returned_no_content",
        usage,
        completion.model,
        observedServiceTier
      );
    }
    let value: unknown;
    try {
      value = JSON.parse(choice.message.content);
    } catch (error) {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_returned_invalid_json",
        usage,
        completion.model,
        observedServiceTier,
        { cause: error }
      );
    }
    let result: DimensionCoverageFeedbackResult;
    try {
      const normalized = normalizeDimensionCoverageProviderResponse(
        value,
        roundType
      );
      result = parseDimensionCoverageProviderSelection(normalized, {
        roundType,
        answerBlocks,
        modelVersion: completion.model,
        allowNumericalScores,
      });
    } catch (error) {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_returned_invalid_feedback",
        usage,
        completion.model,
        observedServiceTier,
        { cause: error }
      );
    }
    await safelyEndTrace(trace, { status: "success", usage });
    safelyReportAttempt(dependencies.reportAttempt, {
      stage: "validation",
      attempt,
      outcome: "succeeded",
      durationMs: Math.max(0, now() - validationStartedAt),
      remainingBudgetMs: getFeedbackGenerationRemainingBudgetMs(
        deadlineAtMs,
        now()
      ),
      observedModel: completion.model,
      observedServiceTier,
      usage,
    });
    return result;
  } catch (error) {
    const providerError =
      error instanceof FeedbackProviderInvocationError
        ? error
        : new FeedbackProviderInvocationError(
            "evaluation_provider_invocation_failed",
            undefined,
            undefined,
            undefined,
            {
              cause: error,
              diagnostic: classifyProviderInvocationFailure(error),
            }
          );
    await safelyEndTrace(trace, {
      status: "error",
      usage: providerError.usage,
    });
    console.error("[Feedback Evaluation] dimension_coverage_failed", {
      code: getEvaluationFailureCode(providerError),
      ...toSafeErrorLog(providerError),
    });
    throw providerError;
  }
}

async function safelyEndTrace(
  trace: Awaited<ReturnType<StartFeedbackObservabilityTrace>> | undefined,
  result: Parameters<NonNullable<typeof trace>["end"]>[0]
): Promise<void> {
  try {
    await trace?.end(result);
  } catch {
    // Optional observability cannot change validation or retry ownership.
  }
}

function safelyReportAttempt(
  report: FeedbackGenerationAttemptReporter | undefined,
  input: Parameters<FeedbackGenerationAttemptReporter>[0]
): void {
  try {
    report?.(input);
  } catch {
    // Operational telemetry is best-effort and cannot change evaluation.
  }
}
