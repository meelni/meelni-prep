import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/questions", () => ({
  getRandomQuestion: vi.fn(),
  getRandomRecentQuestion: vi.fn(),
}));

import { getRandomQuestion } from "@/lib/db/questions";

import { GET } from "./route";

describe("GET /api/questions/random", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns a stable response and log when storage exposes sensitive text", async () => {
    const secret = "postgres-secret-customer@example.com";
    vi.mocked(getRandomQuestion).mockRejectedValueOnce(new Error(secret));

    const response = await GET(
      new NextRequest("http://localhost/api/questions/random")
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to fetch random question",
      message: "Unable to load a question right now.",
    });
    expect(console.error).toHaveBeenCalledWith("random_question_read_failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      secret
    );
  });
});
