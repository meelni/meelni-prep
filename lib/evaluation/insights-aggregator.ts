/**
 * Insights Aggregation Engine
 * P2-002: Calculates user analytics from session/feedback data
 *
 * This module aggregates raw session and feedback data into structured insights
 * for the user dashboard. It calculates overall stats, trends, and competency
 * breakdowns.
 */

import { db } from "@/lib/db";
import { interviewSession } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCompletedFeedbackScore } from "@meelni/core";

/**
 * Complete user insights data structure (matches userInsights JSONB schema)
 */
export interface UserInsights {
  userId: string;
  overallStats: {
    totalSessions: number;
    completedSessions: number;
    totalMinutes: number;
    avgScore: number;
    medianScore: number;
    percentile25: number;
    percentile75: number;
    percentile90: number;
  };
  byInterviewType: {
    product_sense: InterviewTypeStats;
    analytical: InterviewTypeStats;
    leadership: InterviewTypeStats;
    strategy: InterviewTypeStats;
  };
  byDifficulty: {
    junior: DifficultyStats;
    intermediate: DifficultyStats;
    senior: DifficultyStats;
  };
  trends: {
    last5SessionsAvg: number;
    allTimeAvg: number;
    improvementTrend: "improving" | "stable" | "declining";
    velocity: number;
  };
  competencyBreakdown: {
    structure: number;
    clarity: number;
    insight: number;
    communication: number;
    leadership: number;
  };
  competencySampleSizes?: {
    structure: number;
    clarity: number;
    insight: number;
    communication: number;
    leadership: number;
  };
}

/**
 * Stats for a specific interview type
 */
export interface InterviewTypeStats {
  count: number;
  avgScore: number;
  last5Avg: number;
}

/**
 * Stats for a specific difficulty level
 */
export interface DifficultyStats {
  count: number;
  avgScore: number;
}

/**
 * Session with feedback joined
 */
interface SessionWithFeedback {
  id: string;
  userId: string;
  roundType: string;
  startedAt: Date | null;
  endedAt: Date | null;
  config: {
    difficulty?: string;
    [key: string]: unknown;
  };
  feedback: {
    status: string | null;
    overallScore: string;
    structureScore: number | null;
    clarityScore: number | null;
    insightScore: number | null;
    communicationScore: number | null;
    leadershipScore: number | null;
  } | null;
}

/**
 * Calculate complete user insights from all session/feedback data
 *
 * This is the main aggregation function that computes all metrics for
 * the user dashboard.
 *
 * @param userId - UUID of the user
 * @returns Complete insights data structure
 *
 * @example
 * ```typescript
 * const insights = await aggregateUserInsights(userId);
 * console.log(`Avg score: ${insights.overallStats.avgScore}`);
 * ```
 */
export async function aggregateUserInsights(
  userId: string
): Promise<UserInsights> {
  // Fetch all sessions for user with feedback
  const sessions = (await db.query.interviewSession.findMany({
    where: eq(interviewSession.userId, userId),
    with: {
      feedback: {
        columns: {
          status: true,
          overallScore: true,
          structureScore: true,
          clarityScore: true,
          insightScore: true,
          communicationScore: true,
          leadershipScore: true,
        },
      },
    },
    orderBy: [desc(interviewSession.startedAt)],
  })) as SessionWithFeedback[];

  // Progress claims require completed feedback with a valid rubric score.
  const completedSessions = sessions.filter(
    (session) => getCompletedFeedbackScore(session.feedback) !== null
  );

  // Handle zero sessions case
  if (completedSessions.length === 0) {
    return getEmptyInsights(userId);
  }

  // Extract scores
  const scores = completedSessions.map(
    (session) => getCompletedFeedbackScore(session.feedback)!
  );

  // Calculate overall stats
  const totalMinutes = Math.round(
    sessions.reduce((sum, s) => {
      if (!s.startedAt || !s.endedAt) return sum;
      const duration =
        new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime();
      return sum + duration / 1000 / 60;
    }, 0)
  );

  const overallStats = {
    totalSessions: sessions.length,
    completedSessions: completedSessions.length,
    totalMinutes,
    avgScore: average(scores),
    medianScore: median(scores),
    percentile25: percentile(scores, 25),
    percentile75: percentile(scores, 75),
    percentile90: percentile(scores, 90),
  };

  // Group by interview type
  const byType = groupBy(completedSessions, (s) => s.roundType);
  const byInterviewType = {
    product_sense: calculateTypeStats(byType["product_sense"] || []),
    analytical: calculateTypeStats(byType["analytical"] || []),
    leadership: calculateTypeStats(byType["leadership"] || []),
    strategy: calculateTypeStats(byType["strategy"] || []),
  };

  // Group by difficulty (from session config)
  const byDifficultyRaw = groupBy(completedSessions, (s) =>
    typeof s.config?.difficulty === "string"
      ? s.config.difficulty
      : "intermediate"
  );
  const byDifficulty = {
    junior: calculateDifficultyStats(byDifficultyRaw["junior"] || []),
    intermediate: calculateDifficultyStats(
      byDifficultyRaw["intermediate"] || []
    ),
    senior: calculateDifficultyStats(byDifficultyRaw["senior"] || []),
  };

  // Calculate trends
  const last5Scores = scores.slice(0, Math.min(5, scores.length));
  const last5SessionsAvg = average(last5Scores);
  const allTimeAvg = average(scores);
  const velocity = calculateVelocity(scores);

  const trends = {
    last5SessionsAvg,
    allTimeAvg,
    improvementTrend: detectTrend(last5SessionsAvg, allTimeAvg),
    velocity,
  };

  // Calculate competency breakdown
  const competencyBreakdown = computeAverageScores(
    completedSessions.map((s) => s.feedback!)
  );
  const competencySampleSizes = computeScoreSampleSizes(
    completedSessions.map((s) => s.feedback!)
  );

  return {
    userId,
    overallStats,
    byInterviewType,
    byDifficulty,
    trends,
    competencyBreakdown,
    competencySampleSizes,
  };
}

