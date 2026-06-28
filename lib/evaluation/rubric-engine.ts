/**
 * Rubric Engine
 * Orchestrates the evaluation process: fetches transcript, calls GPT-4, generates drills
 */

import { generateFeedback as generateFeedbackScorer, EvaluationResult } from "./scorer";
import { generateDrills } from "./drill-generator";
import { getSessionById } from "@/lib/db/sessions";
import { getSessionTranscript } from "@/lib/db/transcripts";
import { createFeedback, getFeedbackBySessionId } from "@/lib/db/feedback";
import {
  EvaluationResponse,
  RubricScores,
  FeedbackItem,
  calculateOverallScore,
  clampScore,
} from "@meelni/core";

/**
 * Main evaluation function that orchestrates the entire scoring process
 *
 * @param sessionId - UUID of the interview session to evaluate
 * @returns Complete evaluation response with scores, feedback, and drills
 * @throws Error if session not found, transcript empty, or API call fails
 */
export async function evaluateSession(sessionId: string): Promise<EvaluationResponse> {
  // 1. Fetch session details
  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // 2. Fetch transcript
  const transcript = await getSessionTranscript(sessionId);
  if (transcript.length === 0) {
    throw new Error("Cannot evaluate session with empty transcript");
  }

  // 3. Prepare transcript for GPT-4
  const transcriptForEval = transcript.map((turn) => ({
    speaker: turn.speaker,
    text: turn.text || "",
  }));

  // 4. Generate feedback using GPT-4 Turbo
  const evaluation: EvaluationResult = await generateFeedbackScorer(
    session.roundType,
    transcriptForEval
  );

  // 5. Ensure scores are clamped to 0-10 range
  const scores: RubricScores = {
    structure: clampScore(evaluation.scores.structure),
    clarity: clampScore(evaluation.scores.clarity),
    insight: clampScore(evaluation.scores.insight),
    communication: clampScore(evaluation.scores.communication),
    leadership: clampScore(evaluation.scores.leadership),
    overall: clampScore(evaluation.overall_score),
  };

  // 6. Recalculate overall score using weighted formula (if needed)
  // Use GPT-4's score if reasonable, otherwise calculate from weights
  if (Math.abs(scores.overall - calculateOverallScore(scores)) > 0.5) {
    scores.overall = calculateOverallScore(scores);
  }

  // 7. Convert strengths and improvements to structured format
  const strengths: FeedbackItem[] = evaluation.strengths.map((text) => ({
    dimension: inferDimensionFromText(text),
    text,
    evidence_quote: extractQuoteFromText(text),
  }));

  const improvements: FeedbackItem[] = evaluation.improvements.map((text) => ({
    dimension: inferDimensionFromText(text),
    text,
    example: extractExampleFromText(text),
  }));

  // 8. Generate targeted drills based on weak areas
  const drillSuggestions = generateDrills(scores);

  // 9. Return complete evaluation response
  return {
    session_id: sessionId,
    scores,
    strengths,
    improvements,
    drills: drillSuggestions,
    summary: evaluation.summary,
  };
}

/**
 * Save evaluation results to database
 *
 * @param evaluation - Complete evaluation response
 * @returns Saved feedback record
 */
export async function saveEvaluation(evaluation: EvaluationResponse) {
  return await createFeedback({
    sessionId: evaluation.session_id,
    structureScore: evaluation.scores.structure,
    clarityScore: evaluation.scores.clarity,
    insightScore: evaluation.scores.insight,
    communicationScore: evaluation.scores.communication,
    leadershipScore: evaluation.scores.leadership,
    overallScore: evaluation.scores.overall,
    strengths: evaluation.strengths.map((s) => s.text),
    improvements: evaluation.improvements.map((i) => i.text),
    drills: evaluation.drills.map((d) => `${d.title}: ${d.description}`),
    summary: evaluation.summary,
  });
}

/**
 * Check if evaluation already exists for a session
 *
 * @param sessionId - UUID of the session
 * @returns True if evaluation exists, false otherwise
 */
export async function evaluationExists(sessionId: string): Promise<boolean> {
  const feedback = await getFeedbackBySessionId(sessionId);
  return !!feedback;
}

/**
 * Get existing evaluation from database
 *
 * @param sessionId - UUID of the session
 * @returns Evaluation response or null if not found
 */
export async function getExistingEvaluation(sessionId: string): Promise<EvaluationResponse | null> {
  const feedback = await getFeedbackBySessionId(sessionId);
  if (!feedback) {
    return null;
  }

  // Convert database record back to evaluation response format
  return {
    session_id: sessionId,
    scores: {
      structure: feedback.structureScore || 0,
      clarity: feedback.clarityScore || 0,
      insight: feedback.insightScore || 0,
      communication: feedback.communicationScore || 0,
      leadership: feedback.leadershipScore || 0,
      overall: parseFloat(feedback.overallScore || "0"),
    },
    strengths: (feedback.strengths as string[] || []).map((text: string) => ({
      dimension: inferDimensionFromText(text),
      text,
    })),
    improvements: (feedback.improvements as string[] || []).map((text: string) => ({
      dimension: inferDimensionFromText(text),
      text,
    })),
    drills: (feedback.drills as string[] || []).map(parseDrillString),
    summary: feedback.summary || "",
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Infer which dimension a feedback item relates to based on keywords
 */
function inferDimensionFromText(
  text: string
): "structure" | "clarity" | "insight" | "communication" | "leadership" {
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes("structure") ||
    lowerText.includes("framework") ||
    lowerText.includes("star") ||
    lowerText.includes("organized")
  ) {
    return "structure";
  }

  if (
    lowerText.includes("clear") ||
    lowerText.includes("clarity") ||
    lowerText.includes("explain") ||
    lowerText.includes("jargon")
  ) {
    return "clarity";
  }

  if (
    lowerText.includes("insight") ||
    lowerText.includes("metric") ||
    lowerText.includes("data") ||
    lowerText.includes("quantitative") ||
    lowerText.includes("analysis")
  ) {
    return "insight";
  }

  if (
    lowerText.includes("communication") ||
    lowerText.includes("pacing") ||
    lowerText.includes("engage") ||
    lowerText.includes("articulate")
  ) {
    return "communication";
  }

  if (
    lowerText.includes("leadership") ||
    lowerText.includes("ownership") ||
    lowerText.includes("decision") ||
    lowerText.includes("conviction") ||
    lowerText.includes("trade-off")
  ) {
    return "leadership";
  }

  // Default to structure if no clear indicator
  return "structure";
}

/**
 * Extract quote from feedback text (looks for quoted text)
 */
function extractQuoteFromText(text: string): string | undefined {
  const quoteMatch = text.match(/"([^"]+)"/);
  return quoteMatch ? quoteMatch[1] : undefined;
}

/**
 * Extract example from improvement text (looks for patterns like "Could have..." or "Try...")
 */
function extractExampleFromText(text: string): string | undefined {
  const examplePatterns = [
    /could have (.+)/i,
    /try (.+)/i,
    /consider (.+)/i,
    /example: (.+)/i,
  ];

  for (const pattern of examplePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Parse drill string from database back into DrillSuggestion object
 */
function parseDrillString(drillText: string) {
  // Format in DB: "Title: Description"
  const colonIndex = drillText.indexOf(":");
  if (colonIndex === -1) {
    return {
      title: drillText,
      description: "",
      tips: [],
    };
  }

  return {
    title: drillText.substring(0, colonIndex).trim(),
    description: drillText.substring(colonIndex + 1).trim(),
    tips: [], // Tips are not stored in DB currently
  };
}
