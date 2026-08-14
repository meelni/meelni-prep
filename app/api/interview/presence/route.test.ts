import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/internal/integrations", () => ({
  getLiveKitEnvironment: vi.fn(),
}));
vi.mock("@/lib/workflows/reconcile-owned-interview-presence", () => ({
  reconcileOwnedInterviewPresenceWorkflow: vi.fn(),
}));

import { NextRequest } from "next/server";

import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { createClient } from "@/lib/supabase/server";
import { reconcileOwnedInterviewPresenceWorkflow } from "@/lib/workflows/reconcile-owned-interview-presence";
import { POST } from "./route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const ENV = {
  apiKey: "key",
  apiSecret: "secret",
  url: "wss://test.livekit.cloud",
};

describe("POST /api/interview/presence", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLiveKitEnvironment).mockReturnValue({
      ok: true,
      provider: "livekit",
      data: ENV,
    });
  });

  it("refuses generic Preview before auth, configuration, or reconciliation", async () => {
    stubGenericPreview();

    const response = await POST(request({ sessionId: SESSION_ID }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "voice_unavailable_in_preview",
      retryable: false,
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(getLiveKitEnvironment).not.toHaveBeenCalled();
    expect(reconcileOwnedInterviewPresenceWorkflow).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated and invalid requests before reconciliation", async () => {
    mockAuth(null);
    expect((await POST(request({ sessionId: SESSION_ID }))).status).toBe(401);

    mockAuth({ id: "user-a" });
    expect((await POST(request({ sessionId: "invalid" }))).status).toBe(400);
    expect(reconcileOwnedInterviewPresenceWorkflow).not.toHaveBeenCalled();
  });

  it("returns ready only after provider-verified canonical activation", async () => {
    mockAuth({ id: "user-a" });
    vi.mocked(reconcileOwnedInterviewPresenceWorkflow).mockResolvedValue({
      ok: true,
      disposition: "activated",
    });

    const response = await POST(request({ sessionId: SESSION_ID }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ready: true,
      disposition: "activated",
    });
    expect(reconcileOwnedInterviewPresenceWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        userId: "user-a",
        env: ENV,
        deliveryId: expect.stringMatching(
          new RegExp(`^browser-presence:${SESSION_ID}:`)
        ),
      })
    );
  });

  it("keeps transport-only connections in a waiting state", async () => {
    mockAuth({ id: "user-a" });
    vi.mocked(reconcileOwnedInterviewPresenceWorkflow).mockResolvedValue({
      ok: true,
      disposition: "connecting",
    });

    const response = await POST(request({ sessionId: SESSION_ID }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ready: false,
      disposition: "connecting",
    });
  });

  it("does not report an active candidate ready when the interviewer is absent", async () => {
    mockAuth({ id: "user-a" });
    vi.mocked(reconcileOwnedInterviewPresenceWorkflow).mockResolvedValue({
      ok: true,
      disposition: "agent_absent",
    });

    const response = await POST(request({ sessionId: SESSION_ID }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ready: false,
      disposition: "agent_absent",
    });
  });

  it("reports terminal lifecycle truth as no longer joinable", async () => {
    mockAuth({ id: "user-a" });
    vi.mocked(reconcileOwnedInterviewPresenceWorkflow).mockResolvedValue({
      ok: true,
      disposition: "terminal",
    });

    const response = await POST(request({ sessionId: SESSION_ID }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "session_not_joinable",
    });
  });

  it("reports a reconciled missing runtime as no longer joinable", async () => {
    mockAuth({ id: "user-a" });
    vi.mocked(reconcileOwnedInterviewPresenceWorkflow).mockResolvedValue({
      ok: true,
      disposition: "failed",
    });

    const response = await POST(request({ sessionId: SESSION_ID }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "session_not_joinable",
    });
  });

  it("does not expose cross-user session existence", async () => {
    mockAuth({ id: "user-a" });
    vi.mocked(reconcileOwnedInterviewPresenceWorkflow).mockResolvedValue({
      ok: false,
      disposition: "not_found",
    });

    const response = await POST(request({ sessionId: SESSION_ID }));
    expect(response.status).toBe(404);
  });

  it("returns retryable unavailability before a stalled reconciliation can hold the route", async () => {
    vi.useFakeTimers();
    mockAuth({ id: "user-a" });
    vi.mocked(reconcileOwnedInterviewPresenceWorkflow).mockReturnValue(
      new Promise(() => undefined)
    );

    try {
      const responsePromise = POST(request({ sessionId: SESSION_ID }));
      await vi.advanceTimersByTimeAsync(3_000);
      const response = await responsePromise;

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "interview_presence_unavailable",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

function request(body: unknown) {
  return new NextRequest("http://localhost/api/interview/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuth(user: { id: string } | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error("expired"),
      }),
    },
  } as never);
}

function stubGenericPreview() {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", "preview");
}
