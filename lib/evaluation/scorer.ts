import OpenAI from "openai";
import {
  parseFeedbackV2,
  prepareFeedbackTranscript,
  type FeedbackEvaluationState,
  type FeedbackTranscriptTurn,
  type FeedbackV2Result,
} from "@meelni/core";
import { EVALUATION_SYSTEM_PROMPT, getEvaluationPrompt } from "./prompts";
import { getFeedbackEvaluationModel } from "./model-config";
import { normalizePracticeRecommendations } from "@/lib/product-language";
import {
  CALIBRATION_MAX_COMPLETION_TOKENS,
  CALIBRATION_MAX_SDK_RETRIES,
  CALIBRATION_OFFICIAL_OPENAI_ENDPOINT,
  CALIBRATION_SERVICE_TIER,
  CALIBRATION_PRICING_CONTRACT,
  CALIBRATION_REQUEST_TIMEOUT_MS,
} from "./calibration-budget";
import { getFeedbackProviderResponseFormat } from "./provider-response-format";

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

export const FEEDBACK_PROVIDER_FAILURE_CODES = [
  "evaluation_provider_refused",
  "evaluation_provider_incomplete",
  "evaluation_provider_content_filtered",
  "evaluation_provider_unexpected_finish",
  "evaluation_provider_returned_no_content",
  "evaluation_provider_returned_invalid_json",
  "evaluation_provider_returned_invalid_feedback",
  "evaluation_provider_usage_missing",
  "evaluation_provider_invocation_failed",
] as const;

export type FeedbackProviderFailureCode =
  (typeof FEEDBACK_PROVIDER_FAILURE_CODES)[number];

export class FeedbackProviderInvocationError extends Error {
  constructor(
    readonly code: FeedbackProviderFailureCode,
    readonly usage?: FeedbackProviderUsage,
    readonly observedModel?: string,
    readonly observedServiceTier?: string | null,
    options?: ErrorOptions
  ) {
    super(code, options);
    this.name = "FeedbackProviderInvocationError";
  }
}

export interface FeedbackProviderCompletion {
  model: string;
  service_tier?: string | null;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
  } | null;
  choices: Array<{
    finish_reason?: string | null;
    message: { content?: string | null; refusal?: string | null };
  }>;
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
  return (
    await generateFeedbackWithUsage(roundType, transcript, evaluationState)
  ).evaluation;
}

export async function generateFeedbackWithUsage(
  roundType: string,
  transcript: FeedbackTranscriptTurn[],
  evaluationState: FeedbackEvaluationState,
  options: {
    maxCompletionTokens?: number;
    calibrationPaidMode?: boolean;
    beforePhysicalRequest?: () => void | Promise<void>;
    calibrationCredentials?: { openaiApiKey: string };
  } = {}
): Promise<FeedbackProviderResult> {
  const prepared = prepareFeedbackTranscript(transcript);
  if (!prepared.eligible || prepared.transcript.length === 0) {
    throw new Error(
      prepared.reasons[0] ||
        "Cannot generate feedback without trustworthy user transcript evidence"
    );
  }

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
      ? createCalibrationOpenAIClient(
          { OPENAI_API_KEY: options.calibrationCredentials?.openaiApiKey },
          options.beforePhysicalRequest!
        )
      : getOpenAI();
    const userPrompt = getEvaluationPrompt(
      roundType,
      prepared.transcript,
      evaluationState
    );
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
      response_format: getFeedbackProviderResponseFormat(evaluationState),
      ...(options.calibrationPaidMode
        ? getCalibrationProviderRequestFields()
        : options.maxCompletionTokens === undefined
          ? {}
          : { max_completion_tokens: options.maxCompletionTokens }),
    });

    return parseFeedbackProviderCompletion(
      completion,
      prepared.transcript,
      evaluationState
    );
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

export function parseFeedbackProviderCompletion(
  completion: FeedbackProviderCompletion,
  transcript: FeedbackTranscriptTurn[],
  evaluationState: FeedbackEvaluationState
): FeedbackProviderResult {
  const observedServiceTier = completion.service_tier ?? null;
  const usage = parseProviderUsage(
    completion.usage,
    completion.model,
    observedServiceTier
  );
  const choice = completion.choices[0];
  const refusal = choice?.message.refusal;
  if (typeof refusal === "string" && refusal.trim()) {
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
  if (
    choice?.finish_reason === "tool_calls" ||
    choice?.finish_reason === "function_call"
  ) {
    throw new FeedbackProviderInvocationError(
      "evaluation_provider_unexpected_finish",
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
  const responseText = choice?.message.content;
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

  try {
    const evaluation = parseFeedbackV2(unknownResponse, {
      transcript,
      evaluationState,
      modelVersion: completion.model,
    });
    return {
      evaluation: {
        ...evaluation,
        drills: normalizePracticeRecommendations(evaluation.drills),
      },
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
  beforePhysicalRequest: (() => void | Promise<void>) | undefined
): void {
  if (
    model !== CALIBRATION_PRICING_CONTRACT.model ||
    maxCompletionTokens !== CALIBRATION_MAX_COMPLETION_TOKENS ||
    typeof beforePhysicalRequest !== "function"
  ) {
    throw new Error("calibration_provider_request_policy_mismatch");
  }
  throw new Error(
    "calibration_provider_response_format_requires_new_authorized_plan"
  );
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
  env: CalibrationOpenAIEnvironment = process.env,
  beforePhysicalRequest: () => void | Promise<void> = () => {
    throw new Error("calibration_transport_authorization_missing");
  },
  fetchImplementation: typeof fetch = globalThis.fetch
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
    fetch: createGuardedCalibrationFetch(
      beforePhysicalRequest,
      fetchImplementation
    ),
  });
}

export function createGuardedCalibrationFetch(
  beforePhysicalRequest: () => void | Promise<void>,
  fetchImplementation: typeof fetch = globalThis.fetch
): typeof fetch {
  if (typeof beforePhysicalRequest !== "function") {
    throw new Error("calibration_transport_authorization_missing");
  }
  return async (input, init) => {
    await beforePhysicalRequest();
    return fetchImplementation(input, { ...init, redirect: "error" });
  };
}
