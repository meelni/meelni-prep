import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getLiveKitEnvironment: vi.fn(),
  joinInterviewSessionWorkflow: vi.fn(),
  reportOperationalFailure: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/internal/integrations", () => ({
  getLiveKitEnvironment: mocks.getLiveKitEnvironment,
}));

vi.mock("@/lib/workflows/join-interview-session", () => ({
  joinInterviewSessionWorkflow: mocks.joinInterviewSessionWorkflow,
}));

vi.mock("@/lib/operations/operational-events", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/operations/operational-events")
  >()),
  reportOperationalFailure: mocks.reportOperationalFailure,
}));

import { POST } from "../route";

const sessionId = "550e8400-e29b-41d4-a716-446655440000";
const livekitEnv = {
  apiKey: "test-key",
  apiSecret: "test-secret",
  url: "wss://test.livekit.cloud",
};

describe("POST /api/livekit/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLiveKitEnvironment.mockReturnValue({
      ok: true,
      provider: "livekit",
      data: livekitEnv,
    });
  });

  it("rejects unauthenticated token requests before reading session data", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    const response = await POST(createRequest({ sessionId }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.joinInterviewSessionWorkflow).not.toHaveBeenCalled();
  });

  it("passes only the authenticated user and session ID to authorization", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: { id: "authenticated-user", email: "owner@example.com" },
          },
          error: null,
        }),
      },
    });
    mocks.joinInterviewSessionWorkflow.mockResolvedValue({
      ok: true,
      body: {
        token: "signed-token",
        url: livekitEnv.url,
        roomName: "server-owned-room",
      },
    });

    const response = await POST(
      createRequest({
        sessionId,
        roomName: "attacker-room",
        participantName: "attacker",
        metadata: { session_id: "attacker-session" },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.joinInterviewSessionWorkflow).toHaveBeenCalledWith({
      user: { id: "authenticated-user" },
      sessionId,
      env: livekitEnv,
    });
  });

  it("preserves workflow authorization failures", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "authenticated-user", email: null } },
          error: null,
        }),
      },
    });
    mocks.joinInterviewSessionWorkflow.mockResolvedValue({
      ok: false,
      status: 404,
      body: { error: "session_not_found" },
    });

    const response = await POST(createRequest({ sessionId }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "session_not_found" });
  });

  it("returns reconnect rate limits with a Retry-After header", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "authenticated-user", email: null } },
          error: null,
        }),
      },
    });
    mocks.joinInterviewSessionWorkflow.mockResolvedValue({
      ok: false,
      status: 429,
      body: { error: "rate_limit_exceeded" },
      retryAfterSeconds: 42,
    });

    const response = await POST(createRequest({ sessionId }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(await response.json()).toEqual({ error: "rate_limit_exceeded" });
    expect(mocks.reportOperationalFailure).not.toHaveBeenCalled();
  });

  it.each([
    {
      status: 503,
      error: "rate_limit_unavailable",
      errorCode: "livekit_reconnect_rate_limit_unavailable",
      retryable: true,
    },
    {
      status: 503,
      error: "livekit_token_unavailable",
      errorCode: "livekit_token_unavailable",
      retryable: true,
    },
    {
      status: 500,
      error: "livekit_token_unavailable",
      errorCode: "livekit_token_unavailable",
      retryable: false,
    },
  ])(
    "emits a closed operational event for $status $error",
    async ({ status, error, errorCode, retryable }) => {
      mocks.createClient.mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "authenticated-user", email: null } },
            error: null,
          }),
        },
      });
      mocks.joinInterviewSessionWorkflow.mockResolvedValue({
        ok: false,
        status,
        body: { error },
      });

      const response = await POST(createRequest({ sessionId }));

      expect(response.status).toBe(status);
      expect(mocks.reportOperationalFailure).toHaveBeenCalledWith({
        operation: "interview_token",
        errorCode,
        severity: "critical",
        retryable,
        requestId: null,
        correlationId: sessionId,
      });
    }
  );
});

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/livekit/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
