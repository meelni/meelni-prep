/**
 * Get Session Transcript API
 *
 * Retrieves the complete conversation transcript for an interview session,
 * including all turns from both user and interviewer in chronological order.
 * User must own the session to access the transcript.
 *
 * @route GET /api/session/:sessionId/transcript
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @param {string} sessionId - UUID of the session (URL parameter)
 *
 * @response {Object} response - Transcript data
 * @response.turns {Array<Object>} - Array of transcript turns in chronological order
 * @response.turns[].id {string} - Turn UUID
 * @response.turns[].sessionId {string} - Session UUID
 * @response.turns[].speaker {string} - Speaker identifier (user | interviewer)
 * @response.turns[].startedAt {string|null} - ISO 8601 timestamp when turn started
 * @response.turns[].endedAt {string|null} - ISO 8601 timestamp when turn ended
 * @response.turns[].text {string|null} - Transcribed or generated text
 * @response.turns[].audioMs {number|null} - Duration of audio in milliseconds
 * @response.turns[].latencyMs {number|null} - Turn-around latency in milliseconds
 * @response.turns[].section {string|null} - Section/phase of interview
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {403} Forbidden - User does not own this session
 * @throws {500} Internal Server Error - Database query failed
 *
 * @example
 * // Request
 * GET /api/session/550e8400-e29b-41d4-a716-446655440000/transcript
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *
 * // Response (200 OK)
 * {
 *   "turns": [
 *     {
 *       "id": "turn-1",
 *       "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *       "speaker": "interviewer",
 *       "startedAt": "2025-11-05T10:30:05Z",
 *       "endedAt": "2025-11-05T10:30:12Z",
 *       "text": "Tell me about a product you recently launched.",
 *       "audioMs": 7000,
 *       "latencyMs": 850,
 *       "section": "opening"
 *     },
 *     {
 *       "id": "turn-2",
 *       "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *       "speaker": "user",
 *       "startedAt": "2025-11-05T10:30:13Z",
 *       "endedAt": "2025-11-05T10:31:45Z",
 *       "text": "I worked on a mobile checkout feature that increased conversion by 15%...",
 *       "audioMs": 92000,
 *       "latencyMs": null,
 *       "section": "response"
 *     }
 *   ]
 * }
 *
 * // Error Response (403 Forbidden)
 * {
 *   "error": "Session not found or access denied"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRetryableSupabaseAuthError } from "@/lib/supabase/auth-error";
import { getSessionTranscript } from "@/lib/db/transcripts";
import { isSessionOwnedByUser } from "@/lib/db/sessions";
import { isRetryableDatabaseContentionError } from "@/lib/db/retryable-error";
import { withInteractiveReadTransaction } from "@/lib/db/interactive-read";
import {
  CUSTOMER_READ_ROUTE_DEADLINE_MS,
  DEPENDENCY_RETRY_AFTER_SECONDS,
  isDeadlineExceededError,
  withDeadline,
} from "@/lib/http/deadline";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};
const RETRYABLE_READ_HEADERS = {
  ...PRIVATE_NO_STORE_HEADERS,
  "Retry-After": String(DEPENDENCY_RETRY_AFTER_SECONDS),
};

function transcriptResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    return await withDeadline(
      "transcript_read",
      (async () => {
        // Verify authentication
        const supabase = await createClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError && isRetryableSupabaseAuthError(authError)) {
          throw authError;
        }
        if (authError || !user) {
          return transcriptResponse({ error: "Unauthorized" }, 401);
        }

        const { sessionId } = await params;

        const transcript = await withInteractiveReadTransaction(
          async (database) => {
            const isOwner = await isSessionOwnedByUser(
              sessionId,
              user.id,
              database
            );
            if (!isOwner) return null;
            return getSessionTranscript(sessionId, database);
          }
        );
        if (transcript === null) {
          return transcriptResponse(
            { error: "Session not found or access denied" },
            403
          );
        }

        return transcriptResponse({ turns: transcript });
      })(),
      CUSTOMER_READ_ROUTE_DEADLINE_MS
    );
  } catch (error) {
    if (
      isDeadlineExceededError(error) ||
      isRetryableDatabaseContentionError(error) ||
      isRetryableSupabaseAuthError(error)
    ) {
      console.warn("Transcript read temporarily unavailable");
      return NextResponse.json(
        { error: "transcript_read_unavailable" },
        { status: 503, headers: RETRYABLE_READ_HEADERS }
      );
    }
    console.error("Transcript read failed");
    return transcriptResponse({ error: "Failed to fetch transcript" }, 500);
  }
}
