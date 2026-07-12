import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/sessions", () => ({
  getSessionById: vi.fn(),
  isSessionOwnedByUser: vi.fn(),
}));

import { NextRequest } from "next/server";

import { getSessionById, isSessionOwnedByUser } from "@/lib/db/sessions";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

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
  });

  it("returns the canonical server-derived deadline", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      id: SESSION_ID,
      startedAt: new Date("2026-07-10T06:00:00.000Z"),
      config: { duration: 45 },
    } as never);

    const response = await GET(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session.deadlineAt).toBe("2026-07-10T06:45:00.000Z");
  });

  it("returns a safe conflict when persisted start truth is missing", async () => {
    vi.mocked(getSessionById).mockResolvedValue({
      id: SESSION_ID,
      startedAt: null,
      config: { duration: 30 },
    } as never);

    const response = await GET(request(), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "session_deadline_unavailable",
      message: "This interview session cannot be resumed safely.",
    });
  });
});

function request(): NextRequest {
  return new NextRequest(`http://localhost/api/session/${SESSION_ID}`);
}

function context() {
  return { params: Promise.resolve({ sessionId: SESSION_ID }) };
}
