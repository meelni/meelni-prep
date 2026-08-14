import {
  parseDimensionCoverageProviderSelection,
  type CandidateAnswerBlock,
  type DimensionCoverageFeedbackResult,
  type RoundType,
} from "@meelni/core";

import { toSafeErrorLog } from "@/lib/privacy/safe-error";
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
  try {
    const completion =
      await createFeedbackOpenAIClient().chat.completions.create({
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
    await trace?.end({ status: "success", usage });
    return result;
  } catch (error) {
    await trace?.end({
      status: "error",
      usage:
        error instanceof FeedbackProviderInvocationError
          ? error.usage
          : undefined,
    });
    console.error("[Feedback Evaluation] dimension_coverage_failed", {
      code: getEvaluationFailureCode(error),
      ...toSafeErrorLog(error),
    });
    throw new Error(getEvaluationFailureCode(error));
  }
}
