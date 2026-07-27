import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSessions: vi.fn(),
  getSessionsByRoundType: vi.fn(),
  getStats: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock("@/lib/db/sessions", () => ({
  getUserSessionsPaginated: mocks.getSessions,
  getUserSessionsByRoundTypePaginated: mocks.getSessionsByRoundType,
  getUserSessionStats: mocks.getStats,
}));

import { GET } from "./route";

describe("GET /api/sessions pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it.each([
    "limit=abc",
    "limit=20junk",
    "limit=1.5",
    "limit=-1",
    "limit=9007199254740992",
    "offset=abc",
    "offset=20junk",
    "offset=1.5",
    "offset=-1",
    "offset=9007199254740992",
  ])("rejects malformed query %s before storage", async (query) => {
    const response = await GET(
      new NextRequest(`https://meelni.test/api/sessions?${query}`)
    );

    expect(response.status).toBe(400);
    expect(mocks.getSessions).not.toHaveBeenCalled();
    expect(mocks.getSessionsByRoundType).not.toHaveBeenCalled();
    expect(mocks.getStats).not.toHaveBeenCalled();
  });
});
