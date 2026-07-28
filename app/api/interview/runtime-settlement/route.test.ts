import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/internal/integrations", () => ({
  getLiveKitEnvironment: vi.fn(),
}));
vi.mock("@/lib/workflows/request-user-end-runtime-settlement", () => ({
  requestUserEndRuntimeSettlementWorkflow: vi.fn(),
}));

import { NextRequest } from "next/server";

import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { createClient } from "@/lib/supabase/server";
import { requestUserEndRuntimeSettlementWorkflow } from "@/lib/workflows/request-user-end-runtime-settlement";
import { POST } from "./route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const ENV = {
  apiKey: "key",
  apiSecret: "secret",
  url: "wss://test.livekit.cloud",
};

describe("POST /api/interview/runtime-settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLiveKitEnvironment).mockReturnValue({
      ok: true,
      provider: "livekit",
      data: ENV,
    });
  });

  it("rejects unauthenticated requests", async () => {
    mockAuth(null, new Error("expired"));

    const response = await POST(request({ sessionId: SESSION_ID }));

    expect(response.status).toBe(401);
    expect(requestUserEndRuntimeSettlementWorkflow).not.toHaveBeenCalled();
  });

  it("validates the session ID before provider work", async () => {
    mockAuth({ id: "user-1" });

    const response = await POST(request({ sessionId: "bad" }));

    expect(response.status).toBe(400);
    expect(getLiveKitEnvironment).not.toHaveBeenCalled();
  });

  it("settles the owned session through the server workflow", async () => {
    mockAuth({ id: "user-1" });
    vi.mocked(requestUserEndRuntimeSettlementWorkflow).mockResolvedValue({
      ok: true,
      settlement: {
        settled: true,
        pending: 0,
        failed: 0,
        overflowed: false,
        integrityUnavailable: false,
      },
    });

    const response = await POST(request({ sessionId: SESSION_ID }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      settled: true,
      pending: 0,
      failed: 0,
    });
    expect(requestUserEndRuntimeSettlementWorkflow).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      userId: "user-1",
      env: ENV,
    });
  });

  it("keeps a missing runtime acknowledgement retryable", async () => {
    mockAuth({ id: "user-1" });
    vi.mocked(requestUserEndRuntimeSettlementWorkflow).mockResolvedValue({
      ok: false,
      reason: "runtime_not_ready",
      retryable: true,
    });

    const response = await POST(request({ sessionId: SESSION_ID }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "runtime_not_ready",
    });
  });

  it("does not reveal cross-user session existence", async () => {
    mockAuth({ id: "user-1" });
    vi.mocked(requestUserEndRuntimeSettlementWorkflow).mockResolvedValue({
      ok: false,
      reason: "not_found",
      retryable: false,
    });

    const response = await POST(request({ sessionId: SESSION_ID }));

    expect(response.status).toBe(404);
  });
});

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/interview/runtime-settlement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuth(user: { id: string } | null, error: Error | null = null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error }),
    },
  } as never);
}
