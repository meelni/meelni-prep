import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/workflows/accept-user-interview-end", () => ({
  acceptUserInterviewEndWorkflow: vi.fn(),
}));

import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { acceptUserInterviewEndWorkflow } from "@/lib/workflows/accept-user-interview-end";
import { POST } from "../route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const ENDING_AT = new Date("2026-08-05T20:00:00.000Z");

describe("POST /api/interview/end", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests", async () => {
    mockAuth(null, new Error("expired"));
    const response = await POST(request({ sessionId: SESSION_ID }));
    expect(response.status).toBe(401);
  });

  it("validates the session ID before accepting terminal intent", async () => {
    mockAuth({ id: "user-invalid" });
    const response = await POST(request({ sessionId: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(acceptUserInterviewEndWorkflow).not.toHaveBeenCalled();
  });

  it("returns 202 as soon as durable ending truth is accepted", async () => {
    mockAuth({ id: "user-1" });
    vi.mocked(acceptUserInterviewEndWorkflow).mockResolvedValue(
      acceptedResult("accepted")
    );

    const response = await POST(request({ sessionId: SESSION_ID }));
    await expect(response.json()).resolves.toMatchObject({
      status: "settling",
      delivery: "scheduled",
      session: {
        lifecycleState: "ending",
        terminalReason: "user_end",
        disposition: "accepted",
      },
      nextHref: `/feedback/${SESSION_ID}/loading`,
    });
    expect(response.status).toBe(202);
    expect(acceptUserInterviewEndWorkflow).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      userId: "user-1",
    });
  });

  it("still exits when immediate event delivery is deferred", async () => {
    mockAuth({ id: "user-2" });
    vi.mocked(acceptUserInterviewEndWorkflow).mockResolvedValue({
      ...acceptedResult("already_ending"),
      delivery: "deferred",
    });

    const response = await POST(request({ sessionId: SESSION_ID }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      status: "settling",
      delivery: "deferred",
    });
  });

  it("replays existing terminal truth without scheduling more work", async () => {
    mockAuth({ id: "user-3" });
    vi.mocked(acceptUserInterviewEndWorkflow).mockResolvedValue({
      ok: true,
      disposition: "already_terminal",
      delivery: "not_required",
      session: {
        sessionId: SESSION_ID,
        userId: "user-3",
        lifecycleState: "completed",
        lifecycleVersion: 5,
        terminalReason: "user_end",
        endingAt: ENDING_AT,
        endedAt: new Date("2026-08-05T20:00:04.000Z"),
      },
    });

    const response = await POST(request({ sessionId: SESSION_ID }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "completed",
      delivery: "not_required",
    });
  });

  it("maps an indistinguishable missing or cross-user session to 404", async () => {
    mockAuth({ id: "user-not-found" });
    vi.mocked(acceptUserInterviewEndWorkflow).mockResolvedValue({
      ok: false,
      reason: "not_found",
    });
    const response = await POST(request({ sessionId: SESSION_ID }));
    expect(response.status).toBe(404);
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

function acceptedResult(disposition: "accepted" | "already_ending") {
  return {
    ok: true as const,
    disposition,
    delivery: "scheduled" as const,
    session: {
      sessionId: SESSION_ID,
      userId: "user-1",
      lifecycleState: "ending" as const,
      lifecycleVersion: 4,
      terminalReason: "user_end" as const,
      endingAt: ENDING_AT,
      endedAt: null,
    },
  };
}
