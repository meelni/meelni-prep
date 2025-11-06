import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

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
      const roomClient = new RoomServiceClient(livekit_url, apiKey, apiSecret);

      try {
        await roomClient.createRoom({
          name: roomName,
          metadata: JSON.stringify(metadata),
        });

        console.log("Room created with metadata");
      } catch (error: any) {
        if (error.message?.includes("already exists")) {
          console.log("Room already exists, updating metadata");
          await roomClient.updateRoomMetadata(roomName, JSON.stringify(metadata));
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
