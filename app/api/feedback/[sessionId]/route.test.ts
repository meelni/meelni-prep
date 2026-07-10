import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/sessions", () => ({
  getSessionById: vi.fn(),
  isSessionOwnedByUser: vi.fn(),
}));
vi.mock("@/lib/db/feedback", () => ({
  getFeedbackBySessionId: vi.fn(),
}));
vi.mock("@/lib/db/transcripts", () => ({
  getFeedbackEvidenceTurns: vi.fn(),
}));
vi.mock("@/lib/evaluation/session-validator", () => ({
  validateSessionCompleteness: vi.fn(),
}));
vi.mock("@/lib/workflows/recover-feedback-generation", () => ({
  recoverFeedbackGenerationWorkflow: vi.fn(),
}));

import { NextRequest } from "next/server";

import { getFeedbackBySessionId } from "@/lib/db/feedback";
import { getSessionById, isSessionOwnedByUser } from "@/lib/db/sessions";
import { getFeedbackEvidenceTurns } from "@/lib/db/transcripts";
import { createClient } from "@/lib/supabase/server";
import { validateSessionCompleteness } from "@/lib/evaluation/session-validator";
import { recoverFeedbackGenerationWorkflow } from "@/lib/workflows/recover-feedback-generation";
import { GET, POST } from "./route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const PARAMS = { params: Promise.resolve({ sessionId: SESSION_ID }) };

describe("/api/feedback/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth({ id: "user-1" });
    vi.mocked(isSessionOwnedByUser).mockResolvedValue(true);
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
    expect(getFeedbackEvidenceTurns).not.toHaveBeenCalled();
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

  it("returns a recoverable state while ending still needs feedback finalization", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(undefined as never);
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "ending",
    } as never);

    const response = await GET(request(), PARAMS);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "missing",
      retryable: true,
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
    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      dispatch: { status: "failed", retryable: true },
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
    const body = await response.json();
    expect(body).toMatchObject({
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
    expect(body.feedback).not.toHaveProperty("suggestedExercises");
    expect(getFeedbackEvidenceTurns).toHaveBeenCalledWith(SESSION_ID);
  });

  it("fails closed when persisted v2 evidence does not resolve to canonical user speech", async () => {
    const integrityLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const inventedFinding = {
      dimension: "insight",
      observation: "Invented observation",
      transcriptRefs: ["does-not-exist"],
      evidence: [{ turnRef: "does-not-exist", quote: "invented quote" }],
      nextStep: "Invented action",
      rubricVersion: "pm-feedback-rubric.v2",
      confidence: 0.99,
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
        strengths: [inventedFinding],
        improvements: [
          {
            ...inventedFinding,
            dimension: "structure",
            transcriptRefs: ["also-missing"],
            evidence: [
              { turnRef: "also-missing", quote: "another invented quote" },
            ],
          },
        ],
        drills: ["Hidden suggestion"],
        summary: "Invented summary",
        schemaVersion: "feedback.v2",
        promptVersion: "feedback.prompt.v2",
        modelVersion: "fixture-model-v1",
        rubricVersion: "pm-feedback-rubric.v2",
        evaluationState: "full",
      }) as never
    );

    const response = await GET(request(), PARAMS);

    await expect(response.json()).resolves.toEqual({
      status: "completed",
      retryable: false,
      feedback: { kind: "invalid", reason: "incompatible_or_corrupt" },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(integrityLog).toHaveBeenCalled();
    integrityLog.mockRestore();
  });

  it("fails closed when a completed row has missing scores", async () => {
    const integrityLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "completed",
        structureScore: 8,
        clarityScore: null,
        insightScore: 9,
        communicationScore: 8,
        leadershipScore: 7,
        overallScore: "8.0",
        strengths: ["Generic strength"],
        improvements: ["Generic improvement"],
        drills: [],
        summary: "Generic summary",
        schemaVersion: null,
        promptVersion: null,
        modelVersion: null,
        evaluationState: null,
      }) as never
    );

    const response = await GET(request(), PARAMS);
    await expect(response.json()).resolves.toEqual({
      status: "completed",
      retryable: false,
      feedback: { kind: "invalid", reason: "incompatible_or_corrupt" },
    });
    expect(integrityLog).toHaveBeenCalledWith(
      "[feedback.integrity] incompatible completed feedback",
      expect.objectContaining({ sessionId: SESSION_ID })
    );
    const metadata = integrityLog.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(metadata).sort()).toEqual([
      "environment",
      "release",
      "sessionId",
    ]);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    integrityLog.mockRestore();
  });

  it("returns validated legacy feedback with an explicit historical discriminator", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "completed",
        structureScore: 8,
        clarityScore: 7,
        insightScore: 9,
        communicationScore: 8,
        leadershipScore: 7,
        // Legacy writes accepted a separately model-authored overall score.
        overallScore: "8.0",
        strengths: ["Clear explanation"],
        improvements: ["State the approach first"],
        drills: [],
        summary: "Historical summary",
        schemaVersion: null,
        promptVersion: null,
        modelVersion: null,
        evaluationState: null,
      }) as never
    );

    const response = await GET(request(), PARAMS);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "completed",
      feedback: { kind: "legacy", strengths: ["Clear explanation"] },
    });
    expect(body.feedback).not.toHaveProperty("suggestedExercises");
    expect(getFeedbackEvidenceTurns).not.toHaveBeenCalled();
  });

  it("fails closed for an unsupported historical rubric without loading transcript data", async () => {
    const integrityLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "completed",
        structureScore: 8,
        clarityScore: 7,
        insightScore: 9,
        communicationScore: 8,
        leadershipScore: 7,
        overallScore: "8.0",
        strengths: ["Clear explanation"],
        improvements: ["State the approach first"],
        drills: [],
        summary: "Historical summary",
        rubricVersion: "not-a-supported-rubric",
        schemaVersion: null,
        promptVersion: null,
        modelVersion: null,
        evaluationState: null,
      }) as never
    );

    const response = await GET(request(), PARAMS);

    await expect(response.json()).resolves.toEqual({
      status: "completed",
      retryable: false,
      feedback: { kind: "invalid", reason: "incompatible_or_corrupt" },
    });
    expect(getFeedbackEvidenceTurns).not.toHaveBeenCalled();
    expect(integrityLog).toHaveBeenCalled();
    integrityLog.mockRestore();
  });

  it("preserves insufficient and abandoned skipped states", async () => {
    vi.mocked(getFeedbackBySessionId).mockResolvedValue(
      feedbackRecord({
        status: "skipped",
        completionTier: "abandoned",
      }) as never
    );
    vi.mocked(validateSessionCompleteness).mockResolvedValue({
      tier: "abandoned",
      stats: {
        totalTurns: 0,
        userTurns: 0,
        totalWords: 0,
        durationSeconds: 0,
        substantiveResponses: 0,
      },
      reasons: ["No recorded conversation"],
      recommendations: ["Start a new mock interview"],
    } as never);

    const response = await GET(request(), PARAMS);
    await expect(response.json()).resolves.toMatchObject({
      status: "skipped",
      retryable: false,
      details: { tier: "abandoned" },
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
    rubricVersion: "1.0.0",
    schemaVersion: null,
    promptVersion: null,
    modelVersion: null,
    evaluationState: null,
    completionTier: null,
    createdAt: new Date("2026-07-09T22:00:00.000Z"),
    ...overrides,
  };
}
