/**
 * Demo Token Generation API
 *
 * Generates LiveKit access tokens specifically for 60-second demo conversations
 * on the landing page. Creates ephemeral rooms that auto-delete after 2 minutes
 * and dispatches a Cloud-hosted demo agent to conduct a brief product demo.
 *
 * @route POST /api/livekit/demo-token
 * @access Public (no authentication required - for landing page demo)
 *
 * @request {Object} body - Request payload
 * @request.participantName {string} Required - Display name for the participant (e.g., "Guest")
 *
 * @response {Object} response - Demo session credentials
 * @response.token {string} - JWT access token for LiveKit room (expires in 2 minutes)
 * @response.url {string} - LiveKit server WebSocket URL
 * @response.roomName {string} - Generated demo room name (format: demo-{timestamp}-{random})
 *
 * @throws {400} Bad Request - Missing participantName
 * @throws {500} Internal Server Error - LiveKit credentials not configured, room creation failed, or agent dispatch failed
 *
 * @implementation_details
 * - Room naming: demo-{timestamp}-{random} for tracking and analytics
 * - Room lifetime: Auto-deletes 2 minutes after last participant leaves (emptyTimeout)
 * - Departure timeout: 10 seconds grace period for re-join
 * - Max participants: 2 (user + demo agent only)
 * - Session duration: Controlled by token TTL (2 min) + agent behavior (60s demo)
 * - Agent: Cloud-hosted demo agent configured by LIVEKIT_DEMO_AGENT_NAME
 * - Agent behavior: 60-second product demo with one quick question and feedback
 * - Token TTL: 2 minutes (matches demo duration)
 *
 * @example
 * // Request
 * POST /api/livekit/demo-token
 * Headers:
 *   Content-Type: application/json
 * Body:
 * {
 *   "participantName": "Guest"
 * }
 *
 * // Response (200 OK)
 * {
 *   "token": "eyJhbGciOiJIUzI1NiIs...",
 *   "url": "wss://meelni-ek4vaisp.livekit.cloud",
 *   "roomName": "demo-1699999999999-abc123"
 * }
 *
 * // Error Response (400 Bad Request)
 * {
 *   "error": "Missing participantName"
 * }
 *
 * // Error Response (500 Internal Server Error)
 * {
 *   "error": "Failed to generate demo token"
 * }
 *
 * @see /agent/demo_agent.py for Cloud agent implementation
 * @see /components/demo-modal.tsx for frontend demo UI
 */

import {
  AccessToken,
  RoomServiceClient,
  AgentDispatchClient,
} from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import {
  getLiveKitAgentName,
  getLiveKitEnvironment,
} from "@/lib/internal/integrations";
import { resolveReactivationAccess } from "@/lib/feature-flags/reactivation-access";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";

export async function POST(req: NextRequest) {
  try {
    const gateName = FEATURE_GATES.meelniReactivationAccess;
    const access = await resolveReactivationAccess({
      user: null,
      localOverride: req.cookies.get(
        `meelni_feature_flag_${encodeURIComponent(gateName)}`
      )?.value,
    });
    if (!access.value) {
      return NextResponse.json(
        {
          error: "interview_practice_unavailable",
          message: "Interview practice is not open yet.",
          retryable: false,
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { participantName } = body;

    if (!participantName) {
      return NextResponse.json(
        { error: "Missing participantName" },
        { status: 400 }
      );
    }

    const livekitEnv = getLiveKitEnvironment(process.env);
    const demoAgentName = getLiveKitAgentName("demo", process.env);
    const interviewAgentName = getLiveKitAgentName("interview", process.env);

    if (!livekitEnv.ok) {
      console.error(
        "LiveKit demo configuration error:",
        livekitEnv.error.message
      );
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 }
      );
    }

    if (
      !demoAgentName.ok ||
      !interviewAgentName.ok ||
      demoAgentName.data === interviewAgentName.data
    ) {
      console.error(
        "LiveKit demo configuration error: a distinct demo dispatch is required"
      );
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 }
      );
    }

    // Generate unique demo room name
    // Format: demo-{timestamp}-{random}
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const roomName = `demo-${timestamp}-${random}`;

    // Demo metadata - including agent dispatch request
    const metadata = {
      type: "demo",
      duration: "60s",
      created_at: new Date().toISOString(),
      agent_type: "demo",
    };

    // Create demo room with metadata
    const roomClient = new RoomServiceClient(
      livekitEnv.data.url,
      livekitEnv.data.apiKey,
      livekitEnv.data.apiSecret
    );

    try {
      // Create room with agent dispatch enabled
      // Note: LiveKit doesn't support maxSessionDuration at room level.
      // Session duration is controlled by token TTL (2 min) and emptyTimeout (2 min).
      // The demo agent is programmed to end conversations at 60 seconds.
      await roomClient.createRoom({
        name: roomName,
        metadata: JSON.stringify(metadata),
        emptyTimeout: 120, // Auto-delete room 2 minutes after last participant leaves
        departureTimeout: 10, // Grace period for re-join: 10 seconds
        maxParticipants: 2, // Only user + agent
      });

      console.log(`Demo room created: ${roomName}`);

      // Dispatch the LiveKit Cloud demo agent to this room
      try {
        // Use AgentDispatchClient from SDK
        const dispatchClient = new AgentDispatchClient(
          livekitEnv.data.url,
          livekitEnv.data.apiKey,
          livekitEnv.data.apiSecret
        );

        const dispatch = await dispatchClient.createDispatch(
          roomName,
          demoAgentName.data
        );
        console.log(
          `Demo agent (${demoAgentName.data}) dispatched to room: ${roomName}`,
          dispatch
        );
      } catch (dispatchError) {
        console.error("Agent dispatch error:", getErrorMessage(dispatchError));
        return NextResponse.json(
          { error: "Failed to dispatch demo agent" },
          { status: 503 }
        );
      }
    } catch (error) {
      console.error("Demo room creation error:", getErrorMessage(error));
      return NextResponse.json(
        { error: "Failed to create demo room" },
        { status: 503 }
      );
    }

    // Generate participant token
    const at = new AccessToken(
      livekitEnv.data.apiKey,
      livekitEnv.data.apiSecret,
      {
        identity: participantName,
        ttl: "2m", // Token expires in 2 minutes (demo duration)
      }
    );

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url: livekitEnv.data.url,
      roomName, // Return room name for tracking
    });
  } catch (error) {
    console.error("Error generating demo token:", error);
    return NextResponse.json(
      { error: "Failed to generate demo token" },
      { status: 500 }
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
