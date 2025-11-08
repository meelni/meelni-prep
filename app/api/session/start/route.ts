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
 * @request.config.llm_model {string} Optional - Language model (default: openai/gpt-4.1-mini)
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
 * @throws {400} Bad Request - Missing roundType or invalid roundType value
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
 *     "llm_model": "openai/gpt-4.1-mini",
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
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSession } from "@/lib/db/sessions";
import { upsertUser } from "@/lib/db/users";
import { getRandomQuestion, getRandomRecentQuestion, recordQuestionUsage } from "@/lib/db/questions";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";

const livekit_api_key = process.env.LIVEKIT_API_KEY;
const livekit_api_secret = process.env.LIVEKIT_API_SECRET;
const livekit_url =
  process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;

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

    // Validate required environment variables
    if (!livekit_api_key || !livekit_api_secret || !livekit_url) {
      console.error("Missing LiveKit environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await req.json();
    const {
      roundType,
      mode = "voice_video",
      role = "pm",
      persona,
      config,
    } = body;

    // Validate required fields
    if (!roundType) {
      return NextResponse.json(
        { error: "roundType is required" },
        { status: 400 }
      );
    }

    // Validate roundType
    const validRoundTypes = [
      "behavioral",
      "product_sense",
      "execution",
      "strategy",
    ];
    if (!validRoundTypes.includes(roundType)) {
      return NextResponse.json(
        { error: "Invalid roundType" },
        { status: 400 }
      );
    }

    // Fetch a random question from the question bank for this round type
    const QUESTION_TYPE_MAP: Record<string, string> = {
      behavioral: "Behavioral",
      product_sense: "Product Sense",
      execution: "Execution",
      strategy: "Product Strategy",
    };

    const dbQuestionType = QUESTION_TYPE_MAP[roundType];

    // Check if user has question preference (recent questions)
    const recentDays = config?.questionPreference?.recentDays;
    const question = recentDays
      ? await getRandomRecentQuestion(recentDays, dbQuestionType)
      : await getRandomQuestion(dbQuestionType);

    if (!question) {
      const errorMsg = `No ${dbQuestionType} questions available${recentDays ? ` from the last ${recentDays} days` : ''}. Try selecting "All Questions" or a different interview type.`;
      console.warn(`[Session Start] ${errorMsg}`);

      return NextResponse.json(
        { error: errorMsg },
        { status: 404 }
      );
    }

    // Log question selection for debugging
    console.log(`[Session Start] Question selected:`, {
      id: question.id,
      type: question.questionType,
      company: question.company,
      text_preview: question.questionText.substring(0, 100) + "...",
      user_selected_round_type: roundType,
      mapped_db_type: dbQuestionType,
    });

    // Ensure user exists in app_user table (for existing authenticated users)
    await upsertUser({
      id: user.id,
      email: user.email!,
      name: user.user_metadata?.name || user.user_metadata?.full_name || null,
    });

    // Generate unique room name
    const roomName = `interview-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}`;

    // Create session in database
    const session = await createSession({
      userId: user.id,
      role,
      roundType,
      mode,
      persona,
      livekitRoomName: roomName,
      config: config || {},
    });

    // Record question usage if a question was selected
    if (question) {
      await recordQuestionUsage(session.id, question.id);
    }

    // Create LiveKit room with metadata
    const roomClient = new RoomServiceClient(livekit_url, livekit_api_key, livekit_api_secret);
    try {
      await roomClient.createRoom({
        name: roomName,
        metadata: JSON.stringify({
          session_id: session.id,
          round_type: roundType,
          mode,
          config: config || {},
          question: question ? {
            id: question.id,
            text: question.questionText,
            company: question.company,
            type: question.questionType,
            askedAt: question.askedAt,
          } : null,
        }),
        emptyTimeout: 3600, // Room auto-deletes 1 hour after last participant
        maxParticipants: 2, // User + agent only
      });
    } catch (error: any) {
      if (!error.message?.includes("already exists")) {
        console.error("Room creation error:", error.message);
      }
    }

    // Dispatch Cloud agent to the room
    const INTERVIEW_AGENT_ID = "CA_yawKG67rCMG4";
    const dispatchClient = new AgentDispatchClient(livekit_url, livekit_api_key, livekit_api_secret);
    try {
      await dispatchClient.createDispatch(roomName, INTERVIEW_AGENT_ID);
      console.log(`Dispatched agent ${INTERVIEW_AGENT_ID} to room ${roomName}`);
    } catch (error) {
      console.error("Agent dispatch error:", error);
      // Continue anyway - user can still join, agent might auto-join
    }

    // Generate LiveKit access token
    const at = new AccessToken(livekit_api_key, livekit_api_secret, {
      identity: user.id,
      name: user.email || user.id,
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    // Return session info and LiveKit credentials
    return NextResponse.json({
      sessionId: session.id,
      roomName,
      token,
      url: livekit_url,
      config: session.config,
      question: question ? {
        id: question.id,
        text: question.questionText,
        company: question.company,
      } : null,
    });
  } catch (error) {
    console.error("Error starting session:", error);
    return NextResponse.json(
      { error: "Failed to start session" },
      { status: 500 }
    );
  }
}
