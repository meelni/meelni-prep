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
import {
  buildDashboardPracticeSummary,
  buildHistorySummary,
} from "@/lib/dashboard/contracts";

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

  it("returns only the closed feedback presentation contract", async () => {
    mocks.getSessions.mockResolvedValue({
      sessions: [
        {
          id: "session-1",
          feedback: {
            status: "completed",
            presentationKind: "coaching_review",
            overallScore: null,
            structureScore: null,
            clarityScore: null,
            insightScore: null,
            communicationScore: null,
            leadershipScore: null,
            modelVersion: "must-not-cross-api",
            strengthsJson: '[{"must":"not cross"}]',
          },
        },
      ],
      total: 1,
    });
    mocks.getStats.mockResolvedValue({
      totalSessions: 1,
      totalMinutes: 5,
      avgScore: 0,
      completionRate: 100,
    });

    const response = await GET(
      new NextRequest("https://meelni.test/api/sessions")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions[0].feedback).toEqual({
      status: "completed",
      presentationKind: "coaching_review",
      overallScore: null,
      structureScore: null,
      clarityScore: null,
      insightScore: null,
      communicationScore: null,
      leadershipScore: null,
    });
    expect(JSON.stringify(body)).not.toContain("must-not-cross-api");
    expect(JSON.stringify(body)).not.toContain("strengthsJson");
  });

  it("normalizes an unknown presentation kind to unavailable", async () => {
    mocks.getSessions.mockResolvedValue({
      sessions: [
        {
          id: "session-1",
          feedback: {
            status: "completed",
            presentationKind: "forged-kind",
            overallScore: null,
          },
        },
      ],
      total: 1,
    });
    mocks.getStats.mockResolvedValue({
      totalSessions: 1,
      totalMinutes: 5,
      avgScore: 0,
      completionRate: 100,
    });

    const response = await GET(
      new NextRequest("https://meelni.test/api/sessions")
    );
    const body = await response.json();

    expect(body.sessions[0].feedback.presentationKind).toBe("unavailable");
  });

  it("keeps an adapter-rejected completed review unavailable through dashboard consumers", async () => {
    mocks.getSessions.mockResolvedValue({
      sessions: [
        {
          id: "session-corrupt",
          roundType: "product_sense",
          startedAt: "2026-08-12T12:00:00.000Z",
          endedAt: "2026-08-12T12:05:00.000Z",
          feedback: {
            status: "completed",
            presentationKind: "unavailable",
            overallScore: "9.9",
            structureScore: 10,
            clarityScore: 10,
            insightScore: 10,
            communicationScore: 10,
            leadershipScore: 10,
          },
        },
      ],
      total: 1,
    });
    mocks.getStats.mockResolvedValue({
      totalSessions: 1,
      totalMinutes: 5,
      avgScore: 0,
      completionRate: 100,
    });

    const response = await GET(
      new NextRequest("https://meelni.test/api/sessions")
    );
    const body = await response.json();
    const history = buildHistorySummary(body.sessions);
    const dashboard = buildDashboardPracticeSummary(body.sessions);

    expect(body.sessions[0].feedback.presentationKind).toBe("unavailable");
    expect(body.sessions[0].feedback).toMatchObject({
      overallScore: null,
      structureScore: null,
      clarityScore: null,
      insightScore: null,
      communicationScore: null,
      leadershipScore: null,
    });
    expect(history.rows[0].feedbackHref).toBeNull();
    expect(history.rows[0].statusLabel).toBe("Feedback unavailable");
    expect(dashboard.progress.scoredInterviewCount).toBe(0);
    expect(dashboard.lastFeedback).toBeNull();
  });
});
