import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLiveKitEnvironment: vi.fn(),
  receiveLiveKitParticipantWebhook: vi.fn(),
  handleLiveKitInterviewEventWorkflow: vi.fn(),
}));

vi.mock("@/lib/internal/integrations", () => ({
  getLiveKitEnvironment: mocks.getLiveKitEnvironment,
  receiveLiveKitParticipantWebhook: mocks.receiveLiveKitParticipantWebhook,
}));
vi.mock("@/lib/workflows/handle-livekit-interview-event", () => ({
  handleLiveKitInterviewEventWorkflow:
    mocks.handleLiveKitInterviewEventWorkflow,
}));

import { POST } from "./route";

describe("POST /api/webhooks/livekit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLiveKitEnvironment.mockReturnValue({
      ok: true,
      data: { apiKey: "key", apiSecret: "secret", url: "wss://test" },
    });
  });

  it("rejects a declared oversized body before signature verification", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/livekit", {
        method: "POST",
        body: "{}",
        headers: { "content-length": String(65 * 1024) },
      })
    );

    expect(response.status).toBe(413);
    expect(mocks.receiveLiveKitParticipantWebhook).not.toHaveBeenCalled();
  });

  it("cancels a chunked body as soon as the byte cap is crossed", async () => {
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        controller.enqueue(new Uint8Array(40 * 1024));
      },
    });
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/livekit", {
        method: "POST",
        body,
        duplex: "half",
      } as never)
    );

    expect(response.status).toBe(413);
    expect(reads).toBe(2);
    expect(mocks.receiveLiveKitParticipantWebhook).not.toHaveBeenCalled();
  });

  it("fails closed when the body stream aborts", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("private webhook body"));
        controller.error(new Error("aborted body"));
      },
    });
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/livekit", {
        method: "POST",
        body,
        duplex: "half",
      } as never)
    );

    expect(response.status).toBe(400);
    expect(mocks.receiveLiveKitParticipantWebhook).not.toHaveBeenCalled();
  });
});
