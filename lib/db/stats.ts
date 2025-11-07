import { db } from "./index";
import { interviewSession, feedback } from "./schema";
import { eq, desc, and, sql, gte } from "drizzle-orm";

export interface UserStats {
  totalSessions: number;
  avgScore: number | null;
  totalMinutes: number;
  completionRate: number;
}

export interface TrendData {
  sessionsTrend: number;
  scoreTrend: number;
  minutesTrend: number;
  completionRateTrend: number;
}

export interface MilestoneData {
  hasStreak: boolean;
  hasPerfectScore: boolean;
  isImproving: boolean;
  isConsistent: boolean;
}

export interface FeedbackScores {
  structure: (number | null)[];
  clarity: (number | null)[];
  insight: (number | null)[];
  communication: (number | null)[];
  leadership: (number | null)[];
  overall: number[];
  dates: string[];
}

/**
 * Get user statistics with real feedback scores
 */
export async function getUserStatsWithFeedback(userId: string): Promise<UserStats> {
  // Get all sessions for the user
  const allSessions = await db
    .select({
      id: interviewSession.id,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
    })
    .from(interviewSession)
    .where(eq(interviewSession.userId, userId));

  const totalSessions = allSessions.length;
  const completedSessions = allSessions.filter((s) => s.endedAt !== null);

  // Calculate total minutes from completed sessions
  const totalMinutes = completedSessions.reduce((sum, session) => {
    if (session.startedAt && session.endedAt) {
      const durationMs =
        new Date(session.endedAt).getTime() -
        new Date(session.startedAt).getTime();
      const durationMinutes = Math.round(durationMs / 60000);
      return sum + durationMinutes;
    }
    return sum;
  }, 0);

  // Calculate completion rate
  const completionRate =
    totalSessions > 0
      ? Math.round((completedSessions.length / totalSessions) * 100)
      : 0;

  // Get average score from feedback table (only for completed sessions with feedback)
  const feedbackScores = await db
    .select({
      overallScore: feedback.overallScore,
    })
    .from(feedback)
    .innerJoin(interviewSession, eq(feedback.sessionId, interviewSession.id))
    .where(eq(interviewSession.userId, userId));

  const avgScore =
    feedbackScores.length > 0
      ? feedbackScores.reduce((sum, f) => sum + parseFloat(f.overallScore || "0"), 0) / feedbackScores.length
      : null;

  return {
    totalSessions,
    avgScore,
    totalMinutes,
    completionRate,
  };
}

/**
 * Get week-over-week trend data
 */
export async function getUserTrends(userId: string): Promise<TrendData> {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Get current week sessions
  const currentWeekSessions = await db
    .select({
      id: interviewSession.id,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
    })
    .from(interviewSession)
    .where(
      and(
        eq(interviewSession.userId, userId),
        gte(interviewSession.startedAt, oneWeekAgo)
      )
    );

  // Get previous week sessions
  const previousWeekSessions = await db
    .select({
      id: interviewSession.id,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
    })
    .from(interviewSession)
    .where(
      and(
        eq(interviewSession.userId, userId),
        gte(interviewSession.startedAt, twoWeeksAgo),
        sql`${interviewSession.startedAt} < ${oneWeekAgo}`
      )
    );

  // Calculate session counts
  const currentCount = currentWeekSessions.length;
  const previousCount = previousWeekSessions.length;
  const sessionsTrend = previousCount > 0
    ? ((currentCount - previousCount) / previousCount) * 100
    : 0;

  // Calculate minutes
  const currentMinutes = currentWeekSessions
    .filter(s => s.endedAt && s.startedAt)
    .reduce((sum, s) => {
      const duration = new Date(s.endedAt!).getTime() - new Date(s.startedAt!).getTime();
      return sum + Math.round(duration / 60000);
    }, 0);

  const previousMinutes = previousWeekSessions
    .filter(s => s.endedAt && s.startedAt)
    .reduce((sum, s) => {
      const duration = new Date(s.endedAt!).getTime() - new Date(s.startedAt!).getTime();
      return sum + Math.round(duration / 60000);
    }, 0);

  const minutesTrend = previousMinutes > 0
    ? ((currentMinutes - previousMinutes) / previousMinutes) * 100
    : 0;

  // Calculate completion rates
  const currentCompletionRate = currentCount > 0
    ? (currentWeekSessions.filter(s => s.endedAt).length / currentCount) * 100
    : 0;

  const previousCompletionRate = previousCount > 0
    ? (previousWeekSessions.filter(s => s.endedAt).length / previousCount) * 100
    : 0;

  const completionRateTrend = previousCompletionRate > 0
    ? ((currentCompletionRate - previousCompletionRate) / previousCompletionRate) * 100
    : 0;

  // Get feedback scores for trend calculation
  const currentWeekFeedback = await db
    .select({ overallScore: feedback.overallScore })
    .from(feedback)
    .innerJoin(interviewSession, eq(feedback.sessionId, interviewSession.id))
    .where(
      and(
        eq(interviewSession.userId, userId),
        gte(interviewSession.startedAt, oneWeekAgo)
      )
    );

  const previousWeekFeedback = await db
    .select({ overallScore: feedback.overallScore })
    .from(feedback)
    .innerJoin(interviewSession, eq(feedback.sessionId, interviewSession.id))
    .where(
      and(
        eq(interviewSession.userId, userId),
        gte(interviewSession.startedAt, twoWeeksAgo),
        sql`${interviewSession.startedAt} < ${oneWeekAgo}`
      )
    );

  const currentAvgScore = currentWeekFeedback.length > 0
    ? currentWeekFeedback.reduce((sum, f) => sum + parseFloat(f.overallScore || "0"), 0) / currentWeekFeedback.length
    : 0;

  const previousAvgScore = previousWeekFeedback.length > 0
    ? previousWeekFeedback.reduce((sum, f) => sum + parseFloat(f.overallScore || "0"), 0) / previousWeekFeedback.length
    : 0;

  const scoreTrend = previousAvgScore > 0
    ? ((currentAvgScore - previousAvgScore) / previousAvgScore) * 100
    : 0;

  return {
    sessionsTrend,
    scoreTrend,
    minutesTrend,
    completionRateTrend,
  };
}

