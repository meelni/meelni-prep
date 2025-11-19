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
import { createSession } from "@/lib/db/sessions";
import { upsertUser } from "@/lib/db/users";
import { getRandomQuestion, getRandomRecentQuestion, recordQuestionUsage } from "@/lib/db/questions";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { incrementUsage } from "@/lib/services/usage-service";
import { getUserTier } from "@/lib/services/permissions-service.server";
import {
  canAccessInterviewType,
  getAllowedInterviewTypes,
  INTERVIEW_TYPE_LABELS,
  type RoundType,
} from "@/lib/services/permissions-service";

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

    // Parse request body first to access roundType
    const body = await req.json();
    const {
      roundType,
      mode = "voice_video",
      role = "pm",
      persona,
      config,
      questionId, // Optional: pre-selected question ID from question bank
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

    // Tier-based access control: Check if user can access this interview type
    try {
      const userTier = await getUserTier(user.id);

      if (!canAccessInterviewType(userTier, roundType as RoundType)) {
        const allowedTypes = getAllowedInterviewTypes(userTier);
        const requestedTypeLabel = INTERVIEW_TYPE_LABELS[roundType as RoundType];

        return NextResponse.json(
          {
            error: "interview_type_locked",
            message: `${requestedTypeLabel} interviews require a Pro subscription. Upgrade to unlock all 4 interview types.`,
            currentTier: userTier,
            requestedType: roundType,
            allowedTypes: allowedTypes,
            upgradeUrl: "/pricing",
          },
          { status: 403 }
        );
      }
    } catch (error: any) {
      console.error("Permissions check error:", error.message);
      // Fail closed: return 503 if permissions service is unavailable
      return NextResponse.json(
        {
          error: "service_unavailable",
          message: "Unable to verify interview type access. Please try again in a moment.",
        },
        { status: 503 }
      );
    }

    // Quota enforcement: Check and increment usage atomically
    // This prevents race conditions and ensures fair usage limits
    try {
      const incrementResult = await incrementUsage(user.id);

      if (!incrementResult.success) {
        // Quota exceeded - return 403 with upgrade information
        return NextResponse.json(
          {
            error: "quota_exceeded",
            message: incrementResult.reason || "Monthly interview quota exceeded",
            currentUsage: incrementResult.currentUsage || 0,
            limit: incrementResult.limit || 0,
            upgradeUrl: "/pricing",
          },
          { status: 403 }
        );
      }
    } catch (error: any) {
      console.error("Quota check error:", error.message);
      // Fail closed: return 503 Service Unavailable if quota service is down
      // This prevents unlimited access if the billing system is unavailable
      return NextResponse.json(
        {
          error: "service_unavailable",
          message: "Unable to verify interview quota. Please try again in a moment.",
        },
        { status: 503 }
      );
    }

    // Validate required environment variables
    if (!livekit_api_key || !livekit_api_secret || !livekit_url) {
      console.error("Missing LiveKit environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Fetch a question from the question bank
    // If questionId is provided, use that specific question
    // Otherwise, fetch a random question for this round type
    let question;

    if (questionId) {
      // Use pre-selected question from question bank
      const { getQuestionById } = await import("@/lib/db/questions");
      question = await getQuestionById(questionId);

      if (!question) {
        return NextResponse.json(
          { error: `Question not found: ${questionId}` },
          { status: 404 }
        );
      }

      console.log(`[Session Start] Using pre-selected question:`, {
        id: question.id,
        type: question.questionType,
        company: question.company,
        text_preview: question.questionText.substring(0, 100) + "...",
      });
    } else {
      // Map interview types to database question types (supports multiple types per interview)
      const QUESTION_TYPE_MAP: Record<string, string[]> = {
        behavioral: ["Behavioral"],
        product_sense: ["Product Sense", "Product design/strategy"],
        execution: ["Execution", "Estimation", "A/B Testing", "Pricing"],
        strategy: ["Product Strategy"],
      };

      const dbQuestionTypes = QUESTION_TYPE_MAP[roundType];
      if (!dbQuestionTypes) {
        return NextResponse.json(
          { error: `Invalid interview type: ${roundType}` },
          { status: 400 }
        );
      }

      // Check if user has question preference (recent questions)
      const recentDays = config?.questionPreference?.recentDays;
      question = recentDays
        ? await getRandomRecentQuestion(recentDays, dbQuestionTypes)
        : await getRandomQuestion(dbQuestionTypes);

      if (!question) {
        const typesList = dbQuestionTypes.join('" or "');
        const errorMsg = `No questions available for interview type "${roundType}" (looks for: "${typesList}")${recentDays ? ` from the last ${recentDays} days` : ''}. Try selecting "All Questions" or a different interview type.`;
        console.warn(`[Session Start] ${errorMsg}`);

        return NextResponse.json(
          { error: errorMsg },
          { status: 404 }
        );
      }

      console.log(`[Session Start] Random question selected:`, {
        id: question.id,
        type: question.questionType,
        company: question.company,
        text_preview: question.questionText.substring(0, 100) + "...",
        user_selected_round_type: roundType,
        mapped_db_types: dbQuestionTypes.join(", "),
        total_available_types: dbQuestionTypes.length,
      });
    }

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
    const INTERVIEW_AGENT_ID = "CA_yawKG67rCMG4"; // Main interview agent with all fixes
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
