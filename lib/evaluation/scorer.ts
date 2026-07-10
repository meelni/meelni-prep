import OpenAI from "openai";
import { EVALUATION_SYSTEM_PROMPT, getEvaluationPrompt } from "./prompts";
import { getFeedbackEvaluationModel } from "./model-config";

export interface EvaluationResult {
  scores: {
    structure: number;
    clarity: number;
    insight: number;
    communication: number;
    leadership: number;
  };
  overall_score: number;
  strengths: string[];
  improvements: string[];
  drills: string[];
  summary: string;
}

/**
 * Generate feedback for an interview session using GPT-4 Turbo
 */
export async function generateFeedback(
  roundType: string,
  transcript: { speaker: string; text: string }[]
): Promise<EvaluationResult> {
  if (transcript.length === 0) {
    throw new Error("Cannot generate feedback for empty transcript");
  }

  try {
    const openai = getOpenAI();
    const userPrompt = getEvaluationPrompt(roundType, transcript);

    const completion = await openai.chat.completions.create({
      model: getFeedbackEvaluationModel(),
      messages: [
        { role: "system", content: EVALUATION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more consistent scoring
      response_format: { type: "json_object" }, // Ensure JSON response
    });

    const responseText = completion.choices[0].message.content;
    if (!responseText) {
      throw new Error("Empty response from OpenAI");
    }

    const result = JSON.parse(responseText) as EvaluationResult;

    // Validate response structure
    if (!result.scores || !result.overall_score || !result.summary) {
      throw new Error("Invalid evaluation result structure");
    }

    // Ensure scores are within bounds
    const scores = {
      structure: clamp(result.scores.structure, 0, 10),
      clarity: clamp(result.scores.clarity, 0, 10),
      insight: clamp(result.scores.insight, 0, 10),
      communication: clamp(result.scores.communication, 0, 10),
      leadership: clamp(result.scores.leadership, 0, 10),
    };

    const overall_score = clamp(result.overall_score, 0, 10);

    return {
      scores,
      overall_score,
      strengths: result.strengths || [],
      improvements: result.improvements || [],
      drills: result.drills || [],
      summary: result.summary || "No summary provided",
    };
  } catch (error) {
    throw new Error(classifyEvaluationFailure(error));
  }
}

function classifyEvaluationFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("openai_api_key")) {
    return "feedback_evaluation_key_missing";
  }
  if (message.includes("401") || message.includes("invalid api key")) {
    return "feedback_evaluation_auth_failed";
  }
  return "feedback_evaluation_failed";
}

/**
 * Clamp a number between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  return new OpenAI({ apiKey });
}

/**
 * Calculate overall score from individual competency scores
 * This is a fallback if GPT-4 doesn't provide overall_score
 */
export function calculateOverallScore(scores: {
  structure: number;
  clarity: number;
  insight: number;
  communication: number;
  leadership: number;
}): number {
  const weights = {
    structure: 0.2,
    clarity: 0.2,
    insight: 0.25,
    communication: 0.2,
    leadership: 0.15,
  };

  const weighted =
    scores.structure * weights.structure +
    scores.clarity * weights.clarity +
    scores.insight * weights.insight +
    scores.communication * weights.communication +
    scores.leadership * weights.leadership;

  return Math.round(weighted * 10) / 10; // Round to 1 decimal
}
