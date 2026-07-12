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

export interface FeedbackProviderUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface FeedbackProviderResult {
  evaluation: FeedbackV2Result;
  usage: FeedbackProviderUsage;
}

export class FeedbackProviderInvocationError extends Error {
  constructor(
    message: string,
    readonly usage?: FeedbackProviderUsage,
    readonly observedModel?: string,
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
  return (
    await generateFeedbackWithUsage(roundType, transcript, evaluationState)
  ).evaluation;
}

export async function generateFeedbackWithUsage(
  roundType: string,
  transcript: FeedbackTranscriptTurn[],
  evaluationState: FeedbackEvaluationState,
  options: { maxCompletionTokens?: number } = {}
): Promise<FeedbackProviderResult> {
  const prepared = prepareFeedbackTranscript(transcript);
  if (!prepared.eligible || prepared.transcript.length === 0) {
    throw new Error(
      prepared.reasons[0] ||
        "Cannot generate feedback without trustworthy user transcript evidence"
    );
  }

  const modelVersion = getFeedbackEvaluationModel();
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: modelVersion,
      messages: [
        { role: "system", content: EVALUATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: getEvaluationPrompt(
            roundType,
            prepared.transcript,
            evaluationState
          ),
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
      ...(options.maxCompletionTokens === undefined
        ? {}
        : { max_completion_tokens: options.maxCompletionTokens }),
    });

    const usage = parseProviderUsage(completion.usage, completion.model);

    const responseText = completion.choices[0]?.message.content;
    if (!responseText) {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_returned_no_content",
        usage,
        completion.model
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
        { cause: error }
      );
    }

    // Preserve the model identity reported by the provider, which may resolve a
    // configured alias to a dated snapshot.
    try {
      const evaluation = parseFeedbackV2(unknownResponse, {
        transcript: prepared.transcript,
        evaluationState,
        modelVersion: completion.model,
      });
      return {
        evaluation: {
          ...evaluation,
          drills: normalizePracticeRecommendations(evaluation.drills),
        },
        usage,
      };
    } catch (error) {
      throw new FeedbackProviderInvocationError(
        "evaluation_provider_returned_invalid_feedback",
        usage,
        completion.model,
        { cause: error }
      );
    }
  } catch (error) {
    if (error instanceof FeedbackProviderInvocationError) throw error;
    throw new FeedbackProviderInvocationError(
      "evaluation_provider_invocation_failed",
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
  observedModel: string
): FeedbackProviderUsage {
  if (!usage) {
    throw new FeedbackProviderInvocationError(
      "evaluation_provider_usage_missing",
      undefined,
      observedModel
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
