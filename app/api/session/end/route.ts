/**
 * End Interview Session API
 *
 * Marks an interview session as completed by setting the endedAt timestamp.
 * User must own the session to end it.
 *
 * @route POST /api/session/end
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @request {Object} body - Request payload
 * @request.sessionId {string} Required - UUID of the session to end
 *
 * @response {Object} response - Success confirmation and updated session
 * @response.success {boolean} - Always true on success
 * @response.session {Object} - Updated session object with endedAt timestamp
 * @response.message {string} Optional - Informational message (e.g., if session was already ended)
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {400} Bad Request - Missing sessionId
 * @throws {403} Forbidden - User does not own this session
 * @throws {500} Internal Server Error - Database error
 *
 * @example
 * // Request
 * POST /api/session/end
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *   Content-Type: application/json
 * Body:
 * {
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000"
 * }
 *
 * // Response (200 OK)
 * {
 *   "success": true,
 *   "session": {
 *     "id": "550e8400-e29b-41d4-a716-446655440000",
 *     "userId": "user-123",
 *     "roundType": "product_sense",
 *     "startedAt": "2025-11-05T10:30:00Z",
 *     "endedAt": "2025-11-05T11:15:00Z",
 *     ...
 *   }
 * }
 *
 * // Response (200 OK - Already Ended)
 * {
 *   "success": true,
 *   "session": { ... },
 *   "message": "Session was already ended"
 * }
 *
 * // Error Response (403 Forbidden)
 * {
 *   "error": "Session not found or access denied"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { endSession, isSessionOwnedByUser, getSessionById } from "@/lib/db/sessions";

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

    // Check if session is already ended
    const session = await getSessionById(sessionId);
    if (session?.endedAt) {
      return NextResponse.json({
        success: true,
        session,
        message: "Session was already ended",
      });
    }

    // End the session
    const updatedSession = await endSession(sessionId);

    return NextResponse.json({
      success: true,
      session: updatedSession,
    });
  } catch (error) {
    console.error("Error ending session:", error);
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    );
  }
}
