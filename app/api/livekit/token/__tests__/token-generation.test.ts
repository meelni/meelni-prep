import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getLiveKitEnvironment: vi.fn(),
  joinInterviewSessionWorkflow: vi.fn(),
  resolveReactivationAccess: vi.fn(),
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

vi.mock("@/lib/feature-flags/reactivation-access", () => ({
  resolveReactivationAccess: mocks.resolveReactivationAccess,
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
    mocks.resolveReactivationAccess.mockResolvedValue({
      source: "statsig",
      value: true,
    });
  });

  it("rejects token issuance while relaunch access is disabled", async () => {
    const user = {
      id: "authenticated-user",
      email: "owner@example.com",
    };
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user },
          error: null,
        }),
      },
    });
    mocks.resolveReactivationAccess.mockResolvedValue({
      source: "fallback",
      value: false,
    });

    const response = await POST(createRequest({ sessionId }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "interview_practice_unavailable",
      message: "Interview practice is not open for this account yet.",
      retryable: false,
    });
    expect(mocks.resolveReactivationAccess).toHaveBeenCalledWith({
      localOverride: undefined,
    });
    expect(mocks.getLiveKitEnvironment).not.toHaveBeenCalled();
    expect(mocks.joinInterviewSessionWorkflow).not.toHaveBeenCalled();
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
  });

  it("does not duplicate a workflow-owned token failure event", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
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
      status: 503,
      body: { error: "livekit_token_unavailable" },
    });

    try {
      const response = await POST(createRequest({ sessionId }));

      expect(response.status).toBe(503);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("bounds a stalled token workflow and returns a retryable response", async () => {
    vi.useFakeTimers();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "authenticated-user", email: null } },
          error: null,
        }),
      },
    });
    mocks.joinInterviewSessionWorkflow.mockReturnValue(
      new Promise(() => undefined)
    );

    try {
      const responsePromise = POST(createRequest({ sessionId }));
      await vi.advanceTimersByTimeAsync(8_000);
      const response = await responsePromise;

      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("3");
      expect(await response.json()).toEqual({
        error: "interview_token_unavailable",
        retryable: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/livekit/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
