import { NextRequest, NextResponse } from "next/server";

import {
  getLiveKitEnvironment,
  receiveLiveKitParticipantWebhook,
} from "@/lib/internal/integrations";
import { handleLiveKitInterviewEventWorkflow } from "@/lib/workflows/handle-livekit-interview-event";

export async function POST(req: NextRequest) {
  const env = getLiveKitEnvironment(process.env);
  if (!env.ok) {
    console.error("LiveKit webhook configuration error", env.error.code);
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const received = await receiveLiveKitParticipantWebhook({
    body: await req.text(),
    authorization: req.headers.get("authorization"),
    env: env.data,
  });
  if (!received.ok) {
    console.warn("LiveKit webhook rejected", received.error.code);
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
  if (!received.data) {
    return NextResponse.json({ received: true, status: "ignored" });
  }

  const result = await handleLiveKitInterviewEventWorkflow(received.data);
  if (!result.ok && result.disposition === "conflict") {
    return NextResponse.json({ error: "Lifecycle conflict" }, { status: 503 });
  }

  return NextResponse.json({
    received: true,
    status: result.disposition,
  });
}
