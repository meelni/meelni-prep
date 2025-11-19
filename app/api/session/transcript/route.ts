/**
 * Save Transcript Turns API
 *
 * Saves conversation transcript turns to the database. Supports both single turn
 * and batch insertion for efficient storage during and after interview sessions.
 * User must own the session to save transcripts.
 *
 * @route POST /api/session/transcript
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @request {Object} body - Request payload
 * @request.sessionId {string} Required - UUID of the session
 * @request.speaker {string} Required (single turn) - Speaker identifier (user | interviewer)
 * @request.turns {Array<Object>} Required (batch mode) - Array of turn objects
 * @request.startedAt {string} Optional - ISO 8601 timestamp when turn started
 * @request.endedAt {string} Optional - ISO 8601 timestamp when turn ended
 * @request.text {string} Optional - Transcribed or generated text
 * @request.audioMs {number} Optional - Duration of audio in milliseconds
 * @request.latencyMs {number} Optional - Turn-around latency in milliseconds
 * @request.section {string} Optional - Section/phase of interview
 *
 * @response {Object} response - Success confirmation with saved turn(s)
 * @response.success {boolean} - Always true on success
 * @response.turn {Object} Optional - Single saved turn object (single mode)
 * @response.turns {Array<Object>} Optional - Array of saved turn objects (batch mode)
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {400} Bad Request - Missing sessionId, invalid speaker value
 * @throws {403} Forbidden - User does not own this session
 * @throws {500} Internal Server Error - Database error
 *
 * @example
 * // Request (Single Turn)
 * POST /api/session/transcript
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *   Content-Type: application/json
 * Body:
 * {
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *   "speaker": "user",
 *   "startedAt": "2025-11-05T10:30:15Z",
 *   "endedAt": "2025-11-05T10:31:20Z",
 *   "text": "I worked on a mobile checkout feature...",
 *   "audioMs": 65000,
 *   "section": "response"
 * }
 *
 * // Response (200 OK - Single Turn)
 * {
 *   "success": true,
 *   "turn": {
 *     "id": "turn-abc123",
 *     "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *     "speaker": "user",
 *     "text": "I worked on a mobile checkout feature...",
 *     ...
 *   }
 * }
 *
 * // Request (Batch Mode)
 * POST /api/session/transcript
 * Body:
 * {
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *   "turns": [
 *     {
 *       "speaker": "interviewer",
 *       "text": "Tell me about a product you launched.",
 *       "startedAt": "2025-11-05T10:30:00Z",
 *       "endedAt": "2025-11-05T10:30:08Z"
 *     },
 *     {
 *       "speaker": "user",
 *       "text": "I launched a mobile checkout feature...",
 *       "startedAt": "2025-11-05T10:30:10Z",
 *       "endedAt": "2025-11-05T10:31:15Z"
 *     }
 *   ]
 * }
 *
 * // Response (200 OK - Batch Mode)
 * {
 *   "success": true,
 *   "turns": [
 *     { "id": "turn-1", ... },
 *     { "id": "turn-2", ... }
 *   ]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTranscriptTurn, batchCreateTranscriptTurns } from "@/lib/db/transcripts";
import { isSessionOwnedByUser } from "@/lib/db/sessions";
import { z } from "zod";

// Zod schema for transcript turn validation
const TranscriptTurnSchema = z.object({
  speaker: z.enum(["user", "interviewer"]),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
  text: z.string().max(10000).optional(), // 10KB max per turn
  audioMs: z.number().int().min(0).max(600000).optional(), // Max 10 minutes
  latencyMs: z.number().int().min(0).max(60000).optional(), // Max 1 minute
  section: z.string().max(100).optional(),
});

// Schema for batch mode
const BatchTranscriptSchema = z.object({
  sessionId: z.string().uuid(),
  turns: z.array(TranscriptTurnSchema).min(1).max(1000), // Max 1000 turns per batch
});

// Schema for single turn mode
const SingleTranscriptSchema = z
  .object({
    sessionId: z.string().uuid(),
  })
  .merge(TranscriptTurnSchema);

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

    // Validate with Zod schema
    const isBatchMode = Array.isArray(body.turns);
    const schema = isBatchMode ? BatchTranscriptSchema : SingleTranscriptSchema;
    const validation = schema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          details: validation.error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const validatedData = validation.data;
    const sessionId = validatedData.sessionId;

    // Verify user owns the session
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 403 }
      );
    }

    // Handle batch or single turn
    if (isBatchMode && "turns" in validatedData) {
      // Batch insert for multiple turns
      const createdTurns = await batchCreateTranscriptTurns(
        validatedData.turns.map((turn) => ({
          sessionId,
          speaker: turn.speaker,
          startedAt: turn.startedAt ? new Date(turn.startedAt) : undefined,
          endedAt: turn.endedAt ? new Date(turn.endedAt) : undefined,
          text: turn.text,
          audioMs: turn.audioMs,
          latencyMs: turn.latencyMs,
          section: turn.section,
        }))
      );

      return NextResponse.json({
        success: true,
        turns: createdTurns,
      });
    } else if ("speaker" in validatedData) {
      // Single turn insert
      const { speaker, startedAt, endedAt, text, audioMs, latencyMs, section } = validatedData;

      const turn = await createTranscriptTurn({
        sessionId,
        speaker,
        startedAt: startedAt ? new Date(startedAt) : undefined,
        endedAt: endedAt ? new Date(endedAt) : undefined,
        text,
        audioMs,
        latencyMs,
        section,
      });

      return NextResponse.json({
        success: true,
        turn,
      });
    }
  } catch (error) {
    console.error("Error saving transcript:", error);
    return NextResponse.json(
      { error: "Failed to save transcript" },
      { status: 500 }
    );
  }
}
