import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/questions", () => ({ getActiveQuestionById: vi.fn() }));

import { getActiveQuestionById } from "@/lib/db/questions";

import { GET } from "./route";

const QUESTION_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("GET /api/questions/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an active selected question", async () => {
    vi.mocked(getActiveQuestionById).mockResolvedValue({
      id: QUESTION_ID,
      questionText: "How would you improve a product?",
      questionType: "Product Sense",
      company: "Meta",
      askedAt: null,
      createdAt: null,
      isActive: true,
    });

    const response = await GET(
      new NextRequest(`http://localhost/api/questions/${QUESTION_ID}`),
      { params: Promise.resolve({ id: QUESTION_ID }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ id: QUESTION_ID, isActive: true })
    );
  });

  it("treats inactive and deleted questions as unavailable", async () => {
    for (const question of [
      {
        id: QUESTION_ID,
        questionText: "Retired question",
        questionType: "Strategy",
        company: "Example",
        askedAt: null,
        createdAt: null,
        isActive: false,
      },
      null,
    ]) {
      vi.mocked(getActiveQuestionById).mockResolvedValueOnce(question);
      const response = await GET(
        new NextRequest(`http://localhost/api/questions/${QUESTION_ID}`),
        { params: Promise.resolve({ id: QUESTION_ID }) }
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Question not found" });
    }
  });

  it("rejects invalid question intent before querying storage", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/questions/not-a-question"),
      { params: Promise.resolve({ id: "not-a-question" }) }
    );

    expect(response.status).toBe(400);
    expect(getActiveQuestionById).not.toHaveBeenCalled();
  });
});