/**
 * Get milestone achievements
 */
export async function getUserMilestones(userId: string): Promise<MilestoneData> {
  // Get all sessions with feedback
  const sessionsWithFeedback = await db
    .select({
      sessionId: interviewSession.id,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
      overallScore: feedback.overallScore,
    })
    .from(interviewSession)
    .leftJoin(feedback, eq(interviewSession.id, feedback.sessionId))
    .where(eq(interviewSession.userId, userId))
    .orderBy(desc(interviewSession.startedAt));

  const totalSessions = sessionsWithFeedback.length;
  const completedSessions = sessionsWithFeedback.filter(s => s.endedAt);

  // Check for 5-session streak (5 consecutive days)
  let hasStreak = false;
  if (completedSessions.length >= 5) {
    const dates = completedSessions
      .filter(s => s.startedAt !== null)
      .map(s => {
        const date = new Date(s.startedAt!);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      });
    const uniqueDates = [...new Set(dates)].sort().reverse();

    // Check if we have 5 consecutive days
    if (uniqueDates.length >= 5) {
      let consecutiveDays = 1;
      for (let i = 0; i < uniqueDates.length - 1; i++) {
        const current = new Date(uniqueDates[i]);
        const next = new Date(uniqueDates[i + 1]);
        const diffDays = Math.floor((current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          consecutiveDays++;
          if (consecutiveDays >= 5) {
            hasStreak = true;
            break;
          }
        } else {
          consecutiveDays = 1;
        }
      }
    }
  }

  // Check for perfect score (≥ 90)
  const hasPerfectScore = sessionsWithFeedback.some(s =>
    s.overallScore && parseFloat(s.overallScore || "0") >= 9.0
  );

  // Check for improving trend (3 consecutive sessions with increasing scores)
  let isImproving = false;
  const recentScores = sessionsWithFeedback
    .filter(s => s.overallScore)
    .slice(0, 3)
    .map(s => parseFloat(s.overallScore!))
    .reverse(); // oldest to newest

  if (recentScores.length >= 3) {
    isImproving = recentScores[0] < recentScores[1] && recentScores[1] < recentScores[2];
  }

  // Check for consistent (10+ sessions)
  const isConsistent = totalSessions >= 10;

  return {
    hasStreak,
    hasPerfectScore,
    isImproving,
    isConsistent,
  };
}

/**
 * Get feedback scores over time for charts
 */
export async function getUserFeedbackScores(userId: string, limit = 10): Promise<FeedbackScores> {
  const sessionsWithFeedback = await db
    .select({
      startedAt: interviewSession.startedAt,
      structureScore: feedback.structureScore,
      clarityScore: feedback.clarityScore,
      insightScore: feedback.insightScore,
      communicationScore: feedback.communicationScore,
      leadershipScore: feedback.leadershipScore,
      overallScore: feedback.overallScore,
    })
    .from(feedback)
    .innerJoin(interviewSession, eq(feedback.sessionId, interviewSession.id))
    .where(eq(interviewSession.userId, userId))
    .orderBy(desc(interviewSession.startedAt))
    .limit(limit);

  // Reverse to show oldest to newest (for charts)
  const reversed = sessionsWithFeedback.reverse();

  return {
    structure: reversed.map(s => s.structureScore),
    clarity: reversed.map(s => s.clarityScore),
    insight: reversed.map(s => s.insightScore),
    communication: reversed.map(s => s.communicationScore),
    leadership: reversed.map(s => s.leadershipScore),
    overall: reversed.map(s => parseFloat(s.overallScore || "0")),
    dates: reversed.map(s =>
      new Date(s.startedAt || new Date()).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    ),
  };
}
