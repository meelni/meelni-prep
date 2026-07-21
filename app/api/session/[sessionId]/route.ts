/**
 * Get Session Details API
 *
 * Retrieves complete information about a specific interview session including
 * configuration, timing, metadata, and room details. User must own the session to access it.
 *
 * @route GET /api/session/:sessionId
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @param {string} sessionId - UUID of the session to retrieve (URL parameter)
 *
 * @response {Object} response - Session details
 * @response.session {Object} - Complete session object
 * @response.session.id {string} - Session UUID
 * @response.session.userId {string} - Owner's user ID
 * @response.session.role {string} - User's role (e.g., 'pm')
 * @response.session.roundType {string} - Interview type (behavioral | product_sense | execution | strategy)
 * @response.session.mode {string} - Interview mode (voice_video | text)
 * @response.session.startedAt {string} - ISO 8601 timestamp when session started
 * @response.session.deadlineAt {string} - Canonical server-derived absolute deadline
 * @response.session.feedbackReady {boolean} - Whether terminal cleanup permits feedback handoff
 * @response.session.endedAt {string|null} - ISO 8601 timestamp when session ended (null if active)
 * @response.session.livekitRoomName {string|null} - LiveKit room name
 * @response.session.config {Object} - Persisted session configuration snapshot
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {403} Forbidden - User does not own this session
 * @throws {404} Not Found - Session does not exist
 * @throws {409} Conflict - Session has no valid server-owned deadline
 * @throws {500} Internal Server Error - Database query failed
 *
 * @example
 * // Request
 * GET /api/session/550e8400-e29b-41d4-a716-446655440000
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *
 * // Response (200 OK)
 * {
 *   "session": {
 *     "id": "550e8400-e29b-41d4-a716-446655440000",
 *     "userId": "user-123",
 *     "roundType": "product_sense",
 *     "mode": "voice_video",
 *     "role": "pm",
 *     "startedAt": "2025-11-05T10:30:00Z",
 *     "deadlineAt": "2025-11-05T11:15:00Z",
 *     "endedAt": null,
 *     "livekitRoomName": "interview-1699999999-abc123",
 *     "config": {
 *       "voice": "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
 *       "stt_model": "deepgram/nova-3",
 *       "llm_model": "openai/gpt-5",
 *       "tts_model": "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
 *       "speed": 1.0,
 *       "emotion": "Calm"
 *     }
 *   }
 * }
 *
 * // Error Response (403 Forbidden)
 * {
 *   "error": "Session not found or access denied"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionById, isSessionOwnedByUser } from "@/lib/db/sessions";
import { getFeedbackBySessionId } from "@/lib/db/feedback";
import { isFeedbackDispatchReadyForVisibility } from "@/lib/db/feedback-dispatch";
import { isInterviewDeadlineRoomCleanupAcknowledged } from "@/lib/db/session-deadlines";
import {
  attachCanonicalInterviewDeadline,
  InterviewSessionDeadlineUnavailableError,
} from "@/lib/workflows/interview-session-details";

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

    // Get session
    const session = await getSessionById(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    try {
      const feedback = await getFeedbackBySessionId(sessionId);
      return NextResponse.json({
        session: {
          ...attachCanonicalInterviewDeadline(session),
          feedbackReady: Boolean(
            feedback &&
              isInterviewDeadlineRoomCleanupAcknowledged(session) &&
              isFeedbackDispatchReadyForVisibility({
                status: feedback.dispatchStatus,
              })
          ),
        },
      });
    } catch (error) {
      if (error instanceof InterviewSessionDeadlineUnavailableError) {
        return NextResponse.json(
          {
            error: error.code,
            message: "This interview session cannot be resumed safely.",
          },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch {
    console.error("session_read_failed");
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}
