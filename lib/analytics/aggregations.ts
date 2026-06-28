/**
 * Data aggregation utilities for dashboard charts
 * Transforms raw session/feedback data into chart-ready formats
 */

import { format, differenceInMinutes, startOfWeek, startOfMonth } from "date-fns";

export interface SessionWithFeedback {
  id: string;
  roundType: string;
  startedAt: Date;
  endedAt: Date | null;
  config?: {
    difficulty?: string;
    [key: string]: unknown;
  }; // JSONB field containing difficulty and other settings
  feedback: {
    overallScore: number;
    structureScore: number;
    clarityScore: number;
    insightScore: number;
    communicationScore: number;
    leadershipScore: number;
  } | null;
}

/**
 * Performance Trend: Transform sessions into time-series data for ClippedAreaChart
 * Converts 1-5 scores to 0-100 scale for better visualization
 */
export function aggregatePerformanceTrend(
  sessions: SessionWithFeedback[],
  limit = 30
) {
  return sessions
    .filter((s) => s.feedback?.overallScore)
    .slice(0, limit)
    .reverse() // Show chronological order
    .map((session) => ({
      date: format(session.startedAt, "MMM d"),
      fullDate: session.startedAt,
      score: (session.feedback!.overallScore * 20), // 1-5 → 0-100 scale
      sessionId: session.id,
      roundType: session.roundType,
    }));
}

/**
 * Competency Breakdown: Calculate average scores for radar chart
 */
export function aggregateCompetencyScores(sessions: SessionWithFeedback[]) {
  // Filter to sessions with feedback AND dimension scores populated
  const sessionsWithFeedback = sessions.filter(
    (s) =>
      s.feedback &&
      s.feedback.structureScore !== null &&
      s.feedback.structureScore !== undefined
  );

  if (sessionsWithFeedback.length === 0) {
    return [];
  }

  const totals = sessionsWithFeedback.reduce(
    (acc, session) => {
      const fb = session.feedback!;
      return {
        structure: acc.structure + (fb.structureScore ?? 0),
        clarity: acc.clarity + (fb.clarityScore ?? 0),
        insight: acc.insight + (fb.insightScore ?? 0),
        communication: acc.communication + (fb.communicationScore ?? 0),
        leadership: acc.leadership + (fb.leadershipScore ?? 0),
      };
    },
    { structure: 0, clarity: 0, insight: 0, communication: 0, leadership: 0 }
  );

  const count = sessionsWithFeedback.length;

  return [
    { competency: "Structure", score: (totals.structure / count) * 20 }, // 1-5 → 0-100
    { competency: "Clarity", score: (totals.clarity / count) * 20 },
    { competency: "Insight", score: (totals.insight / count) * 20 },
    { competency: "Communication", score: (totals.communication / count) * 20 },
    { competency: "Leadership", score: (totals.leadership / count) * 20 },
  ];
}

/**
 * Interview Type Distribution: Count sessions by type for pie chart
 */
