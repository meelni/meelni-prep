/**
 * Start Interview Session API
 *
 * Creates a new interview session, sets up a LiveKit room, dispatches an AI agent,
 * and returns credentials for the user to join the interview.
 *
 * @route POST /api/session/start
 * @access Protected (requires Supabase Auth JWT)
 * @authentication Bearer token in Authorization header
 *
 * @request {Object} body - Request payload
 * @request.roundType {string} Required - Interview round type. One of: behavioral, product_sense, execution, strategy
 * @request.mode {string} Optional - Interview mode (default: voice_video). One of: voice_video, text
 * @request.role {string} Optional - Canonical candidate role; only "pm" is accepted
 * @request.config {Object} Optional - Client-safe interview preferences
 * @request.config.difficulty {string} Optional - beginner, intermediate, or advanced
 * @request.config.duration {number} Optional - 15, 30, or 45 minutes
 * @request.config.hintMode {string} Optional - off, gentle, or coach
 * @request.config.questionPreference {Object} Optional - Question recency preference
 *
 * @response {Object} response - Session credentials and info
 * @response.sessionId {string} - UUID of created session
 * @response.roomName {string} - LiveKit room name (format: interview-{timestamp}-{random})
 * @response.token {string} - JWT access token for LiveKit room
 * @response.url {string} - LiveKit server WebSocket URL
 * @response.deadlineAt {string} - Server-derived absolute UTC interview deadline
 * @response.config {Object} - Validated client-safe preferences; runtime provider settings are never returned
 * @response.question {Object|null} - Selected question snapshot when present
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {402} Payment Required - No interview credits remaining
 * @throws {400} Bad Request - Missing roundType or invalid roundType value
 * @throws {503} Service Unavailable - Unable to verify credits or start LiveKit room
 * @throws {500} Internal Server Error - Database error, LiveKit configuration error, or agent dispatch failure
 *
 * @example
 * // Request
 * POST /api/session/start
 * Headers:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 *   Content-Type: application/json
 * Body:
 * {
 *   "roundType": "product_sense",
 *   "role": "pm",
 *   "config": {
 *     "difficulty": "intermediate",
 *     "duration": 45,
 *     "hintMode": "off",
 *     "questionPreference": {
 *       "recency": "very_recent",
 *       "recentDays": 365
 *     }
 *   }
 * }
 *
 * // Response (200 OK)
 * {
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *   "roomName": "interview-1699999999999-abc123",
 *   "token": "eyJhbGciOiJIUzI1NiIs...",
 *   "url": "wss://meelni-ek4vaisp.livekit.cloud",
 *   "deadlineAt": "2026-07-11T20:30:00.000Z",
 *   "config": {
 *     "difficulty": "intermediate",
 *     "duration": 45,
 *     "hintMode": "off",
 *     "questionPreference": {
 *       "recency": "very_recent",
 *       "recentDays": 365
 *     }
 *   },
 *   "question": null
 * }
 *
 * // Error Response (400 Bad Request)
 * {
 *   "error": "roundType is required"
 * }
 *
 * // Error Response (401 Unauthorized)
 * {
 *   "error": "Unauthorized"
 * }
 *
 * // Error Response (402 Payment Required - No Credits)
 * {
 *   "error": "no_credits_remaining",
 *   "message": "You need an interview credit to start a full interview.",
 *   "upgradeUrl": "/pricing"
 * }
 *
 * // Error Response (503 Service Unavailable)
 * {
 *   "error": "service_unavailable",
 *   "message": "Unable to verify interview credits. Please try again in a moment."
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getLiveKitAgentName,
  getLiveKitEnvironment,
} from "@/lib/internal/integrations";
import { startInterviewSessionWorkflow } from "@/lib/workflows/start-session";

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

    // Parse request body first to access roundType
    const body = await req.json();
    // Validate required environment variables
    const livekitEnv = getLiveKitEnvironment(process.env);
    if (!livekitEnv.ok) {
      console.error(
        "Missing LiveKit environment variables:",
        livekitEnv.error.message
      );
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const interviewAgentName = getLiveKitAgentName("interview", process.env);
    if (!interviewAgentName.ok) {
      console.error(
        "Missing LiveKit interview agent name:",
        interviewAgentName.error.message
      );
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const result = await startInterviewSessionWorkflow({
      user: {
        id: user.id,
        email: user.email,
        metadata: user.user_metadata,
      },
      body,
      env: livekitEnv.data,
      interviewAgentName: interviewAgentName.data,
      appBaseUrl: process.env.NEXT_PUBLIC_APP_URL || "",
    });

    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json(result.body);
  } catch (error) {
    console.error("Error starting session:", error);
    return NextResponse.json(
      { error: "Failed to start session" },
      { status: 500 }
    );
  }
}
