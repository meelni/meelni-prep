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
 * @request.role {string} Optional - User's role (default: pm)
 * @request.persona {string} Optional - Custom interviewer persona description
 * @request.config {Object} Optional - Session configuration (voice settings, models, etc.)
 * @request.config.voice {string} Optional - Cartesia voice ID (default: Tessa voice)
 * @request.config.stt_model {string} Optional - Speech-to-Text model (default: deepgram/nova-3)
 * @request.config.llm_model {string} Optional - Language model (default: openai/gpt-5)
 * @request.config.tts_model {string} Optional - Text-to-Speech model with voice
 * @request.config.speed {number} Optional - Voice speed multiplier (0.6-1.5)
 * @request.config.emotion {string} Optional - Voice emotion (Happy, Calm, Confident, etc.)
 * @request.config.volume {number} Optional - Voice volume multiplier (0.5-2.0)
 *
 * @response {Object} response - Session credentials and info
 * @response.sessionId {string} - UUID of created session
 * @response.roomName {string} - LiveKit room name (format: interview-{timestamp}-{random})
 * @response.token {string} - JWT access token for LiveKit room
 * @response.url {string} - LiveKit server WebSocket URL
 * @response.config {Object} - Session configuration used
 *
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {403} Forbidden - Interview type locked (requires upgrade) or monthly quota exceeded (Free tier: 3/month)
 * @throws {400} Bad Request - Missing roundType or invalid roundType value
 * @throws {503} Service Unavailable - Unable to verify permissions or quota (service down)
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
 *   "persona": "Friendly Google PM interviewer",
 *   "config": {
 *     "voice": "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
 *     "speed": 1.0,
 *     "emotion": "Calm"
 *   }
 * }
 *
 * // Response (200 OK)
 * {
 *   "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *   "roomName": "interview-1699999999999-abc123",
 *   "token": "eyJhbGciOiJIUzI1NiIs...",
 *   "url": "wss://mockmate.livekit.cloud",
 *   "config": {
 *     "voice": "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
 *     "stt_model": "deepgram/nova-3",
 *     "llm_model": "openai/gpt-5",
 *     "tts_model": "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
 *     "speed": 1.0,
 *     "emotion": "Calm"
 *   }
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
 * // Error Response (403 Forbidden - Interview Type Locked)
 * {
 *   "error": "interview_type_locked",
 *   "message": "Execution interviews require a Pro subscription. Upgrade to unlock all 4 interview types.",
 *   "currentTier": "free",
 *   "requestedType": "execution",
 *   "allowedTypes": ["product_sense"],
 *   "upgradeUrl": "/pricing"
 * }
 *
 * // Error Response (403 Forbidden - Quota Exceeded)
 * {
 *   "error": "quota_exceeded",
 *   "message": "Monthly interview quota exceeded",
 *   "currentUsage": 3,
 *   "limit": 3,
 *   "upgradeUrl": "/pricing"
 * }
 *
 * // Error Response (503 Service Unavailable)
 * {
 *   "error": "service_unavailable",
 *   "message": "Unable to verify interview quota. Please try again in a moment."
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLiveKitEnvironment } from "@/lib/internal/integrations";
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

    const result = await startInterviewSessionWorkflow({
      user: {
        id: user.id,
        email: user.email,
        metadata: user.user_metadata,
      },
      body,
      env: livekitEnv.data,
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
