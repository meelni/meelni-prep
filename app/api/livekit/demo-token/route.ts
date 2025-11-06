import { AccessToken, RoomServiceClient, AgentDispatchClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

/**
 * Demo Token API
 * Generates LiveKit access tokens for demo rooms only
 * Demo rooms are ephemeral and auto-expire after 2 minutes
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { participantName } = body;

    if (!participantName) {
      return NextResponse.json(
        { error: "Missing participantName" },
        { status: 400 }
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekit_url = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekit_url) {
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
      // Request specific agent
      lk_agent: {
        agent_name: "CA_bL5fHYqjCTrA",
      },
    };

    // Create demo room with metadata
    const roomClient = new RoomServiceClient(livekit_url, apiKey, apiSecret);

    try {
      // Create room with agent dispatch enabled
      await roomClient.createRoom({
        name: roomName,
        metadata: JSON.stringify(metadata),
        emptyTimeout: 120, // Auto-delete room 2 minutes after last participant leaves
        maxParticipants: 2, // Only user + agent
      });

      console.log(`Demo room created: ${roomName}`);

      // Dispatch the LiveKit Cloud demo agent to this room
      // Agent ID: CA_bL5fHYqjCTrA (deployed to LiveKit Cloud)
      const DEMO_AGENT_ID = "CA_bL5fHYqjCTrA";

      try {
        // Use AgentDispatchClient from SDK
        const dispatchClient = new AgentDispatchClient(livekit_url, apiKey, apiSecret);

        const dispatch = await dispatchClient.createDispatch(roomName, DEMO_AGENT_ID);
        console.log(`Demo agent (${DEMO_AGENT_ID}) dispatched to room: ${roomName}`, dispatch);
      } catch (dispatchError: any) {
        console.error('Agent dispatch error:', dispatchError.message);
      }
    } catch (error: any) {
      console.error("Demo room creation error:", error.message);
      // Continue even if room creation fails - token generation might still work
    }

    // Generate participant token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      ttl: "2m", // Token expires in 2 minutes (demo duration)
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      agent: true, // Enable agent capabilities
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url: livekit_url,
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
