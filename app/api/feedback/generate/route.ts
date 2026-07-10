/**
 * Generate AI Feedback API
 *
 * Analyzes an interview session transcript and generates comprehensive feedback
 * using GPT-4 Turbo. Includes dimension scores, strengths, improvements, and
 * focused practice recommendations. This endpoint is idempotent - if feedback already
 * exists for the session, it returns success without regenerating.
 *
 * @route POST /api/feedback/generate
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @request {Object} body - Request payload
 * @request.sessionId {string} Required - UUID of the session to evaluate
 *
 * @response {Object} response - Generated feedback
 * @response.success {boolean} - Always true on success
 * @response.feedback {Object} Optional - Feedback object (if newly generated)
 * @response.message {string} Optional - Informational message (if feedback already exists)
 * @response.feedback.id {string} - Feedback UUID
 * @response.feedback.sessionId {string} - Session UUID
 * @response.feedback.structureScore {number} - Structure score (0-10)
 * @response.feedback.clarityScore {number} - Clarity score (0-10)
 * @response.feedback.insightScore {number} - Insight score (0-10)
 * @response.feedback.communicationScore {number} - Communication score (0-10)
 * @response.feedback.leadershipScore {number} - Leadership score (0-10)
 * @response.feedback.overallScore {number} - Overall weighted score (0-10)
 * @response.feedback.strengths {Array<string>} - List of strength statements
 * @response.feedback.improvements {Array<string>} - List of improvement suggestions
 * @response.feedback.drills {Array<string>} - List of focused practice recommendations
 * @response.feedback.summary {string} - Executive summary of performance
 * @response.feedback.createdAt {string} - ISO 8601 timestamp
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {400} Bad Request - Missing sessionId or empty transcript
 * @throws {403} Forbidden - User does not own this session
 * @throws {404} Not Found - Session does not exist
 * @throws {500} Internal Server Error - GPT-4 API error or database error
 *
 * @example
 * // Request
 * POST /api/feedback/generate
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *   Content-Type: application/json
 * Body:
 * {
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000"
 * }
 *
 * // Response (200 OK - New Feedback)
 * {
 *   "success": true,
 *   "feedback": {
 *     "id": "feedback-abc123",
 *     "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *     "structureScore": 8,
 *     "clarityScore": 7,
 *     "insightScore": 9,
 *     "communicationScore": 8,
 *     "leadershipScore": 7,
 *     "overallScore": 7.8,
 *     "strengths": [
 *       "Strong use of STAR framework in behavioral responses",
 *       "Clear articulation of product metrics and success criteria"
 *     ],
 *     "improvements": [
 *       "Could dig deeper into trade-offs when discussing prioritization",
 *       "Add more quantitative data to support claims"
 *     ],
 *     "drills": [
 *       "Practice 5-10 product sense questions with timer",
 *       "Record yourself and review for filler words"
 *     ],
 *     "summary": "Solid product sense interview with clear structure...",
 *     "createdAt": "2025-11-05T11:20:00Z"
 *   }
 * }
 *
 * // Response (200 OK - Already Exists)
 * {
 *   "success": true,
 *   "message": "Feedback already exists for this session",
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000"
 * }
 *
 * // Error Response (400 Bad Request)
 * {
 *   "error": "Cannot generate feedback for empty transcript"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionById, isSessionOwnedByUser } from "@/lib/db/sessions";
import { getSessionTranscript } from "@/lib/db/transcripts";
import { createFeedback, feedbackExists } from "@/lib/db/feedback";
import { generateFeedback } from "@/lib/evaluation/scorer";

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { sessionId } = body;

    // Validate required fields
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Verify user owns the session
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 403 }
      );
    }

    // Check if feedback already exists (idempotent)
    const existingFeedback = await feedbackExists(sessionId);
    if (existingFeedback) {
      return NextResponse.json({
        success: true,
        message: "Feedback already exists for this session",
        sessionId,
      });
    }

    // Get session details
    const session = await getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Get transcript
    const transcript = await getSessionTranscript(sessionId);
    if (transcript.length === 0) {
      return NextResponse.json(
        { error: "Cannot generate feedback for empty transcript" },
        { status: 400 }
      );
    }

    // Prepare transcript for evaluation
    const transcriptForEval = transcript.map((turn) => ({
      speaker: turn.speaker,
      text: turn.text || "",
    }));

    // Generate feedback using GPT-4 Turbo
    const evaluation = await generateFeedback(
      session.roundType,
      transcriptForEval
    );

    // Save feedback to database
    const feedbackRecord = await createFeedback({
      sessionId,
      structureScore: evaluation.scores.structure,
      clarityScore: evaluation.scores.clarity,
      insightScore: evaluation.scores.insight,
      communicationScore: evaluation.scores.communication,
      leadershipScore: evaluation.scores.leadership,
      overallScore: evaluation.overall_score,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      drills: evaluation.drills,
      summary: evaluation.summary,
    });

    return NextResponse.json({
      success: true,
      feedback: feedbackRecord,
    });
  } catch (error) {
    console.error("Error generating feedback:", error);
    return NextResponse.json(
      {
        error: "Failed to generate feedback",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
