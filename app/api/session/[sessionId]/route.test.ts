import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/sessions", () => ({
  getSessionWithSelectedQuestionById: vi.fn(),
  isSessionOwnedByUser: vi.fn(),
}));
vi.mock("@/lib/db/feedback", () => ({
  getFeedbackBySessionId: vi.fn(),
}));
vi.mock("@/lib/db/interactive-read", () => ({
  withInteractiveReadTransaction: vi.fn(
    (work: (database: object) => Promise<unknown>) => work(DATABASE)
  ),
}));

import { NextRequest } from "next/server";

import {
  getSessionWithSelectedQuestionById,
  isSessionOwnedByUser,
} from "@/lib/db/sessions";
import { getFeedbackBySessionId } from "@/lib/db/feedback";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const DATABASE = { select: "bounded-transaction" };

describe("GET /api/session/:sessionId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as never);
    vi.mocked(isSessionOwnedByUser).mockResolvedValue(true);
    vi.mocked(getSessionWithSelectedQuestionById).mockResolvedValue({
      session: {
        id: SESSION_ID,
        startedAt: new Date("2026-07-10T06:00:00.000Z"),
        config: { duration: 45 },
        terminalReason: null,
        deadlineRoomCleanupStatus: null,
      },
      question: {
        id: "660e8400-e29b-41d4-a716-446655440000",
        text: "Design a collaboration product for distributed PM teams.",
        company: "Fixture Company",
      },
    } as never);
    vi.mocked(getFeedbackBySessionId).mockResolvedValue({
      dispatchStatus: "sent",
    } as never);
  });

  it("returns the canonical deadline and minimal historical question DTO", async () => {
    const response = await GET(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session.deadlineAt).toBe("2026-07-10T06:45:00.000Z");
    expect(body.session.feedbackReady).toBe(true);
    expect(body.session.question).toEqual({
      id: "660e8400-e29b-41d4-a716-446655440000",
      text: "Design a collaboration product for distributed PM teams.",
      company: "Fixture Company",
    });
    expect(Object.keys(body.session.question).sort()).toEqual([
      "company",
      "id",
      "text",
    ]);
    expect(isSessionOwnedByUser).toHaveBeenCalledWith(
      SESSION_ID,
      "user-1",
      DATABASE
    );
    expect(getSessionWithSelectedQuestionById).toHaveBeenCalledWith(
      SESSION_ID,
      DATABASE
    );
    expect(getFeedbackBySessionId).toHaveBeenCalledWith(SESSION_ID, DATABASE);
  });

  it("keeps a session usable when its historical question relation is absent", async () => {
    vi.mocked(getSessionWithSelectedQuestionById).mockResolvedValue({
      session: {
        id: SESSION_ID,
        startedAt: new Date("2026-07-10T06:00:00.000Z"),
        config: { duration: 45 },
        terminalReason: null,
        deadlineRoomCleanupStatus: null,
      },
      question: null,
    } as never);

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      session: { id: SESSION_ID, question: null },
    });
  });

  it("does not read or expose question data before ownership succeeds", async () => {
    vi.mocked(isSessionOwnedByUser).mockResolvedValue(false);

    const response = await GET(request(), context());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Session not found or access denied",
    });
    expect(getSessionWithSelectedQuestionById).not.toHaveBeenCalled();
    expect(getFeedbackBySessionId).not.toHaveBeenCalled();
  });

  it("returns not found without question data when an owned session disappears", async () => {
    vi.mocked(getSessionWithSelectedQuestionById).mockResolvedValue(undefined);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Session not found",
    });
    expect(getFeedbackBySessionId).not.toHaveBeenCalled();
  });

  it("keeps terminal navigation blocked until feedback dispatch is acknowledged", async () => {
    vi.mocked(getSessionWithSelectedQuestionById).mockResolvedValue({
      session: {
        id: SESSION_ID,
        lifecycleState: "completed",
        terminalReason: "time_limit",
        startedAt: new Date("2026-07-10T06:00:00.000Z"),
        config: { duration: 30 },
        deadlineRoomCleanupStatus: "pending",
      },
      question: null,
    } as never);
    vi.mocked(getFeedbackBySessionId).mockResolvedValue({
      dispatchStatus: "pending",
    } as never);

    const response = await GET(request(), context());
    await expect(response.json()).resolves.toMatchObject({
      session: { feedbackReady: false },
    });
  });

  it("keeps skipped deadline feedback blocked until room cleanup is acknowledged", async () => {
    vi.mocked(getSessionWithSelectedQuestionById).mockResolvedValue({
      session: {
        id: SESSION_ID,
        lifecycleState: "abandoned",
        terminalReason: "insufficient_signal",
        deadlineRoomCleanupStatus: "pending",
        startedAt: new Date("2026-07-10T06:00:00.000Z"),
        config: { duration: 30 },
      },
      question: null,
    } as never);
    vi.mocked(getFeedbackBySessionId).mockResolvedValue({
      dispatchStatus: "not_required",
    } as never);

    const response = await GET(request(), context());
    await expect(response.json()).resolves.toMatchObject({
      session: { feedbackReady: false },
    });
  });

  it("marks skipped deadline feedback ready after cleanup acknowledgement", async () => {
    vi.mocked(getSessionWithSelectedQuestionById).mockResolvedValue({
      session: {
        id: SESSION_ID,
        lifecycleState: "abandoned",
        terminalReason: "insufficient_signal",
        deadlineRoomCleanupStatus: "already_absent",
        startedAt: new Date("2026-07-10T06:00:00.000Z"),
        config: { duration: 30 },
      },
      question: null,
    } as never);
    vi.mocked(getFeedbackBySessionId).mockResolvedValue({
      dispatchStatus: "not_required",
    } as never);

    const response = await GET(request(), context());
    await expect(response.json()).resolves.toMatchObject({
      session: { feedbackReady: true },
    });
  });

  it("returns a safe conflict when persisted start truth is missing", async () => {
    vi.mocked(getSessionWithSelectedQuestionById).mockResolvedValue({
      session: {
        id: SESSION_ID,
        startedAt: null,
        config: { duration: 30 },
        terminalReason: null,
        deadlineRoomCleanupStatus: null,
      },
      question: null,
    } as never);

    const response = await GET(request(), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "session_deadline_unavailable",
      message: "This interview session cannot be resumed safely.",
    });
  });

  it("bounds a stalled session read before the customer request deadline", async () => {
    vi.useFakeTimers();
    vi.mocked(isSessionOwnedByUser).mockReturnValue(
      new Promise(() => undefined)
    );

    try {
      const responsePromise = GET(request(), context());
      await vi.advanceTimersByTimeAsync(8_000);
      const response = await responsePromise;

      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("3");
      await expect(response.json()).resolves.toEqual({
        error: "session_read_unavailable",
        retryable: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    Object.assign(new Error("private lock detail"), { code: "57014" }),
    Object.assign(new Error("private auth detail"), {
      name: "AuthRetryableFetchError",
    }),
  ])("returns a private retryable response for %s", async (failure) => {
    if (failure.name === "AuthRetryableFetchError") {
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: failure,
          }),
        },
      } as never);
    } else {
      vi.mocked(isSessionOwnedByUser).mockRejectedValue(failure);
    }

    const response = await GET(request(), context());

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toEqual({
      error: "session_read_unavailable",
      retryable: true,
    });
  });
});

function request(): NextRequest {
  return new NextRequest(`http://localhost/api/session/${SESSION_ID}`);
}

function context() {
  return { params: Promise.resolve({ sessionId: SESSION_ID }) };
}
