/**
 * LiveKit Token Generation API
 *
 * Generates JWT access tokens for LiveKit rooms, enabling participants to join
 * real-time voice/video sessions. Optionally creates rooms with metadata for
 * agent configuration.
 *
 * @route POST /api/livekit/token
 * @access Public (authentication optional)
 * @note Full authenticated interview credit enforcement happens in /api/session/start.
 * @note This endpoint only issues LiveKit tokens for existing/demo rooms.
 *
 * @request {Object} body - Request payload
 * @request.roomName {string} Required - LiveKit room name to join
 * @request.participantName {string} Required - Display name for the participant
 * @request.metadata {Object} Optional - Room metadata for agent configuration
 *
 * @response {Object} response - LiveKit credentials
 * @response.token {string} - JWT access token for LiveKit room
 * @response.url {string} - LiveKit server WebSocket URL
 *
 * @throws {400} Bad Request - Missing roomName or participantName
 * @throws {500} Internal Server Error - LiveKit credentials not configured or token generation failed
 *
 * @example
 * // Request
 * POST /api/livekit/token
 * Headers:
 *   Content-Type: application/json
 * Body:
 * {
 *   "roomName": "interview-1699999999-abc123",
 *   "participantName": "John Doe",
 *   "metadata": {
 *     "sessionId": "550e8400-e29b-41d4-a716-446655440000",
 *     "roundType": "product_sense",
 *     "config": {
 *       "voice": "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
 *       "speed": 1.0
 *     }
 *   }
 * }
 *
 * // Response (200 OK)
 * {
 *   "token": "eyJhbGciOiJIUzI1NiIs...",
 *   "url": "wss://mockmate.livekit.cloud"
 * }
 *
 * // Error Response (400 Bad Request)
 * {
 *   "error": "Missing roomName or participantName"
 * }
 *
 * // Error Response (500 Internal Server Error)
 * {
 *   "error": "LiveKit credentials not configured"
 * }
 */

import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { getLiveKitEnvironment } from "@/lib/internal/integrations";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomName, participantName, metadata } = body;

    if (!roomName || !participantName) {
      return NextResponse.json(
        { error: "Missing roomName or participantName" },
        { status: 400 }
      );
    }

    const livekitEnv = getLiveKitEnvironment(process.env);
    if (!livekitEnv.ok) {
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 }
      );
    }

    // Create room with metadata (agent will auto-dispatch)
    if (metadata) {
      // Validate metadata size and structure
      const metadataStr = JSON.stringify(metadata);
      if (metadataStr.length > 10000) {
        // 10KB limit
        return NextResponse.json(
          { error: "Metadata too large (max 10KB)" },
          { status: 400 }
        );
      }

      // Validate metadata keys (allowlist approach)
      const allowedKeys = [
        "sessionId",
        "roundType",
        "config",
        "question",
        "difficulty",
        "mode",
      ];
      const hasInvalidKeys = Object.keys(metadata).some(
        (key) => !allowedKeys.includes(key)
      );
      if (hasInvalidKeys) {
        return NextResponse.json(
          {
            error:
              "Invalid metadata keys. Allowed: sessionId, roundType, config, question, difficulty, mode",
          },
          { status: 400 }
        );
      }

      const roomClient = new RoomServiceClient(
        livekitEnv.data.url,
        livekitEnv.data.apiKey,
        livekitEnv.data.apiSecret
      );

      try {
        await roomClient.createRoom({
          name: roomName,
          metadata: metadataStr,
        });

        console.log("Room created with metadata");
      } catch (error) {
        const message = getErrorMessage(error);
        if (message.includes("already exists")) {
          console.log("Room already exists, updating metadata");
          await roomClient.updateRoomMetadata(roomName, metadataStr);
        } else {
          console.error("Room creation error:", message);
        }
      }
    }

    // Generate participant token
    const at = new AccessToken(
      livekitEnv.data.apiKey,
      livekitEnv.data.apiSecret,
      {
        identity: participantName,
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
    });
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
