/**
 * Get Session Feedback API
 *
 * Retrieves the AI-generated feedback for a completed interview session.
 * User must own the session to access feedback. Feedback must have been
 * previously generated via POST /api/feedback/generate.
 *
 * @route GET /api/feedback/:sessionId
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @param {string} sessionId - UUID of the session (URL parameter)
 *
 * @response {Object} response - Feedback data
 * @response.feedback {Object} - Complete feedback object
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
 * @response.feedback.drills {Array<string>} - List of practice drill recommendations
 * @response.feedback.summary {string} - Executive summary of performance
 * @response.feedback.createdAt {string} - ISO 8601 timestamp
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {403} Forbidden - User does not own this session
 * @throws {404} Not Found - Feedback not found for this session (hasn't been generated yet)
 * @throws {500} Internal Server Error - Database query failed
 *
 * @example
 * // Request
 * GET /api/feedback/550e8400-e29b-41d4-a716-446655440000
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *
 * // Response (200 OK)
 * {
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
 *       "Clear articulation of product metrics"
 *     ],
 *     "improvements": [
 *       "Could dig deeper into trade-offs",
 *       "Add more quantitative data"
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
 * // Error Response (404 Not Found)
 * {
 *   "error": "Feedback not found for this session"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSessionOwnedByUser } from "@/lib/db/sessions";
import { getFeedbackBySessionId } from "@/lib/db/feedback";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
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

    const { sessionId } = await params;

    // Verify user owns the session
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 403 }
      );
    }

    // Get feedback
    const feedback = await getFeedbackBySessionId(sessionId);

    if (!feedback) {
      return NextResponse.json(
        { error: "Feedback not found for this session" },
        { status: 404 }
      );
    }

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}
