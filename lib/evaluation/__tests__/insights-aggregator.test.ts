/**
 * Tests for Insights Aggregation Engine
 * P2-002: Validates user analytics calculation logic
 */

import { beforeEach, describe, test, expect, vi } from "vitest";

vi.mock("@/lib/db/sessions", () => ({
  getUserSessionsForFeedbackAnalytics: vi.fn(),
}));

import { getUserSessionsForFeedbackAnalytics } from "@/lib/db/sessions";
import {
  computeAverageScores,
  aggregateUserInsights,
} from "../insights-aggregator";

// ==================== Average Scores Computation Tests ====================

describe("computeAverageScores", () => {
  test("should return zeros for empty feedback array", () => {
    const result = computeAverageScores([]);
    expect(result).toEqual({
      structure: 0,
      clarity: 0,
      insight: 0,
      communication: 0,
      leadership: 0,
    });
  });

  test("should calculate averages for single feedback record", () => {
    const feedback = [
      {
        structureScore: 85,
        clarityScore: 90,
        insightScore: 75,
        communicationScore: 88,
        leadershipScore: 92,
      },
    ];

    const result = computeAverageScores(feedback);
    expect(result).toEqual({
      structure: 85,
      clarity: 90,
      insight: 75,
      communication: 88,
      leadership: 92,
    });
  });

  test("should calculate averages for multiple feedback records", () => {
    const feedback = [
      {
        structureScore: 80,
        clarityScore: 85,
        insightScore: 70,
        communicationScore: 75,
        leadershipScore: 90,
      },
      {
        structureScore: 90,
        clarityScore: 95,
        insightScore: 80,
        communicationScore: 85,
        leadershipScore: 88,
      },
      {
        structureScore: 70,
        clarityScore: 75,
        insightScore: 65,
        communicationScore: 80,
        leadershipScore: 85,
      },
    ];

    const result = computeAverageScores(feedback);
    expect(result.structure).toBe(80); // (80+90+70)/3 = 80
    expect(result.clarity).toBe(85); // (85+95+75)/3 = 85
    expect(result.insight).toBe(71.67); // (70+80+65)/3 = 71.67 (rounded)
    expect(result.communication).toBe(80); // (75+85+80)/3 = 80
    expect(result.leadership).toBe(87.67); // (90+88+85)/3 = 87.67 (rounded)
  });

  test("should ignore null scores when calculating averages", () => {
    const feedback = [
      {
        structureScore: 80,
        clarityScore: null,
        insightScore: 70,
        communicationScore: 75,
        leadershipScore: null,
      },
      {
        structureScore: 90,
        clarityScore: 95,
        insightScore: null,
        communicationScore: 85,
        leadershipScore: 88,
      },
    ];

    const result = computeAverageScores(feedback);
    expect(result.structure).toBe(85); // (80+90)/2 = 85
    expect(result.clarity).toBe(95); // Only 1 non-null value
    expect(result.insight).toBe(70); // Only 1 non-null value
    expect(result.communication).toBe(80); // (75+85)/2 = 80
    expect(result.leadership).toBe(88); // Only 1 non-null value
  });

  test("should return 0 for competency when all scores are null", () => {
    const feedback = [
      {
        structureScore: null,
        clarityScore: 90,
        insightScore: 80,
        communicationScore: 85,
        leadershipScore: 75,
      },
      {
        structureScore: null,
        clarityScore: 95,
        insightScore: 85,
        communicationScore: 90,
        leadershipScore: 80,
      },
    ];

    const result = computeAverageScores(feedback);
    expect(result.structure).toBe(0); // All null
    expect(result.clarity).toBe(92.5); // (90+95)/2 = 92.5
  });
});

// ==================== Full Insights Aggregation Tests ====================

