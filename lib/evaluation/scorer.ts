import {
  type FeedbackEvaluationState,
  type FeedbackTranscriptTurn,
  FeedbackV2ParseError,
  type FeedbackV2RejectionCode,
  type FeedbackV2Result,
  isFeedbackV2RejectionCode,
  parseFeedbackV2,
  prepareFeedbackTranscript,
} from "@meelni/core";
import OpenAI from "openai";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import { normalizePracticeRecommendations } from "@/lib/product-language";
import { getFeedbackEvaluationModel } from "./model-config";
import { EVALUATION_SYSTEM_PROMPT, getEvaluationPrompt } from "./prompts";
import {
  projectEvaluationTranscriptAliases,
  restoreCanonicalTranscriptIds,
} from "./transcript-aliases";
import { getFeedbackProviderResponseFormat } from "./provider-response-format";
import {
  appendCalibrationEvidenceHints,
  type CalibrationEvidenceHint,
} from "./calibration-evidence-hints";

export const FEEDBACK_CONFIGURATION_MISSING_OPENAI_KEY =
  "feedback_configuration_missing_openai_key";
export const FEEDBACK_CONFIGURATION_INVALID_OPENAI_KEY =
  "feedback_configuration_invalid_openai_key";
export const FEEDBACK_GENERATION_FAILED = "feedback_generation_failed";
export const FEEDBACK_REQUEST_TIMEOUT_MS = 75_000;
export const FEEDBACK_MAX_SDK_RETRIES = 0;
export const FEEDBACK_MAX_COMPLETION_TOKENS = 2_000;

import {
  CALIBRATION_MAX_COMPLETION_TOKENS,
  CALIBRATION_MAX_SDK_RETRIES,
  CALIBRATION_OFFICIAL_OPENAI_ENDPOINT,
  CALIBRATION_PRICING_CONTRACT,
  CALIBRATION_REQUEST_TIMEOUT_MS,
  CALIBRATION_SERVICE_TIER,
} from "./calibration-budget";
import { FEEDBACK_CALIBRATION_TEMPERATURE } from "./calibration-request-policy";

export interface FeedbackProviderUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface FeedbackObservabilityTrace {
  end(result: {
    status: "success" | "error";
    usage?: FeedbackProviderUsage;
    response?: string;
  }): Promise<void>;
}

export type StartFeedbackObservabilityTrace = (input: {
  model: string;
  prompt: string;
}) => FeedbackObservabilityTrace;

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
  "evaluation_private_capture_failed",
  "evaluation_provider_usage_missing",
  "evaluation_provider_invocation_failed",
] as const;

export type FeedbackProviderFailureCode =
  (typeof FEEDBACK_PROVIDER_FAILURE_CODES)[number];

export type FeedbackProviderInvocationDiagnosticKind =
  | "provider_bad_request"
  | "provider_authentication"
  | "provider_permission"
  | "provider_not_found"
  | "provider_conflict"
  | "provider_unprocessable"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_network"
  | "provider_aborted"
  | "provider_server_error"
  | "provider_unknown";

export interface FeedbackProviderInvocationDiagnostic {
  kind: FeedbackProviderInvocationDiagnosticKind;
  httpStatus?: number;
  retryAfterMs?: number;
}

const feedbackRejectionCodesByError = new WeakMap<
  FeedbackProviderInvocationError,
  FeedbackV2RejectionCode
>();

export class FeedbackProviderInvocationError extends Error {
  declare readonly feedbackRejectionCode: FeedbackV2RejectionCode | undefined;

  constructor(
    readonly code: FeedbackProviderFailureCode,
    readonly usage?: FeedbackProviderUsage,
    readonly observedModel?: string,
    readonly observedServiceTier?: string | null,
    options?: ErrorOptions & {
      diagnostic?: FeedbackProviderInvocationDiagnostic;
    }
  ) {
    super(code, options);
    this.name = "FeedbackProviderInvocationError";
    this.diagnostic = options?.diagnostic;
    Object.defineProperty(this, "feedbackRejectionCode", {
      configurable: false,
      enumerable: false,
      get: () => feedbackRejectionCodesByError.get(this),
    });
  }

