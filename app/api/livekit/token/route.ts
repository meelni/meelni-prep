/**
 * LiveKit Token Generation API
 *
 * Generates JWT access tokens for LiveKit rooms, enabling participants to join
 * real-time voice/video sessions. Optionally creates rooms with metadata for
 * agent configuration.
 *
 * @route POST /api/livekit/token
 * @access Public (authentication optional)
 * @note Authenticated users: quota enforcement applied
 * @note Anonymous users: no quota enforcement (demo mode)
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
 * @throws {403} Forbidden - Monthly interview quota exceeded (authenticated users only)
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
 * // Error Response (403 Forbidden - Quota Exceeded)
 * {
 *   "error": "quota_exceeded",
 *   "message": "Monthly interview quota exceeded",
 *   "currentUsage": 3,
 *   "limit": 3,
 *   "upgradeUrl": "/pricing"
 * }
 *
 * // Error Response (500 Internal Server Error)
 * {
 *   "error": "LiveKit credentials not configured"
 * }
 */

import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { incrementUsage } from "@/lib/services/usage-service";

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

    // Check authentication and quota (only for authenticated users)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Authenticated user - atomically check and increment quota
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
        return NextResponse.json(
          {
            error: "service_unavailable",
            message: "Unable to verify interview quota. Please try again in a moment.",
          },
          { status: 503 }
        );
      }
    }
    // else: Anonymous user (demo mode) - skip quota check

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekit_url = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekit_url) {
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
        return NextResponse.json({ error: "Metadata too large (max 10KB)" }, { status: 400 });
      }

      // Validate metadata keys (allowlist approach)
      const allowedKeys = ["sessionId", "roundType", "config", "question", "difficulty", "mode"];
      const hasInvalidKeys = Object.keys(metadata).some((key) => !allowedKeys.includes(key));
      if (hasInvalidKeys) {
        return NextResponse.json(
          { error: "Invalid metadata keys. Allowed: sessionId, roundType, config, question, difficulty, mode" },
          { status: 400 }
        );
      }

      const roomClient = new RoomServiceClient(livekit_url, apiKey, apiSecret);

      try {
        await roomClient.createRoom({
          name: roomName,
          metadata: metadataStr,
        });

        console.log("Room created with metadata");
      } catch (error: any) {
        if (error.message?.includes("already exists")) {
          console.log("Room already exists, updating metadata");
          await roomClient.updateRoomMetadata(roomName, metadataStr);
        } else {
          console.error("Room creation error:", error.message);
        }
      }
    }

    // Generate participant token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      agent: true,  // Enable agent capabilities for this participant
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url: livekit_url,
    });
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
