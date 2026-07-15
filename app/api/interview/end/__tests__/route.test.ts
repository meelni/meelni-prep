import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/workflows/end-interview-session", () => ({
  endInterviewSessionWorkflow: vi.fn(),
}));
vi.mock("@/lib/workflows/cleanup-interview-room", () => ({
  cleanupInterviewRoomWorkflow: vi.fn(),
}));
vi.mock("@/lib/internal/integrations", () => ({
  getLiveKitEnvironment: vi.fn(),
}));

import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { endInterviewSessionWorkflow } from "@/lib/workflows/end-interview-session";
import { cleanupInterviewRoomWorkflow } from "@/lib/workflows/cleanup-interview-room";
import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { POST } from "../route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("POST /api/interview/end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLiveKitEnvironment).mockReturnValue({
      ok: true,
      provider: "livekit",
      data: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    });
    vi.mocked(cleanupInterviewRoomWorkflow).mockResolvedValue({
      ok: true,
      disposition: "cleaned",
      room: {
        roomName: "interview-room",
        disposition: "deleted",
      },
    });
  });

  it("rejects unauthenticated requests", async () => {
    mockAuth(null, new Error("expired"));
    const response = await POST(request({ sessionId: SESSION_ID }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized",
    });
  });

  it("validates the session ID before invoking the workflow", async () => {
    mockAuth({ id: "user-invalid" });
    const response = await POST(request({ sessionId: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(endInterviewSessionWorkflow).not.toHaveBeenCalled();
  });

  it("returns stored terminal truth when dispatch remains retryable", async () => {
    mockAuth({ id: "user-dispatch-failure" });
    vi.mocked(endInterviewSessionWorkflow).mockResolvedValue(
      completionResult({ dispatchStatus: "failed", dispatchOk: false }) as never
    );

    const response = await POST(request({ sessionId: SESSION_ID }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "pending_dispatch",
      session: {
        lifecycleState: "completed",
        terminalReason: "user_end",
      },
      feedback: {
        status: "pending",
        dispatchStatus: "failed",
        retryable: true,
      },
      nextHref: `/feedback/${SESSION_ID}/loading`,
    });
  });

  it("maps an indistinguishable missing or cross-user session to 404", async () => {
    mockAuth({ id: "user-not-found" });
    vi.mocked(endInterviewSessionWorkflow).mockResolvedValue({
      ok: false,
      reason: "not_found",
    });
    const response = await POST(request({ sessionId: SESSION_ID }));
    expect(response.status).toBe(404);
  });

  it("returns a non-2xx error only when completion was not confirmed", async () => {
    mockAuth({ id: "user-storage-failure" });
    vi.mocked(endInterviewSessionWorkflow).mockRejectedValue(
      new Error("database unavailable")
    );
    const response = await POST(request({ sessionId: SESSION_ID }));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      error: "session_end_failed",
    });
  });

  it("delegates completion side effects to the shared workflow", async () => {
    mockAuth({ id: "user-motivation" });
    vi.mocked(endInterviewSessionWorkflow).mockResolvedValue(
      completionResult({ dispatchStatus: "sent", dispatchOk: true }) as never
    );
    const response = await POST(request({ sessionId: SESSION_ID }));

    expect(response.status).toBe(200);
    expect(endInterviewSessionWorkflow).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      actor: { type: "user", userId: "user-motivation" },
      requestedTerminalReason: "user_end",
    });
    expect(cleanupInterviewRoomWorkflow).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    });
  });

  it("returns committed terminal truth when room cleanup is deferred", async () => {
    mockAuth({ id: "user-cleanup-retry" });
    vi.mocked(endInterviewSessionWorkflow).mockResolvedValue(
      completionResult({ dispatchStatus: "sent", dispatchOk: true }) as never
    );
    vi.mocked(cleanupInterviewRoomWorkflow).mockRejectedValue(
      new Error("provider unavailable")
    );

    const response = await POST(request({ sessionId: SESSION_ID }));

    expect(response.status).toBe(200);
    expect(cleanupInterviewRoomWorkflow).toHaveBeenCalledOnce();
  });
});

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/interview/end", {
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

function completionResult(input: {
  dispatchStatus: "sent" | "failed";
  dispatchOk: boolean;
}) {
  const dispatch = {
    sessionId: SESSION_ID,
    eventId: `feedback/generate.requested:${SESSION_ID}:1`,
    status: input.dispatchStatus,
    attempts: 1,
    claimedAt: new Date("2026-07-09T22:00:00.000Z"),
    dispatchedAt: null,
  };
  return {
    ok: true,
    completion: {
      ok: true,
      disposition: "applied",
      roomName: "interview-room",
      lifecycle: {
        state: "completed",
        version: 3,
        terminalReason: "user_end",
        endedAt: new Date("2026-07-09T22:00:00.000Z"),
      },
      feedback: {
        id: "650e8400-e29b-41d4-a716-446655440000",
        status: "pending",
        dispatchStatus: input.dispatchStatus,
        statusReason: null,
      },
      tier: "full",
      stats: {
        totalTurns: 20,
        userTurns: 10,
        totalWords: 800,
        durationSeconds: 1200,
        substantiveResponses: 8,
      },
      recommendations: [],
    },
    dispatch: {
      ok: input.dispatchOk,
      disposition: input.dispatchOk ? "sent" : "failed",
      dispatch,
    },
  };
}
