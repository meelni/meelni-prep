import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSession } from "@/lib/db/sessions";
import { upsertUser } from "@/lib/db/users";
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

    // Create LiveKit room with metadata
    const roomClient = new RoomServiceClient(livekit_url, livekit_api_key, livekit_api_secret);
    try {
      await roomClient.createRoom({
        name: roomName,
        metadata: JSON.stringify({
          sessionId: session.id,
          roundType,
          mode,
          config: config || {},
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
    });
  } catch (error) {
    console.error("Error starting session:", error);
    return NextResponse.json(
      { error: "Failed to start session" },
      { status: 500 }
    );
  }
}
