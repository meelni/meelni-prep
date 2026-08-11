import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/sessions", () => ({
  getSessionById: vi.fn(),
  isSessionOwnedByUser: vi.fn(),
}));
vi.mock("@/lib/db/feedback", () => ({
  getFeedbackBySessionId: vi.fn(),
  hasValidFeedbackLifecycleFields: vi.fn((record: Record<string, unknown>) => {
    const statuses = new Set([
      "pending",
      "processing",
      "completed",
      "failed",
      "skipped",
    ]);
    const tiers = new Set([
      null,
      "full",
      "partial",
      "insufficient",
      "abandoned",
    ]);
    const dispatchStatuses = new Set([
      "not_required",
      "pending",
      "sending",
      "sent",
      "failed",
    ]);
    return (
      statuses.has(record.status as string) &&
      tiers.has(record.completionTier as string | null) &&
      dispatchStatuses.has(record.dispatchStatus as string)
    );
  }),
}));
vi.mock("@/lib/db/transcripts", () => ({
  getFeedbackEvidenceTurns: vi.fn(),
}));
vi.mock("@/lib/workflows/recover-feedback-generation", () => ({
  recoverFeedbackGenerationWorkflow: vi.fn(),
}));
vi.mock("@/lib/workflows/accept-user-interview-end", () => ({
  acceptUserInterviewEndWorkflow: vi.fn(),
  userInterviewEndRedeliveryId: vi.fn(() => "feedback-recovery:test-bucket"),
}));
vi.mock("@/lib/db/interactive-read", () => ({
  withInteractiveReadTransaction: vi.fn(
    (work: (database: object) => Promise<unknown>) => work({})
  ),
}));

import { NextRequest } from "next/server";
import {
  EVIDENCE_LIMITED_ACTIONS,
  EVIDENCE_LIMITED_CONFIDENCE,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS,
  EVIDENCE_LIMITED_STRENGTH_SIGNALS,
  EVIDENCE_LIMITED_SUMMARY,
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
} from "@meelni/core";

import { getFeedbackBySessionId } from "@/lib/db/feedback";
import { getSessionById, isSessionOwnedByUser } from "@/lib/db/sessions";
import { getFeedbackEvidenceTurns } from "@/lib/db/transcripts";
import { createClient } from "@/lib/supabase/server";
import { acceptUserInterviewEndWorkflow } from "@/lib/workflows/accept-user-interview-end";
import { recoverFeedbackGenerationWorkflow } from "@/lib/workflows/recover-feedback-generation";
import { GET, POST } from "./route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const PARAMS = { params: Promise.resolve({ sessionId: SESSION_ID }) };

