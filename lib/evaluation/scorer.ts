import OpenAI from "openai";
import {
  parseFeedbackV2,
  prepareFeedbackTranscript,
  type FeedbackEvaluationState,
  type FeedbackTranscriptTurn,
  type FeedbackV2Result,
} from "@meelni/core";
import { EVALUATION_SYSTEM_PROMPT, getEvaluationPrompt } from "./prompts";
import {
  projectEvaluationTranscriptAliases,
  restoreCanonicalTranscriptIds,
} from "./transcript-aliases";
import { getFeedbackEvaluationModel } from "./model-config";
import { normalizePracticeRecommendations } from "@/lib/product-language";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";

export const FEEDBACK_CONFIGURATION_MISSING_OPENAI_KEY =
  "feedback_configuration_missing_openai_key";
export const FEEDBACK_CONFIGURATION_INVALID_OPENAI_KEY =
  "feedback_configuration_invalid_openai_key";
export const FEEDBACK_GENERATION_FAILED = "feedback_generation_failed";
import {
  CALIBRATION_MAX_COMPLETION_TOKENS,
  CALIBRATION_MAX_SDK_RETRIES,
  CALIBRATION_OFFICIAL_OPENAI_ENDPOINT,
  CALIBRATION_SERVICE_TIER,
  CALIBRATION_PRICING_CONTRACT,
  CALIBRATION_REQUEST_TIMEOUT_MS,
} from "./calibration-budget";

export interface FeedbackProviderUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface FeedbackProviderResult {
  evaluation: FeedbackV2Result;
  usage: FeedbackProviderUsage;
  observedServiceTier: string | null;
}

export class FeedbackProviderInvocationError extends Error {
  constructor(
    message: string,
    readonly usage?: FeedbackProviderUsage,
    readonly observedModel?: string,
    readonly observedServiceTier?: string | null,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "FeedbackProviderInvocationError";
  }
}

/**
 * Call the configured evaluation model and accept only strict, transcript-
 * grounded feedback v2. Parsing and score arithmetic stay provider-neutral in
 * core; this adapter never repairs malformed output.
 */
export async function generateFeedback(
  roundType: string,
  transcript: FeedbackTranscriptTurn[],
  evaluationState: FeedbackEvaluationState
): Promise<FeedbackV2Result> {
  try {
    return (
      await generateFeedbackWithUsage(roundType, transcript, evaluationState)
    ).evaluation;
  } catch (error) {
    const code = getEvaluationFailureCode(error);
    console.error("[Feedback Evaluation] generation_failed", {
      code,
      ...toSafeErrorLog(error),
    });
    throw new Error(code);
  }
}

export async function generateFeedbackWithUsage(
  roundType: string,
  transcript: FeedbackTranscriptTurn[],
  evaluationState: FeedbackEvaluationState,
  options: {
    maxCompletionTokens?: number;
    calibrationPaidMode?: boolean;
    beforePhysicalRequest?: () => void;
  } = {}
): Promise<FeedbackProviderResult> {
  const prepared = prepareFeedbackTranscript(transcript);
  if (!prepared.eligible || prepared.transcript.length === 0) {
    throw new Error(
      prepared.reasons[0] ||
        "Cannot generate feedback without trustworthy user transcript evidence"
    );
  }

  const aliasProjection = projectEvaluationTranscriptAliases(
    prepared.transcript
  );
  const modelVersion = getFeedbackEvaluationModel();
  if (options.calibrationPaidMode) {
    assertCalibrationProviderRequestPolicy(
      modelVersion,
      options.maxCompletionTokens,
      options.beforePhysicalRequest
    );
  }
  try {
    const client = options.calibrationPaidMode
      ? createCalibrationOpenAIClient()
      : getOpenAI();
    const userPrompt = getEvaluationPrompt(
      roundType,
      aliasProjection.transcript,
      evaluationState
    );
    if (options.calibrationPaidMode) options.beforePhysicalRequest!();
    const completion = await client.chat.completions.create({
      model: modelVersion,
      messages: [
        { role: "system", content: EVALUATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
      ...(options.calibrationPaidMode
        ? getCalibrationProviderRequestFields()
        : options.maxCompletionTokens === undefined
          ? {}
          : { max_completion_tokens: options.maxCompletionTokens }),
    });

    const observedServiceTier = completion.service_tier ?? null;
    const usage = parseProviderUsage(
      completion.usage,
      completion.model,
      observedServiceTier
    );

    const responseText = completion.choices[0]?.message.content;
    if (!responseText) {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_returned_no_content",
        usage,
        completion.model,
        observedServiceTier
      );
    }

    let unknownResponse: unknown;
    try {
      unknownResponse = JSON.parse(responseText);
    } catch (error) {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_returned_invalid_json",
        usage,
        completion.model,
        observedServiceTier,
        { cause: error }
      );
    }

    // Preserve the model identity reported by the provider, which may resolve a
    // configured alias to a dated snapshot.
    try {
      const parsed = parseFeedbackV2(unknownResponse, {
        transcript: aliasProjection.transcript,
        evaluationState,
        modelVersion: completion.model,
      });
      return {
        evaluation: normalizeFeedbackV2Recommendations(
          restoreCanonicalTranscriptIds(
            parsed,
            aliasProjection.canonicalIdByAlias
          )
        ),
        usage,
        observedServiceTier,
      };
    } catch (error) {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_returned_invalid_feedback",
        usage,
        completion.model,
        observedServiceTier,
        { cause: error }
      );
    }
  } catch (error) {
    if (error instanceof FeedbackProviderInvocationError) throw error;
    throw new FeedbackProviderInvocationError(
      "evaluation_provider_invocation_failed",
      undefined,
      undefined,
      undefined,
      { cause: error }
    );
  }
}

