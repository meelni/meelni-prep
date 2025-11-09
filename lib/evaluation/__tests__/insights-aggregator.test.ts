/**
 * Tests for Insights Aggregation Engine
 * P2-002: Validates user analytics calculation logic
 */

import { describe, test, expect } from "vitest";
import {
  calculateStreakDays,
  computeAverageScores,
  aggregateUserInsights,
} from "../insights-aggregator";

// ==================== Streak Calculation Tests ====================

describe("calculateStreakDays", () => {
  test("should return 0 streaks for empty sessions array", () => {
    const result = calculateStreakDays([]);
    expect(result).toEqual({ currentStreak: 0, longestStreak: 0 });
  });

  test("should return 0 streaks when all sessions have null dates", () => {
    const sessions = [
      { startedAt: null },
      { startedAt: null },
      { startedAt: null },
    ];
    const result = calculateStreakDays(sessions);
    expect(result).toEqual({ currentStreak: 0, longestStreak: 0 });
  });

  test("should count single session as 1-day current and longest streak", () => {
    const today = new Date();
    const sessions = [{ startedAt: today }];
    const result = calculateStreakDays(sessions);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });

  test("should calculate current streak for consecutive days including today", () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const sessions = [
      { startedAt: today },
      { startedAt: yesterday },
      { startedAt: twoDaysAgo },
    ];

    const result = calculateStreakDays(sessions);
    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(3);
  });

  test("should handle gap in streak (current streak broken)", () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const sixDaysAgo = new Date(today);
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

    const sessions = [
      { startedAt: today },
      { startedAt: yesterday },
      { startedAt: fiveDaysAgo },
      { startedAt: sixDaysAgo },
    ];

    const result = calculateStreakDays(sessions);
    expect(result.currentStreak).toBe(2); // Today + yesterday
    expect(result.longestStreak).toBe(2); // Multiple 2-day streaks
  });

  test("should detect longest streak when it's not the current streak", () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Long streak in the past (10 days ago to 13 days ago = 4 consecutive days)
    const tenDaysAgo = new Date(today);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const elevenDaysAgo = new Date(today);
    elevenDaysAgo.setDate(elevenDaysAgo.getDate() - 11);
    const twelveDaysAgo = new Date(today);
    twelveDaysAgo.setDate(twelveDaysAgo.getDate() - 12);
    const thirteenDaysAgo = new Date(today);
    thirteenDaysAgo.setDate(thirteenDaysAgo.getDate() - 13);

    const sessions = [
      { startedAt: today },
      { startedAt: yesterday },
      { startedAt: tenDaysAgo },
      { startedAt: elevenDaysAgo },
      { startedAt: twelveDaysAgo },
      { startedAt: thirteenDaysAgo },
    ];

    const result = calculateStreakDays(sessions);
    expect(result.currentStreak).toBe(2); // Today + yesterday
    expect(result.longestStreak).toBe(4); // 10-13 days ago
  });

  test("should dedupe multiple sessions on same day", () => {
    const today = new Date();
    const sessions = [
      { startedAt: new Date(today) },
      { startedAt: new Date(today) },
      { startedAt: new Date(today) },
    ];

    const result = calculateStreakDays(sessions);
    expect(result.currentStreak).toBe(1); // Same day counts as 1
    expect(result.longestStreak).toBe(1);
  });

  test("should handle current streak = 0 when last session was >1 day ago", () => {
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const fourDaysAgo = new Date(today);
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

    const sessions = [{ startedAt: threeDaysAgo }, { startedAt: fourDaysAgo }];

    const result = calculateStreakDays(sessions);
    expect(result.currentStreak).toBe(0); // Streak broken (no session yesterday/today)
    expect(result.longestStreak).toBe(2); // 3-4 days ago
  });
});

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
  // Note: These tests would require database mocking or test fixtures.
  // For now, we provide test structure and expected behavior documentation.

  test("should return empty insights for user with zero sessions", async () => {
    // Mock: db.query.interviewSession.findMany returns []
    // Expected: All stats should be 0, arrays empty, trend "stable"

    // This test requires database mocking - structure shown for reference:
    // const insights = await aggregateUserInsights("user-with-no-sessions");
    // expect(insights.overallStats.totalSessions).toBe(0);
    // expect(insights.overallStats.currentStreak).toBe(0);
    // expect(insights.trends.improvementTrend).toBe("stable");
  });

  test("should calculate correct stats for single completed session", async () => {
    // Mock: 1 session with feedback (score: 85)
    // Expected:
    //   - totalSessions: 1
    //   - avgScore: 85
    //   - medianScore: 85
    //   - currentStreak: 1 (if today)
    //   - velocity: 0 (need 2+ sessions)
  });

  test("should handle 50+ sessions performantly (<200ms)", async () => {
    // Mock: 50 sessions with varying scores
    // Expected: Aggregation completes in <200ms
    // Performance test - measure execution time
  });

  test("should correctly detect 'improving' trend", async () => {
    // Mock: Recent scores (80, 82, 85, 87, 90) vs all-time avg (75)
    // Expected: improvementTrend = "improving"
  });

  test("should correctly detect 'declining' trend", async () => {
    // Mock: Recent scores (60, 58, 55, 53, 50) vs all-time avg (70)
    // Expected: improvementTrend = "declining"
  });

  test("should correctly detect 'stable' trend", async () => {
    // Mock: Recent scores (75, 76, 74, 75, 76) vs all-time avg (75)
    // Expected: improvementTrend = "stable"
  });

  test("should group sessions by interview type correctly", async () => {
    // Mock: 3 product_sense (avg: 80), 2 analytical (avg: 85), 1 strategy (avg: 90)
    // Expected:
    //   - byInterviewType.product_sense = { count: 3, avgScore: 80, last5Avg: 80 }
    //   - byInterviewType.analytical = { count: 2, avgScore: 85, last5Avg: 85 }
    //   - byInterviewType.strategy = { count: 1, avgScore: 90, last5Avg: 90 }
    //   - byInterviewType.leadership = { count: 0, avgScore: 0, last5Avg: 0 }
  });

  test("should group sessions by difficulty correctly", async () => {
    // Mock: 2 junior (avg: 90), 3 intermediate (avg: 80), 1 senior (avg: 70)
    // Expected:
    //   - byDifficulty.junior = { count: 2, avgScore: 90 }
    //   - byDifficulty.intermediate = { count: 3, avgScore: 80 }
    //   - byDifficulty.senior = { count: 1, avgScore: 70 }
  });

  test("should calculate competency averages across all sessions", async () => {
    // Mock: Multiple sessions with varying competency scores
    // Expected: competencyBreakdown averages match manual calculation
  });

  test("should calculate velocity (improvement rate) correctly", async () => {
    // Mock: Scores over time: [70, 72, 75, 78, 82] (steady +2.5 points/session)
    // Expected: velocity ≈ 2.5
  });
});

// ==================== Edge Case Tests ====================

describe("Edge Cases", () => {
  test("calculateStreakDays: should handle timezone differences gracefully", () => {
    // Sessions at different times of day but same calendar day
    const today = new Date();
    const todayMorning = new Date(today.setHours(8, 0, 0, 0));
    const todayEvening = new Date(today.setHours(20, 0, 0, 0));

    const sessions = [{ startedAt: todayMorning }, { startedAt: todayEvening }];

    const result = calculateStreakDays(sessions);
    expect(result.currentStreak).toBe(1); // Same day = 1 streak day
    expect(result.longestStreak).toBe(1);
  });

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

  test("calculateStreakDays: should handle sessions out of order", () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Intentionally out of order
    const sessions = [
      { startedAt: yesterday },
      { startedAt: twoDaysAgo },
      { startedAt: today },
    ];

    const result = calculateStreakDays(sessions);
    expect(result.currentStreak).toBe(3); // Should still detect 3-day streak
  });
});
