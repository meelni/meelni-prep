import { NextRequest, NextResponse } from "next/server";

import {
  getLiveKitEnvironment,
  receiveLiveKitParticipantWebhook,
} from "@/lib/internal/integrations";
import { handleLiveKitInterviewEventWorkflow } from "@/lib/workflows/handle-livekit-interview-event";

const MAX_LIVEKIT_WEBHOOK_BODY_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
  const env = getLiveKitEnvironment(process.env);
  if (!env.ok) {
    console.error("LiveKit webhook configuration error", env.error.code);
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const contentLength = req.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) > MAX_LIVEKIT_WEBHOOK_BODY_BYTES)
  ) {
    return NextResponse.json({ error: "Webhook too large" }, { status: 413 });
  }
  const body = await readBoundedWebhookBody(req);
  if (!body.ok) {
    return NextResponse.json(
      {
        error:
          body.reason === "too_large" ? "Webhook too large" : "Invalid webhook",
      },
      { status: body.reason === "too_large" ? 413 : 400 }
    );
  }

  const received = await receiveLiveKitParticipantWebhook({
    body: body.value,
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

async function readBoundedWebhookBody(
  req: NextRequest
): Promise<
  | { ok: true; value: string }
  | { ok: false; reason: "too_large" | "unreadable" }
> {
  if (!req.body) return { ok: true, value: "" };
  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_LIVEKIT_WEBHOOK_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(Buffer.from(value));
    }
    return { ok: true, value: Buffer.concat(chunks).toString("utf8") };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }
}