function parseProviderUsage(
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number } | null;
      }
    | null
    | undefined,
  observedModel: string,
  observedServiceTier: string | null
): FeedbackProviderUsage {
  if (!usage) {
    throw new FeedbackProviderInvocationError(
      "evaluation_provider_usage_missing",
      undefined,
      observedModel,
      observedServiceTier
    );
  }
  return {
    inputTokens: usage.prompt_tokens ?? Number.NaN,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? Number.NaN,
    totalTokens: usage.total_tokens ?? Number.NaN,
  };
}

export function normalizeFeedbackV2Recommendations(
  result: FeedbackV2Result
): FeedbackV2Result {
  const recommendations = normalizePracticeRecommendations(result.drills);
  if (recommendations.length === 0) {
    throw new Error(
      "Feedback v2 requires at least one product-language-safe practice recommendation"
    );
  }

  return { ...result, drills: recommendations };
}

export function getEvaluationFailureCode(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (
      current instanceof Error &&
      current.message === "OPENAI_API_KEY environment variable is required"
    ) {
      return FEEDBACK_CONFIGURATION_MISSING_OPENAI_KEY;
    }
    if (isInvalidOpenAIKeyError(current)) {
      return FEEDBACK_CONFIGURATION_INVALID_OPENAI_KEY;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return FEEDBACK_GENERATION_FAILED;
}

function isInvalidOpenAIKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const safeFields = error as {
    status?: unknown;
    code?: unknown;
    name?: unknown;
  };
  return (
    safeFields.status === 401 ||
    safeFields.code === "invalid_api_key" ||
    safeFields.name === "AuthenticationError"
  );
}

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

export type CalibrationOpenAIEnvironment = Record<
  string,
  string | undefined
> & {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
};

export function assertCalibrationOpenAIEnvironment(
  env: CalibrationOpenAIEnvironment = process.env
): void {
  if (env.OPENAI_BASE_URL !== undefined) {
    throw new Error("calibration_rejects_ambient_openai_base_url");
  }
}

export function assertCalibrationProviderRequestPolicy(
  model: string,
  maxCompletionTokens: number | undefined,
  beforePhysicalRequest: (() => void) | undefined
): void {
  if (
    model !== CALIBRATION_PRICING_CONTRACT.model ||
    maxCompletionTokens !== CALIBRATION_MAX_COMPLETION_TOKENS ||
    typeof beforePhysicalRequest !== "function"
  ) {
    throw new Error("calibration_provider_request_policy_mismatch");
  }
}

export function getCalibrationProviderRequestFields(): {
  max_completion_tokens: 2_000;
  service_tier: "default";
} {
  return {
    max_completion_tokens: CALIBRATION_MAX_COMPLETION_TOKENS,
    service_tier: CALIBRATION_SERVICE_TIER,
  };
}

export function createCalibrationOpenAIClient(
  env: CalibrationOpenAIEnvironment = process.env
): OpenAI {
  assertCalibrationOpenAIEnvironment(env);
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for an authorized live run");
  }
  return new OpenAI({
    apiKey,
    baseURL: CALIBRATION_OFFICIAL_OPENAI_ENDPOINT,
    maxRetries: CALIBRATION_MAX_SDK_RETRIES,
    timeout: CALIBRATION_REQUEST_TIMEOUT_MS,
    fetchOptions: { redirect: "error" },
  });
}
