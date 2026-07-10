import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/sessions", () => ({
  getSessionById: vi.fn(),
  isSessionOwnedByUser: vi.fn(),
}));
vi.mock("@/lib/db/feedback", () => ({
  getFeedbackBySessionId: vi.fn(),
}));
vi.mock("@/lib/evaluation/session-validator", () => ({
  validateSessionCompleteness: vi.fn(),
}));
vi.mock("@/lib/workflows/end-interview-session", () => ({
  endInterviewSessionWorkflow: vi.fn(),
}));

import { NextRequest } from "next/server";

import { getFeedbackBySessionId } from "@/lib/db/feedback";
import { getSessionById, isSessionOwnedByUser } from "@/lib/db/sessions";
import { createClient } from "@/lib/supabase/server";
import { validateSessionCompleteness } from "@/lib/evaluation/session-validator";
import { endInterviewSessionWorkflow } from "@/lib/workflows/end-interview-session";
import { GET, POST } from "./route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const PARAMS = { params: Promise.resolve({ sessionId: SESSION_ID }) };

describe("/api/feedback/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth({ id: "user-1" });
    vi.mocked(isSessionOwnedByUser).mockResolvedValue(true);
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "completed",
      terminalReason: "user_end",
    } as never);
  });

  it("rejects unauthenticated polling", async () => {
    mockAuth(null, new Error("expired"));
    const response = await GET(request(), PARAMS);
    expect(response.status).toBe(401);
  });

  it("does not reveal a cross-user session", async () => {
    vi.mocked(isSessionOwnedByUser).mockResolvedValue(false);
    const response = await GET(request(), PARAMS);
    expect(response.status).toBe(404);
  });

  it("returns a typed recoverable state for terminal-without-feedback", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(undefined as never);
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "completed",
    } as never);

    const response = await GET(request(), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "missing",
      retryable: true,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("reports failed dispatch as pending and retryable", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({ dispatchStatus: "failed" }) as never
    );

    const response = await GET(request(), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      dispatch: { status: "failed", retryable: true },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps hard-deadline feedback hidden until room cleanup is acknowledged", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "completed",
      terminalReason: "time_limit",
      deadlineRoomCleanupStatus: "pending",
    } as never);
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({ dispatchStatus: "pending" }) as never
    );

    const response = await GET(request(), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "settling",
      retryable: false,
    });
  });

  it("keeps skipped hard-deadline feedback hidden while room cleanup is pending", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "abandoned",
      terminalReason: "insufficient_signal",
      deadlineRoomCleanupStatus: "pending",
    } as never);
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "skipped",
        dispatchStatus: "not_required",
      }) as never
    );

    const response = await GET(request(), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "settling",
      retryable: false,
    });
  });

  it("shows skipped hard-deadline feedback after the persisted cleanup claim is acknowledged", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "abandoned",
      terminalReason: "insufficient_signal",
      deadlineRoomCleanupStatus: "already_absent",
    } as never);
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "skipped",
        dispatchStatus: "not_required",
      }) as never
    );
    vi.mocked(validateSessionCompleteness).mockResolvedValue({
      tier: "insufficient",
      stats: {},
      reasons: ["Insufficient durable interview signal"],
      recommendations: [],
    } as never);

    const response = await GET(request(), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "skipped" });
  });

  it("shows acknowledged hard-deadline dispatch failure as directly retryable", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "completed",
      terminalReason: "time_limit",
      deadlineRoomCleanupStatus: "already_absent",
    } as never);
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({ dispatchStatus: "failed" }) as never
    );

    const response = await GET(request(), PARAMS);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      dispatch: { status: "failed", retryable: true },
    });
  });

  it("offers recovery before a sender claims a pending dispatch", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        dispatchStatus: "pending",
        dispatchClaimedAt: null,
      }) as never
    );
    const response = await GET(request(), PARAMS);
    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      dispatch: { status: "pending", retryable: true },
    });
  });

  it("waits for an active sending lease instead of showing failure", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        dispatchStatus: "sending",
        dispatchClaimedAt: new Date(),
      }) as never
    );
    const response = await GET(request(), PARAMS);
    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      dispatch: { status: "sending", retryable: false },
    });
  });

  it("offers a retry after feedback generation exhausts its attempts", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "failed",
        statusReason: "provider timeout",
        dispatchStatus: "sent",
      }) as never
    );

    const response = await GET(request(), PARAMS);

    await expect(response.json()).resolves.toMatchObject({
      status: "failed",
      retryable: true,
    });
  });

  it("retries the stored event identity without turning dispatch failure into 500", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "completed",
    } as never);
    vi.mocked(endInterviewSessionWorkflow).mockResolvedValue({
      ok: true,
      completion: {
        feedback: feedbackRecord({ dispatchStatus: "failed" }),
      },
      dispatch: {
        ok: false,
        disposition: "failed",
        dispatch: {
          sessionId: SESSION_ID,
          eventId: `feedback/generate.requested:${SESSION_ID}:2`,
          status: "failed",
          attempts: 2,
          claimedAt: new Date("2026-07-09T22:00:00.000Z"),
          dispatchedAt: null,
        },
      },
    } as never);

    const response = await POST(request("POST"), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      dispatch: { status: "failed", retryable: true },
    });
  });

  it("returns a queued state after redispatching failed generation", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "completed",
    } as never);
    vi.mocked(endInterviewSessionWorkflow).mockResolvedValue({
      ok: true,
      completion: {
        feedback: feedbackRecord({
          status: "failed",
          dispatchStatus: "sent",
        }),
      },
      dispatch: {
        ok: true,
        disposition: "sent",
        dispatch: {
          sessionId: SESSION_ID,
          eventId: `feedback/generate.requested:${SESSION_ID}:2`,
          status: "sent",
          attempts: 2,
          claimedAt: new Date("2026-07-09T22:00:00.000Z"),
          dispatchedAt: new Date("2026-07-09T22:00:01.000Z"),
        },
      },
    } as never);

    const response = await POST(request("POST"), PARAMS);

    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      dispatch: { status: "sent", retryable: false },
    });
  });

  it("never turns an active interview into a feedback retry", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "active",
    } as never);
    const response = await POST(request("POST"), PARAMS);
    expect(response.status).toBe(409);
    expect(endInterviewSessionWorkflow).not.toHaveBeenCalled();
  });

  it("cannot manually bypass pending hard-deadline room cleanup", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "completed",
      terminalReason: "time_limit",
      deadlineRoomCleanupStatus: "pending",
    } as never);
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({ dispatchStatus: "pending" }) as never
    );

    const response = await POST(request("POST"), PARAMS);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "deadline_settlement_pending",
    });
    expect(endInterviewSessionWorkflow).not.toHaveBeenCalled();
  });

  it("cannot manually bypass skipped hard-deadline cleanup", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "abandoned",
      terminalReason: "insufficient_signal",
      deadlineRoomCleanupStatus: "pending",
    } as never);
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "skipped",
        dispatchStatus: "not_required",
      }) as never
    );

    const response = await POST(request("POST"), PARAMS);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "deadline_settlement_pending",
    });
    expect(endInterviewSessionWorkflow).not.toHaveBeenCalled();
  });

  it("allows the terminal skipped response after hard-deadline cleanup acknowledgement", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "abandoned",
      terminalReason: "insufficient_signal",
      deadlineRoomCleanupStatus: "already_absent",
    } as never);
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "skipped",
        dispatchStatus: "not_required",
      }) as never
    );
    vi.mocked(endInterviewSessionWorkflow).mockResolvedValue({
      ok: true,
      completion: {
        feedback: feedbackRecord({
          status: "skipped",
          dispatchStatus: "not_required",
        }),
      },
      dispatch: null,
    } as never);

    const response = await POST(request("POST"), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "skipped",
      dispatch: { status: "not_required", retryable: false },
    });
  });

  it("redispatches acknowledged hard-deadline feedback through the normal idempotent path", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "completed",
      terminalReason: "time_limit",
      deadlineRoomCleanupStatus: "deleted",
    } as never);
    vi.mocked(endInterviewSessionWorkflow).mockResolvedValue({
      ok: true,
      completion: {
        feedback: feedbackRecord({ dispatchStatus: "sent" }),
      },
      dispatch: {
        ok: true,
        disposition: "sent",
        dispatch: {
          sessionId: SESSION_ID,
          eventId: `feedback/generate.requested:${SESSION_ID}:2`,
          status: "sent",
          attempts: 2,
          claimedAt: new Date("2026-07-09T22:00:00.000Z"),
          dispatchedAt: new Date("2026-07-09T22:00:01.000Z"),
        },
      },
    } as never);

    const response = await POST(request("POST"), PARAMS);

    expect(response.status).toBe(200);
    expect(endInterviewSessionWorkflow).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      actor: { type: "user", userId: "user-1" },
      requestedTerminalReason: "user_end",
    });
    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      dispatch: { status: "sent", retryable: false },
    });
  });

  it("keeps authenticated completed feedback out of shared caches", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "completed",
        dispatchStatus: "sent",
        dispatchedAt: new Date("2026-07-09T22:00:00.000Z"),
        overallScore: "8.0",
      }) as never
    );
    const response = await GET(request(), PARAMS);
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
  });

  it("returns structured feedback v2 findings and stored versions", async () => {
    const finding = {
      dimension: "insight",
      observation: "The answer selected a concrete segment.",
      transcriptRefs: ["writer:1"],
      evidence: [{ turnRef: "writer:1", quote: "working parents" }],
      nextStep: "Carry the segment through prioritization.",
      rubricVersion: "pm-feedback-rubric.v2",
      confidence: 0.9,
    };
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "completed",
        overallScore: "7.8",
        strengths: [finding],
        improvements: [{ ...finding, dimension: "structure" }],
        schemaVersion: "feedback.v2",
        promptVersion: "feedback.prompt.v2",
        modelVersion: "fixture-model-v1",
        rubricVersion: "pm-feedback-rubric.v2",
        evaluationState: "partial",
      }) as never
    );

    const response = await GET(request(), PARAMS);
    await expect(response.json()).resolves.toMatchObject({
      status: "completed",
      feedback: {
        strengths: [finding],
        schemaVersion: "feedback.v2",
        promptVersion: "feedback.prompt.v2",
        modelVersion: "fixture-model-v1",
        rubricVersion: "pm-feedback-rubric.v2",
        evaluationState: "partial",
      },
    });
  });
});

function request(method = "GET") {
  return new NextRequest(`http://localhost/api/feedback/${SESSION_ID}`, {
    method,
  });
}

function mockAuth(user: { id: string } | null, error: Error | null = null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error }),
    },
  } as never);
}

function feedbackRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "650e8400-e29b-41d4-a716-446655440000",
    sessionId: SESSION_ID,
    status: "pending",
    statusReason: null,
    dispatchStatus: "sent",
    processingStartedAt: null,
    structureScore: null,
    clarityScore: null,
    insightScore: null,
    communicationScore: null,
    leadershipScore: null,
    overallScore: null,
    strengths: [],
    improvements: [],
    drills: [],
    summary: null,
    rubricVersion: "1.0.0",
    createdAt: new Date("2026-07-09T22:00:00.000Z"),
    ...overrides,
  };
}
