import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock("@/lib/db", () => ({
  db: { select: mocks.select },
}));

import { GET } from "./route";

describe("GET /api/billing/payment-history pagination", () => {
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
    "limit=0",
    "limit=101",
    "limit=9007199254740992",
    "offset=abc",
    "offset=20junk",
    "offset=1.5",
    "offset=-1",
    "offset=9007199254740992",
  ])("rejects invalid query %s before storage", async (query) => {
    const response = await GET(
      new Request(
        `https://meelni.test/api/billing/payment-history?${query}`
      )
    );

    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