  readonly diagnostic?: FeedbackProviderInvocationDiagnostic;
}

export function getAuthenticatedFeedbackRejectionCode(
  error: FeedbackProviderInvocationError
): FeedbackV2RejectionCode | undefined {
  return feedbackRejectionCodesByError.get(error);
}

function createInvalidFeedbackProviderError(
  usage: FeedbackProviderUsage,
  observedModel: string,
  observedServiceTier: string | null,
  feedbackRejectionCode: FeedbackV2RejectionCode
): FeedbackProviderInvocationError {
  const error = new FeedbackProviderInvocationError(
    "evaluation_provider_returned_invalid_feedback",
    usage,
    observedModel,
    observedServiceTier
  );
  feedbackRejectionCodesByError.set(error, feedbackRejectionCode);
  return error;
}

function classifyFeedbackParserFailure(
  error: unknown
): FeedbackV2RejectionCode {
  try {
    if (!(error instanceof FeedbackV2ParseError)) {
      return "parser_internal_failure";
    }
    const code: unknown = error.code;
    return isFeedbackV2RejectionCode(code) ? code : "parser_internal_failure";
  } catch {
    return "parser_internal_failure";
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
  evaluationState: FeedbackEvaluationState,
  dependencies: {
    startObservabilityTrace?: StartFeedbackObservabilityTrace;
  } = {}
): Promise<FeedbackV2Result> {
  try {
    return (
      await generateFeedbackWithUsage(roundType, transcript, evaluationState, {
        startObservabilityTrace: dependencies.startObservabilityTrace,
      })
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
    beforePhysicalRequest?: () => void | Promise<void>;
    onRawSyntheticOutput?: (rawResponse: Uint8Array) => void | Promise<void>;
    calibrationCredentials?: { openaiApiKey: string };
    calibrationEvidenceHints?: readonly CalibrationEvidenceHint[];
    startObservabilityTrace?: StartFeedbackObservabilityTrace;
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
      options.beforePhysicalRequest,
      options.onRawSyntheticOutput
    );
  }
  let observabilityTrace: FeedbackObservabilityTrace | undefined;
  let rawProviderResponse: string | undefined;
  try {
    const client = options.calibrationPaidMode
      ? createCalibrationOpenAIClient(
          { OPENAI_API_KEY: options.calibrationCredentials?.openaiApiKey },
          options.beforePhysicalRequest!
        )
      : createFeedbackOpenAIClient();
    const userPrompt = appendCalibrationEvidenceHints(
      getEvaluationPrompt(
        roundType,
        aliasProjection.transcript,
        evaluationState
      ),
      options.calibrationPaidMode
        ? options.calibrationEvidenceHints
        : undefined,
      aliasProjection.canonicalIdByAlias
    );
    if (!options.calibrationPaidMode && options.startObservabilityTrace) {
      observabilityTrace = options.startObservabilityTrace({
        model: modelVersion,
        prompt: userPrompt,
      });
    }
    const completion = await client.chat.completions.create({
      model: modelVersion,
      messages: [
        { role: "system", content: EVALUATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: FEEDBACK_CALIBRATION_TEMPERATURE,
      response_format: options.calibrationPaidMode
        ? getFeedbackProviderResponseFormat(evaluationState)
        : { type: "json_object" },
      ...(options.calibrationPaidMode
        ? getCalibrationProviderRequestFields()
        : getFeedbackProviderRequestFields(options.maxCompletionTokens)),
    });

    const observedServiceTier = completion.service_tier ?? null;
    const usage = parseFeedbackProviderUsage(
      completion.usage,
      completion.model,
      observedServiceTier
    );

    const choice = completion.choices[0];
    rawProviderResponse =
      typeof choice?.message.content === "string"
        ? choice.message.content
        : undefined;
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

    if (options.calibrationPaidMode) {
      try {
        await options.onRawSyntheticOutput!(Buffer.from(responseText, "utf8"));
      } catch (error) {
        throw new FeedbackProviderInvocationError(
          "evaluation_private_capture_failed",
          usage,
          completion.model,
          observedServiceTier,
          { cause: error }
        );
      }
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
    const result = parseFeedbackProviderEvaluation({
      value: unknownResponse,
      transcript: aliasProjection.transcript,
      canonicalIdByAlias: aliasProjection.canonicalIdByAlias,
      evaluationState,
      observedModel: completion.model,
      observedServiceTier,
      usage,
      calibrationEvidenceHints: options.calibrationPaidMode
        ? options.calibrationEvidenceHints
        : undefined,
    });
    await observabilityTrace?.end({
      status: "success",
      usage,
      response: rawProviderResponse,
    });
    return result;
  } catch (error) {
    await observabilityTrace?.end({
      status: "error",
      usage:
        error instanceof FeedbackProviderInvocationError
          ? error.usage
          : undefined,
      response: rawProviderResponse,
    });
    if (error instanceof FeedbackProviderInvocationError) throw error;
    throw new FeedbackProviderInvocationError(
      "evaluation_provider_invocation_failed",
      undefined,
      undefined,
      undefined,
      { cause: error, diagnostic: classifyProviderInvocationFailure(error) }
    );
  }
}

export function parseFeedbackProviderEvaluation(input: {
  value: unknown;
  transcript: FeedbackTranscriptTurn[];
  canonicalIdByAlias: ReadonlyMap<string, string>;
  evaluationState: FeedbackEvaluationState;
  observedModel: string;
  observedServiceTier: string | null;
  usage: FeedbackProviderUsage;
  calibrationEvidenceHints?: readonly CalibrationEvidenceHint[];
}): FeedbackProviderResult {
  let parsed: FeedbackV2Result;
  try {
    parsed = parseFeedbackV2(input.value, {
      transcript: input.transcript,
      evaluationState: input.evaluationState,
      modelVersion: input.observedModel,
    });
  } catch (error) {
    if (isSummaryGroundingFallbackError(error)) {
      try {
        parsed = parseFeedbackV2(
          withGroundedProviderSummaryFallback(input.value),
          {
            transcript: input.transcript,
            evaluationState: input.evaluationState,
            modelVersion: input.observedModel,
          }
        );
      } catch (fallbackError) {
        throw createInvalidFeedbackProviderError(
          input.usage,
          input.observedModel,
          input.observedServiceTier,
          classifyFeedbackParserFailure(fallbackError)
        );
      }
    } else if (
      isCalibrationEvidenceSlotFallbackError(error) &&
      input.calibrationEvidenceHints?.length
    ) {
      try {
        parsed = parseFeedbackV2(
          withCalibrationEvidenceSlotFallback(
            input.value,
            input.calibrationEvidenceHints,
            input.canonicalIdByAlias
          ),
          {
            transcript: input.transcript,
            evaluationState: input.evaluationState,
            modelVersion: input.observedModel,
          }
        );
      } catch (fallbackError) {
        throw createInvalidFeedbackProviderError(
          input.usage,
          input.observedModel,
          input.observedServiceTier,
          classifyFeedbackParserFailure(fallbackError)
        );
      }
    } else {
      throw createInvalidFeedbackProviderError(
        input.usage,
        input.observedModel,
        input.observedServiceTier,
        classifyFeedbackParserFailure(error)
      );
    }
  }

  let canonical: FeedbackV2Result;
  try {
    canonical = restoreCanonicalTranscriptIds(parsed, input.canonicalIdByAlias);
  } catch {
    throw createInvalidFeedbackProviderError(
      input.usage,
      input.observedModel,
      input.observedServiceTier,
      "parser_internal_failure"
    );
  }

  try {
    return {
      evaluation: normalizeFeedbackV2Recommendations(canonical),
      usage: input.usage,
      observedServiceTier: input.observedServiceTier,
    };
  } catch {
    throw createInvalidFeedbackProviderError(
      input.usage,
      input.observedModel,
      input.observedServiceTier,
      "practice_recommendation_normalization_failed"
    );
  }
}

function isCalibrationEvidenceSlotFallbackError(
  error: unknown
): error is FeedbackV2ParseError {
  try {
    return (
      error instanceof FeedbackV2ParseError &&
      (error.code === "evidence_reused_across_findings" ||
        error.code === "evidence_overlaps_across_findings" ||
        error.code === "finding_negative_claim_contradicted" ||
        error.code === "finding_material_claim_unsupported" ||
        error.code === "finding_quantitative_claim_unsupported" ||
        error.code === "finding_absolute_claim_unsupported")
    );
  } catch {
    return false;
  }
}

function isSummaryGroundingFallbackError(
  error: unknown
): error is FeedbackV2ParseError {
  try {
    return (
      error instanceof FeedbackV2ParseError &&
      (error.code === "summary_observable_support_insufficient" ||
        error.code === "summary_quantitative_claim_unsupported" ||
        error.code === "summary_absolute_claim_unsupported")
    );
  } catch {
    return false;
  }
}

function withCalibrationEvidenceSlotFallback(
  value: unknown,
  hints: readonly CalibrationEvidenceHint[],
  canonicalIdByAlias: ReadonlyMap<string, string>
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const aliasByCanonicalId = new Map<string, string>();
  for (const [alias, canonicalId] of canonicalIdByAlias.entries()) {
    aliasByCanonicalId.set(canonicalId, alias);
  }
  const unusedHints = hints
    .map((hint) => ({
      ...hint,
      turnRef: aliasByCanonicalId.get(hint.turnRef) ?? hint.turnRef,
    }))
    .filter((hint) => hint.quote.trim().length > 0);
  const used = new Set<string>();
  const response = value as {
    strengths?: unknown;
    improvements?: unknown;
  };
  const strengths = replaceCalibrationEvidenceSlots(
    response.strengths,
    "strength",
    unusedHints,
    used
  );
  const improvements = replaceCalibrationEvidenceSlots(
    response.improvements,
    "improvement",
    unusedHints,
    used
  );
  return withGroundedProviderSummaryFallback({
    ...value,
    strengths,
    improvements,
  });
}

function replaceCalibrationEvidenceSlots(
  items: unknown,
  kind: "strength" | "improvement",
  hints: readonly CalibrationEvidenceHint[],
  used: Set<string>
): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const dimension = (item as { dimension?: unknown }).dimension;
    const hint =
      hints.find(
        (candidate) =>
          !used.has(`${candidate.turnRef}\u0000${candidate.quote}`) &&
          candidate.kind === kind &&
          candidate.dimension === dimension
      ) ??
      hints.find(
        (candidate) =>
          !used.has(`${candidate.turnRef}\u0000${candidate.quote}`) &&
          candidate.kind === "fallback"
      );
    if (!hint) return item;
    used.add(`${hint.turnRef}\u0000${hint.quote}`);
    return {
      ...item,
      observation: sentenceCaseSummaryObservation(hint.quote),
      transcriptRefs: [hint.turnRef],
      evidence: [{ turnRef: hint.turnRef, quote: hint.quote }],
    };
  });
}

function withGroundedProviderSummaryFallback(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  return {
    ...value,
    summary: "Feedback is limited to the grounded findings above.",
  };
}

function sentenceCaseSummaryObservation(observation: string): string {
  const trimmed = observation.trim().replace(/\s+/g, " ");
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function parseFeedbackProviderUsage(
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

export function classifyProviderInvocationFailure(
  error: unknown
): FeedbackProviderInvocationDiagnostic {
  const status = getProviderHttpStatus(error);
  const retryAfterMs = getProviderRetryAfterMs(error);
  if (status !== undefined) {
    if (status === 400)
      return { kind: "provider_bad_request", httpStatus: status };
    if (status === 401)
      return { kind: "provider_authentication", httpStatus: status };
    if (status === 403)
      return { kind: "provider_permission", httpStatus: status };
    if (status === 404)
      return { kind: "provider_not_found", httpStatus: status };
    if (status === 408) return { kind: "provider_timeout", httpStatus: status };
    if (status === 409)
      return { kind: "provider_conflict", httpStatus: status };
    if (status === 422)
      return { kind: "provider_unprocessable", httpStatus: status };
    if (status === 429)
      return {
        kind: "provider_rate_limited",
        httpStatus: status,
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      };
    if (status >= 500 && status <= 599) {
      return {
        kind: "provider_server_error",
        httpStatus: status,
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      };
    }
    return { kind: "provider_unknown", httpStatus: status };
  }

  const name = getProviderErrorName(error);
  switch (name) {
    case "APIConnectionTimeoutError":
    case "TimeoutError":
      return { kind: "provider_timeout" };
    case "APIConnectionError":
      return { kind: "provider_network" };
    case "APIUserAbortError":
    case "AbortError":
      return { kind: "provider_aborted" };
    default:
      return { kind: "provider_unknown" };
  }
}

function getProviderHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return Number.isInteger(status) &&
    typeof status === "number" &&
    status >= 100 &&
    status <= 599
    ? status
    : undefined;
}

function getProviderErrorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return undefined;
  }
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

export function getProviderRetryAfterMs(
  error: unknown,
  nowMs = Date.now()
): number | undefined {
  if (typeof error !== "object" || error === null || !("headers" in error)) {
    return undefined;
  }
  const headers = (error as { headers?: unknown }).headers;
  let value: string | null | undefined;
  if (headers instanceof Headers) {
    value = headers.get("retry-after");
  } else if (headers && typeof headers === "object") {
    const record = headers as Record<string, unknown>;
    const candidate = record["retry-after"] ?? record["Retry-After"];
    value = typeof candidate === "string" ? candidate : undefined;
  }
  if (!value) return undefined;
  const seconds = Number(value);
  const delayMs = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(value) - nowMs;
  if (!Number.isFinite(delayMs) || delayMs < 0) return undefined;
  return Math.min(60_000, Math.max(0, Math.floor(delayMs)));
}

export function createFeedbackOpenAIClient(
  options: { timeoutMs?: number } = {}
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  const timeoutMs = options.timeoutMs ?? FEEDBACK_REQUEST_TIMEOUT_MS;
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > FEEDBACK_REQUEST_TIMEOUT_MS
  ) {
    throw new Error("feedback_provider_timeout_invalid");
  }
  return new OpenAI({
    apiKey,
    maxRetries: FEEDBACK_MAX_SDK_RETRIES,
    timeout: Math.floor(timeoutMs),
  });
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
  beforePhysicalRequest: (() => void | Promise<void>) | undefined,
  onRawSyntheticOutput:
    | ((rawResponse: Uint8Array) => void | Promise<void>)
    | undefined
): void {
  if (
    model !== CALIBRATION_PRICING_CONTRACT.model ||
    maxCompletionTokens !== CALIBRATION_MAX_COMPLETION_TOKENS ||
    typeof beforePhysicalRequest !== "function" ||
    typeof onRawSyntheticOutput !== "function"
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

export function getFeedbackProviderRequestFields(
  maxCompletionTokens?: number
): { max_completion_tokens: number } {
  return {
    max_completion_tokens:
      maxCompletionTokens ?? FEEDBACK_MAX_COMPLETION_TOKENS,
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