describe("aggregateUserInsights", () => {
  beforeEach(() => {
    vi.mocked(getUserSessionsForFeedbackAnalytics).mockReset();
  });

  test("should return empty insights for user with zero sessions", async () => {
    vi.mocked(getUserSessionsForFeedbackAnalytics).mockResolvedValue([]);

    const insights = await aggregateUserInsights("user-with-no-sessions");

    expect(insights.overallStats.totalSessions).toBe(0);
    expect(insights.overallStats.completedSessions).toBe(0);
    expect(insights.trends.improvementTrend).toBe("stable");
  });

  test("uses only completed scored feedback and returns no reward fields", async () => {
    const startedAt = new Date("2026-07-15T12:00:00.000Z");
    const endedAt = new Date("2026-07-15T12:30:00.000Z");
    const feedbackScores = {
      structureScore: 8,
      clarityScore: 7,
      insightScore: 6,
      communicationScore: 9,
      leadershipScore: 7,
    };
    vi.mocked(getUserSessionsForFeedbackAnalytics).mockResolvedValue([
      {
        id: "completed-1",
        userId: "user-123",
        roundType: "product_sense",
        startedAt,
        endedAt,
        config: { difficulty: "senior" },
        feedback: {
          status: "completed",
          presentationKind: "scorecard",
          overallScore: "8",
          ...feedbackScores,
        },
      },
      {
        id: "processing",
        userId: "user-123",
        roundType: "strategy",
        startedAt,
        endedAt,
        config: { difficulty: "intermediate" },
        feedback: {
          status: "processing",
          presentationKind: "unavailable",
          overallScore: "10",
          ...feedbackScores,
        },
      },
      {
        id: "invalid-score",
        userId: "user-123",
        roundType: "leadership",
        startedAt,
        endedAt,
        config: { difficulty: "junior" },
        feedback: {
          status: "completed",
          presentationKind: "unavailable",
          overallScore: "NaN",
          ...feedbackScores,
        },
      },
      {
        id: "completed-2",
        userId: "user-123",
        roundType: "analytical",
        startedAt,
        endedAt,
        config: { difficulty: "junior" },
        feedback: {
          status: "completed",
          presentationKind: "scorecard",
          overallScore: "6",
          ...feedbackScores,
        },
      },
    ] as never);

    const insights = await aggregateUserInsights("user-123");

    expect(insights.overallStats).toEqual({
      totalSessions: 4,
      completedSessions: 2,
      totalMinutes: 120,
      avgScore: 7,
      medianScore: 7,
      percentile25: 6.5,
      percentile75: 7.5,
      percentile90: 7.8,
    });
    expect(insights.byInterviewType.product_sense.count).toBe(1);
    expect(insights.byInterviewType.analytical.count).toBe(1);
    expect(insights.byInterviewType.strategy.count).toBe(0);
    expect(insights.byInterviewType.leadership.count).toBe(0);
    expect(insights.byDifficulty.senior.count).toBe(1);
    expect(insights.byDifficulty.junior.count).toBe(1);
    expect(insights.overallStats).not.toHaveProperty("currentStreak");
    expect(insights.overallStats).not.toHaveProperty("longestStreak");
  });

  test("excludes partial, coaching, and unavailable projections from every numeric insight", async () => {
    const startedAt = new Date("2026-08-12T12:00:00.000Z");
    const endedAt = new Date("2026-08-12T12:30:00.000Z");
    const rawScores = {
      status: "completed",
      overallScore: "9",
      structureScore: 9,
      clarityScore: 9,
      insightScore: 9,
      communicationScore: 9,
      leadershipScore: 9,
    };
    vi.mocked(getUserSessionsForFeedbackAnalytics).mockResolvedValue(
      ["partial_scorecard", "coaching_review", "unavailable"].map(
        (presentationKind, index) => ({
          id: `synthetic-scoreless-${index}`,
          userId: "user-123",
          roundType: "product_sense",
          startedAt,
          endedAt,
          config: { difficulty: "intermediate" },
          feedback: { ...rawScores, presentationKind },
        })
      ) as never
    );

    const insights = await aggregateUserInsights("user-123");

    expect(insights.overallStats.completedSessions).toBe(0);
    expect(insights.overallStats.avgScore).toBe(0);
    expect(insights.competencySampleSizes).toEqual({
      structure: 0,
      clarity: 0,
      insight: 0,
      communication: 0,
      leadership: 0,
    });
  });
});

// ==================== Edge Case Tests ====================

describe("Edge Cases", () => {
  test("computeAverageScores: should round to 2 decimal places", () => {
    const feedback = [
      {
        structureScore: 33,
        clarityScore: 34,
        insightScore: 33,
        communicationScore: 33,
        leadershipScore: 33,
      },
      {
        structureScore: 34,
        clarityScore: 33,
        insightScore: 34,
        communicationScore: 34,
        leadershipScore: 34,
      },
      {
        structureScore: 33,
        clarityScore: 33,
        insightScore: 33,
        communicationScore: 33,
        leadershipScore: 33,
      },
    ];

    const result = computeAverageScores(feedback);
    // (33+34+33)/3 = 33.333... → 33.33
    expect(result.structure).toBe(33.33);
  });
});
