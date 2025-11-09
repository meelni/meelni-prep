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
  const sessionsWithFeedback = sessions.filter((s) => s.feedback);

  if (sessionsWithFeedback.length === 0) {
    return [];
  }

  const totals = sessionsWithFeedback.reduce(
    (acc, session) => {
      const fb = session.feedback!;
      return {
        structure: acc.structure + (fb.structureScore || 0),
        clarity: acc.clarity + (fb.clarityScore || 0),
        insight: acc.insight + (fb.insightScore || 0),
        communication: acc.communication + (fb.communicationScore || 0),
        leadership: acc.leadership + (fb.leadershipScore || 0),
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
    if (!session.feedback?.overallScore) return acc;

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
    yourScore: (data.total / data.count) * 20, // 1-5 → 0-100 scale
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
