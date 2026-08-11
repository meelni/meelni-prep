import OpenAI from "openai";
import {
  parseEvidenceLimitedFeedback,
  prepareFeedbackTranscript,
  type EvidenceLimitedFeedbackResult,
  type FeedbackTranscriptTurn,
} from "@meelni/core";

import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import { getFeedbackEvaluationModel } from "./model-config";
import {
  EVIDENCE_LIMITED_SYSTEM_PROMPT,
  getEvidenceLimitedEvaluationPrompt,
} from "./prompts";
import { getEvidenceLimitedProviderResponseFormat } from "./provider-response-format";
import {
  FEEDBACK_MAX_COMPLETION_TOKENS,
  FEEDBACK_MAX_SDK_RETRIES,
  FEEDBACK_REQUEST_TIMEOUT_MS,
  getEvaluationFailureCode,
  type FeedbackProviderUsage,
  type StartFeedbackObservabilityTrace,
} from "./scorer";
import {
  projectEvaluationTranscriptAliases,
  restoreCanonicalTranscriptIds,
} from "./transcript-aliases";

export async function generateEvidenceLimitedFeedback(
  roundType: string,
  transcript: FeedbackTranscriptTurn[],
  dependencies: {
    startObservabilityTrace?: StartFeedbackObservabilityTrace;
  } = {}
): Promise<EvidenceLimitedFeedbackResult> {
  const prepared = prepareFeedbackTranscript(transcript);
  if (!prepared.eligible || prepared.transcript.length === 0) {
    throw new Error("Cannot generate feedback without trustworthy evidence");
  }
  const projection = projectEvaluationTranscriptAliases(prepared.transcript);
  const model = getFeedbackEvaluationModel();
  const prompt = getEvidenceLimitedEvaluationPrompt(
    roundType,
    projection.transcript
  );
  const trace = dependencies.startObservabilityTrace?.({ model, prompt });
  let rawResponse: string | undefined;
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    const client = new OpenAI({
      apiKey,
      maxRetries: FEEDBACK_MAX_SDK_RETRIES,
      timeout: FEEDBACK_REQUEST_TIMEOUT_MS,
    });
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: EVIDENCE_LIMITED_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: getEvidenceLimitedProviderResponseFormat(
        projection.transcript
          .filter((turn) => turn.speaker === "user")
          .map((turn) => turn.eventId)
      ),
      max_completion_tokens: FEEDBACK_MAX_COMPLETION_TOKENS,
    });
    const choice = completion.choices[0];
    rawResponse = choice?.message.content ?? undefined;
    if (
      choice?.message.refusal ||
      choice?.finish_reason !== "stop" ||
      !rawResponse
    ) {
      throw new Error("evidence_limited_provider_incomplete");
    }
    const parsed = parseEvidenceLimitedFeedback(JSON.parse(rawResponse), {
      transcript: projection.transcript,
      modelVersion: completion.model,
    });
    const canonical = restoreCanonicalTranscriptIds(
      parsed,
      projection.canonicalIdByAlias
    );
    await trace?.end({
      status: "success",
      usage: parseUsage(completion.usage),
      response: rawResponse,
    });
    return canonical;
  } catch (error) {
    await trace?.end({ status: "error", response: rawResponse });
    const code = getEvaluationFailureCode(error);
    console.error("[Feedback Evaluation] evidence_limited_generation_failed", {
      code,
      ...toSafeErrorLog(error),
    });
    throw new Error(code);
  }
}

function parseUsage(
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number } | null;
      }
    | null
    | undefined
): FeedbackProviderUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}
