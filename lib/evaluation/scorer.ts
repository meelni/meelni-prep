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

    // Preserve the model identity reported by the provider, which may resolve a
    // configured alias to a dated snapshot.
    const result = parseFeedbackV2(unknownResponse, {
      transcript: prepared.transcript,
      evaluationState,
      modelVersion: completion.model,
    });
    return {
      ...result,
      drills: normalizePracticeRecommendations(result.drills),
    };
  } catch (error) {
    console.error("Error generating feedback:", error);
    throw new Error("Failed to generate valid feedback v2", { cause: error });
  }
}

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}
