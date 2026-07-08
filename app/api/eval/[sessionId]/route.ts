/**
 * Session Evaluation API
 *
 * POST endpoint that evaluates a completed interview session using GPT-4 Turbo.
 * Generates rubric scores (0-10 scale), identifies strengths/improvements with evidence,
 * and provides targeted practice drills. This endpoint is idempotent - calling it
 * multiple times for the same session returns the cached result.
 *
 * @route POST /api/eval/:sessionId
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @param {string} sessionId - UUID of the session (URL parameter)
 *
 * @response {Object} response - Evaluation results
 * @response.session_id {string} - Session UUID
 * @response.scores {Object} - Rubric scores for 5 dimensions plus overall
 * @response.scores.structure {number} - Structure score (0-10)
 * @response.scores.clarity {number} - Clarity score (0-10)
 * @response.scores.insight {number} - Insight score (0-10)
 * @response.scores.communication {number} - Communication score (0-10)
 * @response.scores.leadership {number} - Leadership score (0-10)
 * @response.scores.overall {number} - Weighted overall score (0-10)
 * @response.strengths {Array<Object>} - List of strengths with evidence
 * @response.strengths[].dimension {string} - Related competency dimension
 * @response.strengths[].text {string} - Strength statement
 * @response.strengths[].evidence_quote {string} - Quote from transcript
 * @response.improvements {Array<Object>} - List of improvement areas
 * @response.improvements[].dimension {string} - Related competency dimension
 * @response.improvements[].text {string} - Improvement suggestion
 * @response.improvements[].example {string} - Concrete example
 * @response.drills {Array<Object>} - Practice drill recommendations
 * @response.drills[].title {string} - Drill name
 * @response.drills[].description {string} - What the drill does
 * @response.drills[].tips {Array<string>} - Actionable tips
 * @response.summary {string} - Executive summary (2-3 sentences)
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {403} Forbidden - User does not own this session
 * @throws {404} Not Found - Session not found
 * @throws {400} Bad Request - Empty transcript or invalid session state
 * @throws {500} Internal Server Error - GPT-4 API error or database error
 *
 * @example
 * // Request
 * POST /api/eval/550e8400-e29b-41d4-a716-446655440000
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *
 * // Response (200 OK)
 * {
 *   "session_id": "550e8400-e29b-41d4-a716-446655440000",
 *   "scores": {
 *     "structure": 7,
 *     "clarity": 8,
 *     "insight": 5,
 *     "communication": 7,
 *     "leadership": 6,
 *     "overall": 6.6
 *   },
 *   "strengths": [
 *     {
 *       "dimension": "clarity",
 *       "text": "Excellent use of concrete examples",
 *       "evidence_quote": "Based on Q3 retention data showing 40% churn..."
 *     }
 *   ],
 *   "improvements": [
 *     {
 *       "dimension": "insight",
 *       "text": "Missing quantitative impact analysis",
 *       "example": "Could have estimated CAC reduction: 20% improvement = $50K savings"
 *     }
 *   ],
 *   "drills": [
 *     {
 *       "title": "Metric-First Thinking",
 *       "description": "Practice leading with numbers in every answer",
 *       "tips": ["Start with baseline metric", "Estimate impact range", "Tie to business goal"]
 *     }
 *   ],
 *   "summary": "Strong communication and structure. Focus on quantifying impact with metrics."
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSessionOwnedByUser } from "@/lib/db/sessions";
import {
  evaluateSession,
  saveEvaluation,
  getExistingEvaluation,
} from "@/lib/evaluation/rubric-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    // 1. Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;

    // 2. Verify user owns the session
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 403 }
      );
    }

    // 3. Check if evaluation already exists (idempotent)
    const existingEval = await getExistingEvaluation(sessionId);
    if (existingEval) {
      return NextResponse.json(existingEval, { status: 200 });
    }

    // 4. Generate new evaluation using rubric engine
    const evaluation = await evaluateSession(sessionId);

    // 5. Save evaluation to database
    await saveEvaluation(evaluation);

    // 6. Return evaluation response
    return NextResponse.json(evaluation, { status: 200 });
  } catch (error) {
    console.error("Error evaluating session:", error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes("Session not found")) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      if (error.message.includes("empty transcript")) {
        return NextResponse.json(
          { error: "Cannot evaluate session with empty transcript" },
          { status: 400 }
        );
      }
    }

    // Generic error response
    return NextResponse.json(
      {
        error: "Failed to evaluate session",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
