import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/transcripts", () => ({ getSessionTranscript: vi.fn() }));
vi.mock("@/lib/db/sessions", () => ({ isSessionOwnedByUser: vi.fn() }));
vi.mock("@/lib/db/interactive-read", () => ({
  withInteractiveReadTransaction: vi.fn(
    (work: (database: object) => Promise<unknown>) => work({})
  ),
}));

import { getSessionTranscript } from "@/lib/db/transcripts";
import { isSessionOwnedByUser } from "@/lib/db/sessions";
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

function request() {
  return new NextRequest(
    `http://localhost/api/session/${SESSION_ID}/transcript`
  );
}

function context() {
  return { params: Promise.resolve({ sessionId: SESSION_ID }) };
}