/**
 * Compute average scores across all 5 competencies
 *
 * @param feedbackRecords - Array of feedback objects
 * @returns Averaged competency scores
 *
 * @example
 * ```typescript
 * const avgScores = computeAverageScores(allFeedback);
 * console.log(`Avg structure: ${avgScores.structure}/100`);
 * ```
 */
export function computeAverageScores(
  feedbackRecords: {
    structureScore: number | null;
    clarityScore: number | null;
    insightScore: number | null;
    communicationScore: number | null;
    leadershipScore: number | null;
  }[]
): {
  structure: number;
  clarity: number;
  insight: number;
  communication: number;
  leadership: number;
} {
  if (feedbackRecords.length === 0) {
    return {
      structure: 0,
      clarity: 0,
      insight: 0,
      communication: 0,
      leadership: 0,
    };
  }

  const extractScores = (field: keyof (typeof feedbackRecords)[0]) =>
    feedbackRecords
      .map((f) => f[field])
      .filter((score): score is number => score !== null);

  return {
    structure: average(extractScores("structureScore")),
    clarity: average(extractScores("clarityScore")),
    insight: average(extractScores("insightScore")),
    communication: average(extractScores("communicationScore")),
    leadership: average(extractScores("leadershipScore")),
  };
}

export function computeScoreSampleSizes(
  feedbackRecords: {
    structureScore: number | null;
    clarityScore: number | null;
    insightScore: number | null;
    communicationScore: number | null;
    leadershipScore: number | null;
  }[]
) {
  const count = (field: keyof (typeof feedbackRecords)[number]) =>
    feedbackRecords.filter((feedback) => feedback[field] !== null).length;

  return {
    structure: count("structureScore"),
    clarity: count("clarityScore"),
    insight: count("insightScore"),
    communication: count("communicationScore"),
    leadership: count("leadershipScore"),
  };
}

// ==================== Helper Functions ====================

/**
 * Group array elements by a key function
 */
function groupBy<T>(
  array: T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const key = keyFn(item);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Calculate average of numbers
 */
function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sum = numbers.reduce((a, b) => a + b, 0);
  return Math.round((sum / numbers.length) * 100) / 100;
}

/**
 * Calculate median of numbers
 */
function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate percentile of numbers
 */
function percentile(numbers: number[], p: number): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return sorted[lower];
  }
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Detect improvement trend
 */
function detectTrend(
  recent: number,
  allTime: number
): "improving" | "stable" | "declining" {
  const delta = recent - allTime;
  if (delta > 0.5) return "improving";
  if (delta < -0.5) return "declining";
  return "stable";
}

/**
 * Calculate velocity (linear regression slope)
 */
function calculateVelocity(scores: number[]): number {
  if (scores.length < 2) return 0;

  // Simple linear regression slope
  const n = scores.length;
  const scoresOldestFirst = [...scores].reverse(); // reverse to get oldest→newest
  const x = Array.from({ length: n }, (_, i) => i);
  const y = scoresOldestFirst;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return Math.round(slope * 100) / 100;
}

/**
 * Calculate stats for a specific interview type
 */
function calculateTypeStats(
  sessions: SessionWithFeedback[]
): InterviewTypeStats {
  if (sessions.length === 0) {
    return { count: 0, avgScore: 0, last5Avg: 0 };
  }

  const scores = sessions.map((s) => parseFloat(s.feedback!.overallScore));
  const last5Scores = scores.slice(0, Math.min(5, scores.length));

  return {
    count: sessions.length,
    avgScore: average(scores),
    last5Avg: average(last5Scores),
  };
}

/**
 * Calculate stats for a specific difficulty level
 */
function calculateDifficultyStats(
  sessions: SessionWithFeedback[]
): DifficultyStats {
  if (sessions.length === 0) {
    return { count: 0, avgScore: 0 };
  }

  const scores = sessions.map((s) => parseFloat(s.feedback!.overallScore));

  return {
    count: sessions.length,
    avgScore: average(scores),
  };
}

/**
 * Return empty insights for users with no sessions
 */
function getEmptyInsights(userId: string): UserInsights {
  return {
    userId,
    overallStats: {
      totalSessions: 0,
      completedSessions: 0,
      totalMinutes: 0,
      avgScore: 0,
      medianScore: 0,
      percentile25: 0,
      percentile75: 0,
      percentile90: 0,
    },
    byInterviewType: {
      product_sense: { count: 0, avgScore: 0, last5Avg: 0 },
      analytical: { count: 0, avgScore: 0, last5Avg: 0 },
      leadership: { count: 0, avgScore: 0, last5Avg: 0 },
      strategy: { count: 0, avgScore: 0, last5Avg: 0 },
    },
    byDifficulty: {
      junior: { count: 0, avgScore: 0 },
      intermediate: { count: 0, avgScore: 0 },
      senior: { count: 0, avgScore: 0 },
    },
    trends: {
      last5SessionsAvg: 0,
      allTimeAvg: 0,
      improvementTrend: "stable",
      velocity: 0,
    },
    competencyBreakdown: {
      structure: 0,
      clarity: 0,
      insight: 0,
      communication: 0,
      leadership: 0,
    },
    competencySampleSizes: {
      structure: 0,
      clarity: 0,
      insight: 0,
      communication: 0,
      leadership: 0,
    },
  };
}
