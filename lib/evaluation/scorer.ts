import OpenAI from "openai";
import {
  parseFeedbackV2,
  type FeedbackEvaluationState,
  type FeedbackTranscriptTurn,
  type FeedbackV2Result,
} from "@meelni/core";
import { EVALUATION_SYSTEM_PROMPT, getEvaluationPrompt } from "./prompts";
import { getFeedbackEvaluationModel } from "./model-config";
import { normalizePracticeRecommendations } from "@/lib/product-language";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";

export const FEEDBACK_CONFIGURATION_MISSING_OPENAI_KEY =
  "feedback_configuration_missing_openai_key";
export const FEEDBACK_CONFIGURATION_INVALID_OPENAI_KEY =
  "feedback_configuration_invalid_openai_key";
export const FEEDBACK_GENERATION_FAILED = "feedback_generation_failed";

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
  if (transcript.length === 0) {
    throw new Error("Cannot generate feedback for empty canonical transcript");
  }

  const modelVersion = getFeedbackEvaluationModel();
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: modelVersion,
      messages: [
        { role: "system", content: EVALUATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: getEvaluationPrompt(roundType, transcript, evaluationState),
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message.content;
    if (!responseText) throw new Error("Evaluation model returned no content");

    let unknownResponse: unknown;
    try {
      unknownResponse = JSON.parse(responseText);
    } catch (error) {
      throw new Error("Evaluation model returned invalid JSON", {
        cause: error,
      });
    }

    const result = parseFeedbackV2(unknownResponse, {
      transcript,
      evaluationState,
      modelVersion,
    });
    return normalizeFeedbackV2Recommendations(result);
  } catch (error) {
    const code = getEvaluationFailureCode(error);
    console.error("[Feedback Evaluation] generation_failed", {
      code,
      ...toSafeErrorLog(error),
    });
    throw new Error(code);
  }
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
  if (
    error instanceof Error &&
    error.message === "OPENAI_API_KEY environment variable is required"
  ) {
    return FEEDBACK_CONFIGURATION_MISSING_OPENAI_KEY;
  }

  if (isInvalidOpenAIKeyError(error)) {
    return FEEDBACK_CONFIGURATION_INVALID_OPENAI_KEY;
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