describe("/api/feedback/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth({ id: "user-1" });
    vi.mocked(isSessionOwnedByUser).mockResolvedValue(true);
    vi.mocked(getSessionById).mockResolvedValue({
      userId: "user-1",
      lifecycleState: "completed",
      terminalReason: "user_end",
    } as never);
    vi.mocked(getFeedbackEvidenceTurns).mockResolvedValue([
      {
        eventId: "writer:1",
        speaker: "user",
        text: "I would focus on working parents first.",
        contractVersion: 2,
      },
      {
        eventId: "writer:2",
        speaker: "user",
        text: "First, I would define the goal; first, I would then prioritize.",
        contractVersion: 2,
      },
    ] as never);
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

  it.each(["status", "completionTier", "dispatchStatus"])(
    "fails closed for an invalid %s lifecycle value",
    async (field) => {
      vi.mocked(getFeedbackBySessionId).mockResolvedValue(
        feedbackRecord({ [field]: "unsupported" }) as never
      );

      const response = await GET(request(), PARAMS);

      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({
        error: "Invalid feedback state",
      });
      expect(getFeedbackEvidenceTurns).not.toHaveBeenCalled();
    }
  );

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

  it("keeps ending non-retryable while durable finalization runs", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(undefined as never);
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "ending",
    } as never);

    const response = await GET(request(), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "settling",
      retryable: false,
    });
  });

  it("makes a user-ended session actionable at the terminalization upper bound", async () => {
    const now = new Date("2026-08-08T00:00:30.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(undefined as never);
    vi.mocked(getSessionById).mockResolvedValue({
      userId: "user-1",
      lifecycleState: "ending",
      terminalReason: "user_end",
      endingAt: new Date("2026-08-08T00:00:00.000Z"),
    } as never);

    const response = await GET(request(), PARAMS);

    await expect(response.json()).resolves.toMatchObject({
      status: "settling",
      retryable: true,
      delayed: true,
    });
    nowSpy.mockRestore();
  });

  it("does not expose finalizer recovery before the terminalization upper bound", async () => {
    const now = new Date("2026-08-08T00:00:29.999Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(undefined as never);
    vi.mocked(getSessionById).mockResolvedValue({
      userId: "user-1",
      lifecycleState: "ending",
      terminalReason: "user_end",
      endingAt: new Date("2026-08-08T00:00:00.000Z"),
    } as never);

    const response = await GET(request(), PARAMS);

    await expect(response.json()).resolves.toMatchObject({
      status: "settling",
      retryable: false,
      delayed: false,
    });
    expect(acceptUserInterviewEndWorkflow).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it("redelivers a stale user-end finalizer with a fresh bounded identity", async () => {
    const now = new Date("2026-08-08T00:00:30.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    vi.mocked(getSessionById).mockResolvedValue({
      userId: "user-1",
      lifecycleState: "ending",
      terminalReason: "user_end",
      endingAt: new Date("2026-08-08T00:00:00.000Z"),
    } as never);

    const response = await POST(request("POST"), PARAMS);

    expect(response.status).toBe(200);
    expect(acceptUserInterviewEndWorkflow).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      userId: "user-1",
      deliveryId: "feedback-recovery:test-bucket",
    });
    await expect(response.json()).resolves.toMatchObject({
      status: "settling",
      retryable: true,
      delayed: true,
    });
    expect(recoverFeedbackGenerationWorkflow).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it("keeps missing hard-deadline feedback settling until cleanup is acknowledged", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(undefined as never);
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "ending",
      terminalReason: "time_limit",
      deadlineRoomCleanupStatus: "pending",
    } as never);

    const response = await GET(request(), PARAMS);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "settling",
      retryable: false,
    });
  });

  it("keeps active sessions non-retryable when feedback is missing", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(undefined as never);
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "active",
    } as never);

    const response = await GET(request(), PARAMS);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      status: "session_not_ended",
      retryable: false,
    });
  });

  it("reports failed dispatch as a typed retryable system state", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({ dispatchStatus: "failed" }) as never
    );

    const response = await GET(request(), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "dispatch_failed",
      retryable: true,
      message: "Your interview is saved, but feedback could not be queued.",
      outcomeReason: "dispatch_failed",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("makes an acknowledged queue delivery retryable after 90 seconds", async () => {
    const now = new Date("2026-08-08T00:01:30.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        dispatchedAt: new Date("2026-08-08T00:00:00.000Z"),
        createdAt: new Date("2026-08-08T00:00:00.000Z"),
      }) as never
    );

    const response = await GET(request(), PARAMS);

    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      retryable: true,
      delayed: true,
    });
    nowSpy.mockRestore();
  });

  it("labels 45-second processing as delayed without reopening its active lease", async () => {
    const now = new Date("2026-08-08T00:00:45.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "processing",
        processingStartedAt: new Date("2026-08-08T00:00:00.000Z"),
      }) as never
    );

    const response = await GET(request(), PARAMS);

    await expect(response.json()).resolves.toMatchObject({
      status: "processing",
      retryable: false,
      delayed: true,
    });
    nowSpy.mockRestore();
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
    await expect(response.json()).resolves.toEqual({
      status: "dispatch_failed",
      retryable: true,
      message: "Your interview is saved, but feedback could not be queued.",
      outcomeReason: "dispatch_failed",
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

  it("does not offer pending legacy work a recovery that cannot preserve its tier", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        dispatchStatus: "failed",
        completionTier: null,
      }) as never
    );
    const response = await GET(request(), PARAMS);
    await expect(response.json()).resolves.toEqual({
      status: "dispatch_failed",
      retryable: false,
      message: "Your interview is saved, but feedback could not be queued.",
      outcomeReason: "dispatch_failed",
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

  it("keeps legacy failure without committed completion evidence non-retryable", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "failed",
        statusReason: "provider timeout",
        dispatchStatus: "sent",
        completionTier: null,
      }) as never
    );

    const response = await GET(request(), PARAMS);

    await expect(response.json()).resolves.toMatchObject({
      status: "failed",
      retryable: false,
    });
  });

  it("offers recovery only after the processing lease expires", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "processing",
        processingStartedAt: new Date(Date.now() - 6 * 60 * 1000),
      }) as never
    );
    const staleResponse = await GET(request(), PARAMS);
    await expect(staleResponse.json()).resolves.toMatchObject({
      status: "processing",
      retryable: true,
    });

    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "processing",
        processingStartedAt: new Date(),
      }) as never
    );
    const activeResponse = await GET(request(), PARAMS);
    await expect(activeResponse.json()).resolves.toMatchObject({
      status: "processing",
      retryable: false,
    });
  });

  it("fails closed for a legacy failed row without an event identity", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "failed",
        dispatchEventId: null,
        dispatchStatus: "not_required",
      }) as never
    );

    const response = await GET(request(), PARAMS);
    await expect(response.json()).resolves.toMatchObject({
      status: "failed",
      retryable: false,
    });
  });

  it("returns retryable dispatch failure without turning recovery into 500", async () => {
    vi.mocked(recoverFeedbackGenerationWorkflow).mockResolvedValue({
      ok: true,
      status: "pending",
      disposition: "dispatch_failed",
      retryable: true,
      dispatch: {
        sessionId: SESSION_ID,
        eventId: `feedback/generate.requested:${SESSION_ID}:2`,
        status: "failed",
        attempts: 2,
        claimedAt: new Date("2026-07-09T22:00:00.000Z"),
        dispatchedAt: null,
      },
    } as never);

    const response = await POST(request("POST"), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "dispatch_failed",
      retryable: true,
      message: "Your interview is saved, but feedback could not be queued.",
      outcomeReason: "dispatch_failed",
    });
  });

  it("returns a queued state after redispatching failed generation", async () => {
    vi.mocked(recoverFeedbackGenerationWorkflow).mockResolvedValue({
      ok: true,
      status: "pending",
      disposition: "queued",
      retryable: false,
      dispatch: {
        sessionId: SESSION_ID,
        eventId: `feedback/generate.requested:${SESSION_ID}:2`,
        status: "sent",
        attempts: 2,
        claimedAt: new Date("2026-07-09T22:00:00.000Z"),
        dispatchedAt: new Date("2026-07-09T22:00:01.000Z"),
      },
    } as never);

    const response = await POST(request("POST"), PARAMS);

    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      dispatch: { status: "sent", retryable: false },
    });
  });

  it("never turns an active interview into a feedback retry", async () => {
    vi.mocked(recoverFeedbackGenerationWorkflow).mockResolvedValue({
      ok: false,
      reason: "session_not_ended",
    });
    const response = await POST(request("POST"), PARAMS);
    expect(response.status).toBe(409);
    expect(recoverFeedbackGenerationWorkflow).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      userId: "user-1",
    });
  });

  it("cannot manually bypass pending hard-deadline room cleanup", async () => {
    vi.mocked(recoverFeedbackGenerationWorkflow).mockResolvedValue({
      ok: false,
      reason: "deadline_settlement_pending",
    });

    const response = await POST(request("POST"), PARAMS);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "deadline_settlement_pending",
    });
    expect(recoverFeedbackGenerationWorkflow).toHaveBeenCalledTimes(1);
  });

  it("cannot manually bypass skipped hard-deadline cleanup", async () => {
    vi.mocked(recoverFeedbackGenerationWorkflow).mockResolvedValue({
      ok: false,
      reason: "deadline_settlement_pending",
    });

    const response = await POST(request("POST"), PARAMS);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "deadline_settlement_pending",
    });
    expect(recoverFeedbackGenerationWorkflow).toHaveBeenCalledTimes(1);
  });

  it("allows the terminal skipped response after hard-deadline cleanup acknowledgement", async () => {
    vi.mocked(recoverFeedbackGenerationWorkflow).mockResolvedValue({
      ok: true,
      status: "skipped",
      disposition: "already_terminal",
      retryable: false,
      dispatch: null,
    });

    const response = await POST(request("POST"), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "skipped",
      retryable: false,
      dispatch: null,
    });
  });

  it("redispatches acknowledged hard-deadline feedback through the normal idempotent path", async () => {
    vi.mocked(recoverFeedbackGenerationWorkflow).mockResolvedValue({
      ok: true,
      status: "pending",
      disposition: "queued",
      retryable: false,
      dispatch: {
        sessionId: SESSION_ID,
        eventId: `feedback/generate.requested:${SESSION_ID}:2`,
        status: "sent",
        attempts: 2,
        claimedAt: new Date("2026-07-09T22:00:00.000Z"),
        dispatchedAt: new Date("2026-07-09T22:00:01.000Z"),
      },
    });

    const response = await POST(request("POST"), PARAMS);

    expect(response.status).toBe(200);
    expect(recoverFeedbackGenerationWorkflow).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      userId: "user-1",
    });
    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      dispatch: { status: "sent", retryable: false },
    });
  });

  it("bounds a stalled feedback recovery before the browser deadline", async () => {
    vi.useFakeTimers();
    vi.mocked(recoverFeedbackGenerationWorkflow).mockReturnValue(
      new Promise(() => undefined)
    );

    try {
      const responsePromise = POST(request("POST"), PARAMS);
      await vi.advanceTimersByTimeAsync(5_500);
      const response = await responsePromise;

      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("3");
      await expect(response.json()).resolves.toMatchObject({
        error: "feedback_retry_unavailable",
        retryable: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    Object.assign(new Error("private statement detail"), { code: "57014" }),
    Object.assign(new Error("private auth detail"), {
      name: "AuthRetryableFetchError",
    }),
  ])(
    "returns a private retryable response for a stalled recovery dependency",
    async (failure) => {
      if (failure.name === "AuthRetryableFetchError") {
        mockAuth(null, failure);
      } else {
        vi.mocked(getSessionById).mockRejectedValue(failure);
      }

      const response = await POST(request("POST"), PARAMS);

      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("3");
      await expect(response.json()).resolves.toMatchObject({
        error: "feedback_retry_unavailable",
        retryable: true,
      });
    }
  );

  it("keeps authenticated completed feedback out of shared caches", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "completed",
        dispatchStatus: "sent",
        dispatchedAt: new Date("2026-07-09T22:00:00.000Z"),
        structureScore: 8,
        clarityScore: 7,
        insightScore: 9,
        communicationScore: 8,
        leadershipScore: 7,
        overallScore: "8.0",
        strengths: ["Clear answer"],
        improvements: ["State the approach first"],
        drills: [],
        summary: "Historical summary",
      }) as never
    );
    const response = await GET(request(), PARAMS);
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
  });

  it("never logs content-bearing exception messages", async () => {
    const sentinel = "PRIVATE_FEEDBACK_SENTINEL_do_not_log";
    vi.mocked(createClient).mockRejectedValueOnce(new Error(sentinel));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await GET(request(), PARAMS);

    expect(response.status).toBe(500);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sentinel);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch feedback",
    });
    consoleError.mockRestore();
  });

  it.each([
    Object.assign(new Error("private statement detail"), { code: "57014" }),
    Object.assign(new Error("private auth detail"), {
      name: "AuthRetryableFetchError",
    }),
  ])(
    "returns a retryable 503 for a stalled read dependency",
    async (failure) => {
      if (failure.name === "AuthRetryableFetchError") {
        mockAuth(null, failure);
      } else {
        vi.mocked(getFeedbackBySessionId).mockRejectedValue(failure);
      }

      const response = await GET(request(), PARAMS);

      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("3");
      await expect(response.json()).resolves.toMatchObject({
        error: "feedback_read_unavailable",
      });
    }
  );

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
        structureScore: 8,
        clarityScore: 7,
        insightScore: 9,
        communicationScore: 8,
        leadershipScore: 7,
        overallScore: "7.9",
        strengths: [finding],
        improvements: [
          {
            ...finding,
            dimension: "structure",
            transcriptRefs: ["writer:2"],
            evidence: [{ turnRef: "writer:2", quote: "first, I would" }],
          },
        ],
        drills: ["Practice a two-minute prioritization explanation."],
        summary: "The answer was specific and can become more structured.",
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
        kind: "v2",
        strengths: [finding],
        schemaVersion: "feedback.v2",
        promptVersion: "feedback.prompt.v2",
        modelVersion: "fixture-model-v1",
        rubricVersion: "pm-feedback-rubric.v2",
        evaluationState: "partial",
      },
    });
  });

  it("returns only server-owned evidence-limited templates and grounded citations", async () => {
    const strength = {
      signalCode: "customer_problem_connection",
      actionCode: "connect_customer_to_decision",
      dimension: "insight",
      observation:
        EVIDENCE_LIMITED_STRENGTH_SIGNALS.customer_problem_connection
          .observation,
      transcriptRefs: ["writer:1"],
      evidence: [
        {
          turnRef: "writer:1",
          quote: "I would focus on working parents first.",
        },
      ],
      nextStep: EVIDENCE_LIMITED_ACTIONS.connect_customer_to_decision.nextStep,
      rubricVersion: "pm-feedback-rubric.v2",
      confidence: EVIDENCE_LIMITED_CONFIDENCE,
    };
    const improvement = {
      signalCode: "structure_progression",
      actionCode: "outline_reasoning",
      dimension: "structure",
      observation:
        EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS.structure_progression.observation,
      transcriptRefs: ["writer:2"],
      evidence: [
        {
          turnRef: "writer:2",
          quote:
            "First, I would define the goal; first, I would then prioritize.",
        },
      ],
      nextStep: EVIDENCE_LIMITED_ACTIONS.outline_reasoning.nextStep,
      rubricVersion: "pm-feedback-rubric.v2",
      confidence: EVIDENCE_LIMITED_CONFIDENCE,
    };
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "completed",
        strengths: [strength],
        improvements: [improvement],
        drills: [],
        summary: EVIDENCE_LIMITED_SUMMARY,
        schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
        promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
        modelVersion: "fixture-model-v2",
        rubricVersion: "pm-feedback-rubric.v2",
        evaluationState: "partial",
      }) as never
    );

    const response = await GET(request(), PARAMS);
    await expect(response.json()).resolves.toMatchObject({
      status: "completed",
      feedback: {
        kind: "evidence-limited",
        summary: EVIDENCE_LIMITED_SUMMARY,
        strengths: [strength],
        improvements: [improvement],
        schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
        promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
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
    dispatchEventId: `feedback/generate.requested:${SESSION_ID}:1`,
    dispatchClaimedAt: new Date("2026-07-09T22:00:00.000Z"),
    dispatchedAt: new Date("2026-07-09T22:00:01.000Z"),
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
    completionTier: "partial",
    completionStats: {
      totalTurns: 8,
      userTurns: 4,
      totalWords: 120,
      durationSeconds: 600,
      substantiveResponses: 3,
    },
    completionRecommendations: [],
    rubricVersion: "1.0.0",
    schemaVersion: null,
    promptVersion: null,
    modelVersion: null,
    evaluationState: null,
    createdAt: new Date("2026-07-09T22:00:00.000Z"),
    ...overrides,
  };
}