export function aggregateTypeDistribution(sessions: SessionWithFeedback[]) {
  const typeCounts = sessions.reduce((acc, session) => {
    const type = session.roundType;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const typeLabels: Record<string, string> = {
    product_sense: "Product Sense",
    execution: "Analytical",
    behavioral: "Leadership",
    strategy: "Strategy",
  };

  const typeColors: Record<string, string> = {
    product_sense: "var(--chart-1)",
    execution: "var(--chart-2)",
    behavioral: "var(--chart-3)",
    strategy: "var(--chart-4)",
  };

  return Object.entries(typeCounts).map(([type, count]) => ({
    type: typeLabels[type] || type,
    count,
    fill: typeColors[type] || "var(--chart-5)",
  }));
}

/**
 * Time Investment: Group sessions by week and calculate total minutes
 */
export function aggregateTimeInvestment(
  sessions: SessionWithFeedback[],
  groupBy: "week" | "month" = "week"
) {
  const completedSessions = sessions.filter(
    (s) => s.endedAt && s.startedAt
  );

  const grouped = completedSessions.reduce((acc, session) => {
    const key =
      groupBy === "week"
        ? format(startOfWeek(session.startedAt), "MMM d")
        : format(startOfMonth(session.startedAt), "MMM yyyy");

    if (!acc[key]) {
      acc[key] = { sessions: [], minutes: 0 };
    }

    const minutes = differenceInMinutes(session.endedAt!, session.startedAt);
    acc[key].sessions.push(session);
    acc[key].minutes += minutes;

    return acc;
  }, {} as Record<string, { sessions: SessionWithFeedback[]; minutes: number }>);

  return Object.entries(grouped)
    .map(([period, data]) => ({
      period,
      minutes: data.minutes,
      sessionCount: data.sessions.length,
    }))
    .sort((a, b) => {
      // Sort chronologically (would need better date parsing for production)
      return a.period.localeCompare(b.period);
    });
}

/**
 * Score by Interview Type: Calculate average scores per type
 */
export function aggregateScoreByType(sessions: SessionWithFeedback[]) {
  const typeScores = sessions.reduce((acc, session) => {
    // Explicit null/undefined check to handle 0 scores correctly
    if (session.feedback?.overallScore === null || session.feedback?.overallScore === undefined) return acc;

    const type = session.roundType;
    if (!acc[type]) {
      acc[type] = { total: 0, count: 0 };
    }

    acc[type].total += session.feedback.overallScore;
    acc[type].count += 1;

    return acc;
  }, {} as Record<string, { total: number; count: number }>);

  const typeLabels: Record<string, string> = {
    product_sense: "Product Sense",
    execution: "Analytical",
    behavioral: "Leadership",
    strategy: "Strategy",
  };

  return Object.entries(typeScores).map(([type, data]) => ({
    type: typeLabels[type] || type,
    yourScore: (data.total / data.count) * 10, // 0-10 → 0-100 scale
    avgScore: 72, // Placeholder - would come from platform aggregates
  }));
}

/**
 * Calculate summary statistics for dashboard overview
 */
export function calculateSummaryStats(sessions: SessionWithFeedback[]) {
  const completedSessions = sessions.filter((s) => s.feedback);
  const totalSessions = sessions.length;

  if (completedSessions.length === 0) {
    return {
      totalSessions,
      avgScore: 0,
      totalMinutes: 0,
      completionRate: 0,
    };
  }

  const totalScore = completedSessions.reduce(
    (sum, s) => sum + (s.feedback?.overallScore || 0),
    0
  );
  const avgScore = totalScore / completedSessions.length;

  const totalMinutes = sessions
    .filter((s) => s.endedAt)
    .reduce((sum, s) => {
      return sum + differenceInMinutes(s.endedAt!, s.startedAt);
    }, 0);

  const completionRate =
    sessions.length > 0
      ? (completedSessions.length / sessions.length) * 100
      : 0;

  return {
    totalSessions,
    avgScore: Number(avgScore.toFixed(1)),
    totalMinutes,
    completionRate: Number(completionRate.toFixed(0)),
  };
}

/**
 * Score by Difficulty: Calculate average scores per difficulty level
 * PRAC-003: Track performance at different difficulty levels
 */
export function aggregateScoreByDifficulty(sessions: SessionWithFeedback[]) {
  // Filter sessions with feedback and difficulty in config
  const sessionsWithDifficulty = sessions.filter(
    (s): s is SessionWithFeedback & { config: { difficulty: string } } =>
      s.feedback?.overallScore !== null &&
      s.feedback?.overallScore !== undefined &&
      typeof s.config?.difficulty === "string"
  );

  // Group by difficulty and calculate averages
  const difficultyScores = sessionsWithDifficulty.reduce((acc, session) => {
    const difficulty = session.config.difficulty;
    const score = session.feedback!.overallScore;

    if (!acc[difficulty]) {
      acc[difficulty] = { total: 0, count: 0 };
    }

    acc[difficulty].total += score;
    acc[difficulty].count += 1;

    return acc;
  }, {} as Record<string, { total: number; count: number }>);

  // Map difficulty keys to display labels
  const difficultyLabels: Record<string, string> = {
    beginner: "Junior/APM",
    intermediate: "IC PM",
    advanced: "Senior PM",
  };

  // Return chart data with average scores (0-100 scale)
  return Object.entries(difficultyScores).map(([difficulty, data]) => ({
    difficulty: difficultyLabels[difficulty] || difficulty,
    difficultyKey: difficulty,
    avgScore: (data.total / data.count) * 20, // 1-5 → 0-100 scale
    sessionCount: data.count,
  }));
}

/**
 * Recommended Difficulty: Calculate recommended next difficulty based on recent scores
 * PRAC-003: Help users level up as they improve
 *
 * Logic:
 * - Look at last 3 sessions for current difficulty
 * - If average score >= 4.0 (80%) → recommend level up
 * - If average score <= 2.5 (50%) → recommend level down
 * - Otherwise → stay at current level
 */
export function calculateRecommendedDifficulty(sessions: SessionWithFeedback[]): {
  recommended: string;
  currentDifficulty: string | null;
  avgScore: number | null;
  reason: string;
} {
  // Get sessions with feedback and difficulty, sorted by date (newest first)
  const sessionsWithDifficulty = sessions
    .filter(
      (s): s is SessionWithFeedback & { config: { difficulty: string } } =>
        s.feedback?.overallScore !== null &&
        s.feedback?.overallScore !== undefined &&
        typeof s.config?.difficulty === "string"
    )
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  // No data yet
  if (sessionsWithDifficulty.length === 0) {
    return {
      recommended: "intermediate",
      currentDifficulty: null,
      avgScore: null,
      reason: "Start with intermediate level",
    };
  }

  // Get current difficulty from most recent session
  const firstSession = sessionsWithDifficulty[0];
  const currentDifficulty = firstSession.config.difficulty;

  // Get last 3 sessions for current difficulty
  const recentSessionsAtCurrentLevel = sessionsWithDifficulty
    .filter((s) => s.config.difficulty === currentDifficulty)
    .slice(0, 3);

  // Need at least 3 sessions to make recommendation
  if (recentSessionsAtCurrentLevel.length < 3) {
    return {
      recommended: currentDifficulty,
      currentDifficulty,
      avgScore: null,
      reason: `Complete ${3 - recentSessionsAtCurrentLevel.length} more session(s) at current level`,
    };
  }

  // Calculate average score (1-5 scale)
  const avgScore =
    recentSessionsAtCurrentLevel.reduce(
      (sum, s) => sum + s.feedback!.overallScore,
      0
    ) / recentSessionsAtCurrentLevel.length;

  // Difficulty progression: beginner → intermediate → advanced
  const difficultyOrder = ["beginner", "intermediate", "advanced"];
  const currentIndex = difficultyOrder.indexOf(currentDifficulty);

  // Level up: avg >= 4.0 (80%)
  if (avgScore >= 4.0 && currentIndex < difficultyOrder.length - 1) {
    const nextLevel = difficultyOrder[currentIndex + 1] ?? currentDifficulty;
    return {
      recommended: nextLevel,
      currentDifficulty,
      avgScore,
      reason: `Great performance! Ready to level up (avg: ${avgScore.toFixed(1)}/5)`,
    };
  }

  // Level down: avg <= 2.5 (50%)
  if (avgScore <= 2.5 && currentIndex > 0) {
    const prevLevel = difficultyOrder[currentIndex - 1] ?? currentDifficulty;
    return {
      recommended: prevLevel,
      currentDifficulty,
      avgScore,
      reason: `Consider stepping down for better learning (avg: ${avgScore.toFixed(1)}/5)`,
    };
  }

  // Stay at current level
  return {
    recommended: currentDifficulty,
    currentDifficulty,
    avgScore,
    reason: `Keep practicing at current level (avg: ${avgScore.toFixed(1)}/5)`,
  };
}
