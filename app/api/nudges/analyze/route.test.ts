import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { GET, POST } from "./route";

describe("retired POST /api/nudges/analyze", () => {
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
  });

  it.each([
    ["gentle JSON", JSON.stringify({ hintMode: "gentle", text: "sentinel" })],
    ["coach JSON", JSON.stringify({ hintMode: "coach", text: "sentinel" })],
    ["malformed JSON", "{not-json"],
  ])("ignores %s request bodies", async (_label, body) => {
    const request = new NextRequest("http://localhost/api/nudges/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const response = await POST(request);

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "live_interview_hints_retired",
      message: "Live hints are not available during full mock interviews.",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not disclose retirement state to unauthenticated POST callers", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("invalid auth"),
        }),
      },
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/nudges/analyze", {
        method: "POST",
        body: "{}",
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const getResponse = await GET();
    expect(getResponse.status).toBe(401);
    expect(getResponse.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("retires the former GET health endpoint without caching", async () => {
    const response = await GET();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "live_interview_hints_retired",
      message: "Live hints are not available during full mock interviews.",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
