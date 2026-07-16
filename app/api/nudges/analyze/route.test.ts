import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/sessions", () => ({ isSessionOwnedByUser: vi.fn() }));
vi.mock("@/lib/nudges/framework-tracker", () => ({
  createFrameworkTracker: vi.fn(),
}));
vi.mock("@meelni/core", () => ({ shouldAnalyzeNudges: vi.fn(() => true) }));

import { NextRequest } from "next/server";

import { isSessionOwnedByUser } from "@/lib/db/sessions";
import { createFrameworkTracker } from "@/lib/nudges/framework-tracker";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

describe("POST /api/nudges/analyze", () => {
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
  });

  it("redacts transcript content from graceful-degradation logs", async () => {
    const sentinel = "PRIVATE_NUDGE_TRANSCRIPT_SENTINEL_do_not_log";
    vi.mocked(createFrameworkTracker).mockReturnValue({
      analyzeTurn: vi.fn(() => {
        throw new Error(sentinel);
      }),
      shouldNudge: vi.fn(),
    } as never);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await POST(
      new NextRequest("http://localhost/api/nudges/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "nudge-sentinel-session",
          interviewType: "product_sense",
          currentTurn: {
            speaker: "user",
            text: sentinel,
            timestamp: 1,
          },
          timeElapsed: 30,
          hintMode: "adaptive",
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      shouldNudge: false,
      error: "Analysis temporarily unavailable",
      frameworkCoverage: [],
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sentinel);
    consoleError.mockRestore();
  });
});
