import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createSession } from "@/lib/db/sessions";
import { AccessToken } from "livekit-server-sdk";

const livekit_api_key = process.env.LIVEKIT_API_KEY;
const livekit_api_secret = process.env.LIVEKIT_API_SECRET;
const livekit_url =
  process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createServerClient();
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
    });
  } catch (error) {
    console.error("Error starting session:", error);
    return NextResponse.json(
      { error: "Failed to start session" },
      { status: 500 }
    );
  }
}
