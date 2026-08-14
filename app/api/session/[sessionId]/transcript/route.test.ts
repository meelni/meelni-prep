import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/transcripts", () => ({
  getFrozenFeedbackTranscriptTurns: vi.fn(),
  getSessionTranscript: vi.fn(),
}));
vi.mock("@/lib/db/sessions", () => ({
  getSessionById: vi.fn(),
  isSessionOwnedByUser: vi.fn(),
}));
vi.mock("@/lib/db/interactive-read", () => ({
  withInteractiveReadTransaction: vi.fn(
    (work: (database: object) => Promise<unknown>) => work({})
  ),
}));

import {
  getFrozenFeedbackTranscriptTurns,
  getSessionTranscript,
} from "@/lib/db/transcripts";
import { getSessionById, isSessionOwnedByUser } from "@/lib/db/sessions";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const PRIVATE_NO_STORE = "private, no-store";

describe("GET /api/session/:sessionId/transcript", () => {
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
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "completed",
      transcriptEvidenceVersion: 1,
      transcriptEvidenceState: "complete",
      transcriptCutoffAt: new Date("2026-08-14T12:00:00.000Z"),
      transcriptEvidenceFrozenAt: new Date("2026-08-14T12:00:01.000Z"),
    } as never);
    vi.mocked(getFrozenFeedbackTranscriptTurns).mockResolvedValue([]);
    vi.mocked(getSessionTranscript).mockResolvedValue([]);
  });

  it("authenticates before ownership and transcript reads", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("missing session"),
        }),
      },
    } as never);

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe(PRIVATE_NO_STORE);
    expect(isSessionOwnedByUser).not.toHaveBeenCalled();
    expect(getSessionTranscript).not.toHaveBeenCalled();
  });

  it("checks ownership before reading transcript text", async () => {
    vi.mocked(isSessionOwnedByUser).mockResolvedValue(false);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe(PRIVATE_NO_STORE);
    expect(isSessionOwnedByUser).toHaveBeenCalledWith(
      SESSION_ID,
      "user-1",
      expect.anything()
    );
    expect(getSessionTranscript).not.toHaveBeenCalled();
  });

  it("returns an owned transcript in canonical order without caching", async () => {
    const turns = [
      { id: "turn-1", speaker: "interviewer", text: "Welcome" },
      { id: "turn-2", speaker: "user", text: "Thank you" },
    ];
    vi.mocked(getSessionTranscript).mockResolvedValue(turns as never);

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(PRIVATE_NO_STORE);
    expect(await response.json()).toEqual({ turns });
    expect(
      vi.mocked(isSessionOwnedByUser).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(getSessionTranscript).mock.invocationCallOrder[0]);
  });

  it("returns only the immutable feedback evidence prefix for frozen reads", async () => {
    const frozenTurns = [
      {
        id: "650e8400-e29b-41d4-a716-446655440001",
        eventId: "synthetic-writer:1",
        speaker: "user",
        text: "A finalized synthetic answer.",
        startedAt: new Date("2026-08-14T12:00:00.000Z"),
        writerId: "server-only-writer",
        writerGeneration: 1,
        sequence: 1,
        contractVersion: 2,
        deliveryState: "delivered",
        endedAt: new Date("2026-08-14T12:00:01.000Z"),
        audioMs: 1_000,
        section: "answer",
      },
      {
        id: "650e8400-e29b-41d4-a716-446655440002",
        eventId: "synthetic-writer:2",
        speaker: "interviewer",
        text: "A finalized synthetic follow-up.",
        startedAt: new Date("2026-08-14T12:00:02.000Z"),
        writerId: "server-only-writer",
        writerGeneration: 1,
        sequence: 2,
        contractVersion: 2,
        deliveryState: "partially_delivered",
        endedAt: new Date("2026-08-14T12:00:03.000Z"),
        audioMs: 1_000,
        section: "follow_up",
      },
    ];
    const mutableTail = {
      id: "turn-tail",
      eventId: "synthetic-writer:2",
      speaker: "user",
      text: "An unverified mutable tail.",
    };
    vi.mocked(getFrozenFeedbackTranscriptTurns).mockResolvedValue(
      frozenTurns as never
    );
    vi.mocked(getSessionTranscript).mockResolvedValue([
      ...frozenTurns,
      mutableTail,
    ] as never);

    const response = await GET(request("frozen"), context());

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      scope: "frozen",
      turns: frozenTurns.map((turn) => ({
        id: turn.id,
        ...(turn.eventId ? { eventId: turn.eventId } : {}),
        speaker: turn.speaker,
        text: turn.text,
        startedAt:
          turn.startedAt instanceof Date ? turn.startedAt.toISOString() : null,
      })),
    });
    expect(getFrozenFeedbackTranscriptTurns).toHaveBeenCalledWith(SESSION_ID);
    expect(getSessionTranscript).not.toHaveBeenCalled();
    expect(JSON.stringify(payload)).not.toContain(mutableTail.text);
    expect(payload.turns.map((turn: { id: string }) => turn.id)).toEqual([
      "650e8400-e29b-41d4-a716-446655440001",
      "650e8400-e29b-41d4-a716-446655440002",
    ]);
    for (const turn of payload.turns) {
      expect(Object.keys(turn).sort()).toEqual(
        [
          ...(turn.eventId ? ["eventId"] : []),
          "id",
          "speaker",
          "startedAt",
          "text",
        ].sort()
      );
    }
    expect(JSON.stringify(payload)).not.toMatch(
      /writerId|writerGeneration|sequence|deliveryState|contractVersion|audioMs|section|endedAt/
    );
  });

  it("rejects unsupported transcript scopes without reading content", async () => {
    const response = await GET(request("mutable-tail"), context());

    expect(response.status).toBe(400);
    expect(getSessionTranscript).not.toHaveBeenCalled();
    expect(getFrozenFeedbackTranscriptTurns).not.toHaveBeenCalled();
  });

  it("returns no content for a direct frozen read while the session is ending", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "ending",
      transcriptEvidenceVersion: null,
      transcriptEvidenceState: null,
      transcriptCutoffAt: null,
      transcriptEvidenceFrozenAt: null,
    } as never);
    vi.mocked(getSessionTranscript).mockResolvedValue([
      { id: "mutable-tail", text: "Unverified synthetic tail" },
    ] as never);

    const response = await GET(request("frozen"), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "frozen_transcript_not_ready",
      scope: "frozen",
    });
    expect(getFrozenFeedbackTranscriptTurns).not.toHaveBeenCalled();
    expect(getSessionTranscript).not.toHaveBeenCalled();
  });

  it("preserves bounded frozen reads for terminal legacy sessions", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      lifecycleState: "completed",
      transcriptEvidenceVersion: null,
      transcriptEvidenceState: null,
      transcriptCutoffAt: null,
      transcriptEvidenceFrozenAt: null,
    } as never);
    vi.mocked(getFrozenFeedbackTranscriptTurns).mockResolvedValue([
      {
        id: "650e8400-e29b-41d4-a716-446655440003",
        eventId: null,
        speaker: "user",
        text: "A bounded legacy synthetic answer.",
        startedAt: null,
      },
      {
        id: "650e8400-e29b-41d4-a716-446655440004",
        eventId: null,
        speaker: "interviewer",
        text: "A bounded legacy synthetic prompt.",
        startedAt: null,
      },
    ] as never);

    const response = await GET(request("frozen"), context());

    expect(response.status).toBe(200);
    expect(getFrozenFeedbackTranscriptTurns).toHaveBeenCalledTimes(1);
    const payload = await response.json();
    expect(payload.turns).toHaveLength(2);
    expect(payload.turns.map((turn: { id: string }) => turn.id)).toEqual([
      "650e8400-e29b-41d4-a716-446655440003",
      "650e8400-e29b-41d4-a716-446655440004",
    ]);
    expect(payload.turns.every((turn: object) => !("eventId" in turn))).toBe(
      true
    );
  });

  it("redacts data-layer failures and disables caching on errors", async () => {
    const sentinel = "raw transcript and provider-secret";
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(getSessionTranscript).mockRejectedValue(new Error(sentinel));

    try {
      const response = await GET(request(), context());

      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe(PRIVATE_NO_STORE);
      expect(JSON.stringify(await response.json())).not.toContain(sentinel);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sentinel);
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([
    Object.assign(new Error("private lock detail"), { code: "57014" }),
    Object.assign(new Error("private auth detail"), {
      name: "AuthRetryableFetchError",
    }),
  ])("returns a retryable 503 for a stalled dependency", async (failure) => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
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
      vi.mocked(getSessionTranscript).mockRejectedValue(failure);
    }

    try {
      const response = await GET(request(), context());
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("3");
      await expect(response.json()).resolves.toEqual({
        error: "transcript_read_unavailable",
      });
      expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain("private");
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it("cuts off a transcript read before the platform function ceiling", async () => {
    vi.useFakeTimers();
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getSessionTranscript).mockImplementation(
      () => new Promise<never>(() => undefined)
    );

    try {
      const pendingResponse = GET(request(), context());
      await vi.advanceTimersByTimeAsync(7_500);
      const response = await pendingResponse;

      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("3");
    } finally {
      vi.useRealTimers();
      consoleWarn.mockRestore();
    }
  });
});

function request(scope?: string) {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return new NextRequest(
    `http://localhost/api/session/${SESSION_ID}/transcript${query}`
  );
}

function context() {
  return { params: Promise.resolve({ sessionId: SESSION_ID }) };
}
