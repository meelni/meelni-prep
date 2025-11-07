/**
 * User Statistics Query Module
 *
 * Provides database query functions for fetching user statistics,
 * trends, milestones, and activity data for the dashboard.
 *
 * @module lib/db/queries/user-stats
 */

import { db } from "../index";
import { interviewSession, feedback, transcriptTurn } from "../schema";
import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";

/**
 * User session summary statistics
 */
export interface UserSessionSummary {
  totalSessions: number;
  avgScore: number;
  totalMinutes: number;
  completionRate: number;
}

/**
 * Weekly trend comparison data
 */
export interface UserWeeklyTrend {
  sessionsChange: number | null;
  scoreChange: number | null;
  minutesChange: number | null;
}

/**
 * User milestone achievement flags
 */
export interface UserMilestones {
  fiveSessionStreak: boolean;
  perfectScore: boolean;
  improving: boolean;
  consistent: boolean;
}

/**
 * Recent activity item
 */
export interface UserActivityItem {
  sessionId: string;
  type: string;
  score: number | null;
  timestamp: Date;
}

/**
 * Get user session summary statistics
 *
 * Calculates total sessions, average score, total minutes, and completion rate
 * for a given user. Handles edge cases for new users with no sessions.
 *
 * @param userId - User UUID from Supabase Auth
 * @returns User session summary statistics
 */
export async function getUserSessionSummary(
  userId: string
): Promise<UserSessionSummary> {
  try {
    // Get all sessions for user
    const sessions = await db
      .select({
        id: interviewSession.id,
        startedAt: interviewSession.startedAt,
        endedAt: interviewSession.endedAt,
      })
      .from(interviewSession)
      .where(eq(interviewSession.userId, userId));

    const totalSessions = sessions.length;

    // Handle edge case: new user with no sessions
    if (totalSessions === 0) {
      return {
        totalSessions: 0,
        avgScore: 0,
        totalMinutes: 0,
        completionRate: 0,
      };
    }

    // Get feedback scores for all sessions
    const sessionIds = sessions.map((s) => s.id);
    const scores = await db
      .select({
        sessionId: feedback.sessionId,
        overallScore: feedback.overallScore,
      })
      .from(feedback)
      .where(
        sql`${feedback.sessionId} IN (${sql.join(
          sessionIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );

    // Calculate average score (only for sessions with feedback)
    const validScores = scores
      .filter((s) => s.overallScore !== null)
      .map((s) => parseFloat(s.overallScore as string));

    const avgScore =
      validScores.length > 0
        ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
        : 0;

    // Calculate total minutes from transcript turns
    const transcripts = await db
      .select({
        audioMs: transcriptTurn.audioMs,
      })
      .from(transcriptTurn)
      .where(
        sql`${transcriptTurn.sessionId} IN (${sql.join(
          sessionIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );

    const totalMs = transcripts.reduce(
      (sum, t) => sum + (t.audioMs || 0),
      0
    );
    const totalMinutes = Math.round(totalMs / 60000);

    // Calculate completion rate (sessions with endedAt set)
    const completedSessions = sessions.filter((s) => s.endedAt !== null).length;
    const completionRate =
      totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;

    return {
      totalSessions,
      avgScore: Math.round(avgScore * 10) / 10, // Round to 1 decimal place
      totalMinutes,
      completionRate: Math.round(completionRate),
    };
  } catch (error) {
    console.error("Error fetching user session summary:", error);
    // Return safe defaults on error
    return {
      totalSessions: 0,
      avgScore: 0,
      totalMinutes: 0,
      completionRate: 0,
    };
  }
}

/**
 * Get user weekly trend comparison
 *
 * Compares current week (last 7 days) vs previous week (days 8-14)
 * for sessions count, average score, and total minutes. Returns null
 * for metrics if insufficient historical data.
 *
 * @param userId - User UUID from Supabase Auth
 * @returns Weekly trend comparison percentages
 */
export async function getUserWeeklyTrend(
  userId: string
): Promise<UserWeeklyTrend> {
  try {
    const now = new Date();
    const currentWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previousWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Get current week sessions
    const currentWeekSessions = await db
      .select({
        id: interviewSession.id,
        startedAt: interviewSession.startedAt,
      })
      .from(interviewSession)
      .where(
        and(
          eq(interviewSession.userId, userId),
          gte(interviewSession.startedAt, currentWeekStart)
        )
      );

    // Get previous week sessions
    const previousWeekSessions = await db
      .select({
        id: interviewSession.id,
        startedAt: interviewSession.startedAt,
      })
      .from(interviewSession)
      .where(
        and(
          eq(interviewSession.userId, userId),
          gte(interviewSession.startedAt, previousWeekStart),
          lte(interviewSession.startedAt, currentWeekStart)
        )
      );

    // Session count trend
    const currentWeekCount = currentWeekSessions.length;
    const previousWeekCount = previousWeekSessions.length;
    const sessionsChange =
      previousWeekCount > 0
        ? Math.round(
            ((currentWeekCount - previousWeekCount) / previousWeekCount) * 100
          )
        : currentWeekCount > 0
        ? 100
        : null;

    // Score trend
    let scoreChange: number | null = null;
    if (currentWeekSessions.length > 0 && previousWeekSessions.length > 0) {
      const currentWeekScores = await db
        .select({
          overallScore: feedback.overallScore,
        })
        .from(feedback)
        .where(
          sql`${feedback.sessionId} IN (${sql.join(
            currentWeekSessions.map((s) => sql`${s.id}`),
            sql`, `
          )})`
        );

      const previousWeekScores = await db
        .select({
          overallScore: feedback.overallScore,
        })
        .from(feedback)
        .where(
          sql`${feedback.sessionId} IN (${sql.join(
            previousWeekSessions.map((s) => sql`${s.id}`),
            sql`, `
          )})`
        );

      const currentAvg =
        currentWeekScores.length > 0
          ? currentWeekScores.reduce(
              (sum, s) => sum + parseFloat(s.overallScore as string),
              0
            ) / currentWeekScores.length
          : 0;

      const previousAvg =
        previousWeekScores.length > 0
          ? previousWeekScores.reduce(
              (sum, s) => sum + parseFloat(s.overallScore as string),
              0
            ) / previousWeekScores.length
          : 0;

      if (previousAvg > 0) {
        scoreChange = Math.round(((currentAvg - previousAvg) / previousAvg) * 100);
      }
    }

    // Minutes trend
    let minutesChange: number | null = null;
    if (currentWeekSessions.length > 0 && previousWeekSessions.length > 0) {
      const currentWeekTranscripts = await db
        .select({
          audioMs: transcriptTurn.audioMs,
        })
        .from(transcriptTurn)
        .where(
          sql`${transcriptTurn.sessionId} IN (${sql.join(
            currentWeekSessions.map((s) => sql`${s.id}`),
            sql`, `
          )})`
        );

      const previousWeekTranscripts = await db
        .select({
          audioMs: transcriptTurn.audioMs,
        })
        .from(transcriptTurn)
        .where(
          sql`${transcriptTurn.sessionId} IN (${sql.join(
            previousWeekSessions.map((s) => sql`${s.id}`),
            sql`, `
          )})`
        );

      const currentMinutes = Math.round(
        currentWeekTranscripts.reduce((sum, t) => sum + (t.audioMs || 0), 0) /
          60000
      );

      const previousMinutes = Math.round(
        previousWeekTranscripts.reduce((sum, t) => sum + (t.audioMs || 0), 0) /
          60000
      );

      if (previousMinutes > 0) {
        minutesChange = Math.round(
          ((currentMinutes - previousMinutes) / previousMinutes) * 100
        );
      }
    }

    return {
      sessionsChange,
      scoreChange,
      minutesChange,
    };
  } catch (error) {
    console.error("Error fetching user weekly trend:", error);
    return {
      sessionsChange: null,
      scoreChange: null,
      minutesChange: null,
    };
  }
}

/**
 * Get user milestone achievements
 *
 * Checks milestone conditions:
 * - 5-session streak: User completed 5 sessions in 5 consecutive days
 * - Perfect score: Any session has overall_score >= 90
 * - Improving: Last 3 sessions show increasing overall_score
 * - Consistent: User has completed 10+ sessions total
 *
 * @param userId - User UUID from Supabase Auth
 * @returns Milestone achievement flags
 */
export async function getUserMilestones(userId: string): Promise<UserMilestones> {
  try {
    // Get all completed sessions ordered by date
    const sessions = await db
      .select({
        id: interviewSession.id,
        startedAt: interviewSession.startedAt,
        endedAt: interviewSession.endedAt,
      })
      .from(interviewSession)
      .where(eq(interviewSession.userId, userId))
      .orderBy(desc(interviewSession.startedAt));

    const completedSessions = sessions.filter((s) => s.endedAt !== null);

    // Consistent milestone: 10+ sessions
    const consistent = completedSessions.length >= 10;

    // Get feedback for sessions
    const sessionIds = completedSessions.map((s) => s.id);
    let perfectScore = false;
    let improving = false;

    if (sessionIds.length > 0) {
      const scores = await db
        .select({
          sessionId: feedback.sessionId,
          overallScore: feedback.overallScore,
        })
        .from(feedback)
        .where(
          sql`${feedback.sessionId} IN (${sql.join(
            sessionIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        );

      // Perfect score milestone: any score >= 90
      perfectScore = scores.some(
        (s) => s.overallScore !== null && parseFloat(s.overallScore as string) >= 90
      );

      // Improving milestone: last 3 sessions show increasing scores
      if (scores.length >= 3) {
        const recentScores = scores
          .slice(0, 3)
          .map((s) => parseFloat(s.overallScore as string))
          .reverse(); // Oldest to newest

        if (recentScores.every((s) => !isNaN(s))) {
          improving = recentScores[0] < recentScores[1] && recentScores[1] < recentScores[2];
        }
      }
    }

    // 5-session streak: 5 sessions in 5 consecutive days
    let fiveSessionStreak = false;
    if (completedSessions.length >= 5) {
      // Group sessions by day
      const sessionsByDay = new Map<string, number>();
      completedSessions.forEach((session) => {
        if (session.startedAt) {
          const dayKey = session.startedAt.toISOString().split("T")[0];
          sessionsByDay.set(dayKey, (sessionsByDay.get(dayKey) || 0) + 1);
        }
      });

      // Check for 5 consecutive days with at least 1 session each
      const sortedDays = Array.from(sessionsByDay.keys()).sort();
      for (let i = 0; i <= sortedDays.length - 5; i++) {
        const isConsecutive = sortedDays
          .slice(i, i + 5)
          .every((day, index, arr) => {
            if (index === 0) return true;
            const prevDate = new Date(arr[index - 1]);
            const currDate = new Date(day);
            const diffDays = Math.round(
              (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            return diffDays === 1;
          });

        if (isConsecutive) {
          fiveSessionStreak = true;
          break;
        }
      }
    }

    return {
      fiveSessionStreak,
      perfectScore,
      improving,
      consistent,
    };
  } catch (error) {
    console.error("Error fetching user milestones:", error);
    return {
      fiveSessionStreak: false,
      perfectScore: false,
      improving: false,
      consistent: false,
    };
  }
}

/**
 * Get user recent activity
 *
 * Fetches recent interview sessions with scores for activity log display.
 * Returns sessions ordered by most recent first.
 *
 * @param userId - User UUID from Supabase Auth
 * @param limit - Maximum number of activity items to return (default: 10)
 * @returns Array of recent activity items
 */
export async function getUserRecentActivity(
  userId: string,
  limit: number = 10
): Promise<UserActivityItem[]> {
  try {
    // Get recent sessions
    const sessions = await db
      .select({
        id: interviewSession.id,
        roundType: interviewSession.roundType,
        startedAt: interviewSession.startedAt,
      })
      .from(interviewSession)
      .where(eq(interviewSession.userId, userId))
      .orderBy(desc(interviewSession.startedAt))
      .limit(limit);

    if (sessions.length === 0) {
      return [];
    }

    // Get feedback scores for these sessions
    const sessionIds = sessions.map((s) => s.id);
    const scores = await db
      .select({
        sessionId: feedback.sessionId,
        overallScore: feedback.overallScore,
      })
      .from(feedback)
      .where(
        sql`${feedback.sessionId} IN (${sql.join(
          sessionIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );

    // Create score lookup map
    const scoreMap = new Map(
      scores.map((s) => [
        s.sessionId,
        s.overallScore ? parseFloat(s.overallScore as string) : null,
      ])
    );

    // Map sessions to activity items
    return sessions.map((session) => ({
      sessionId: session.id,
      type: session.roundType,
      score: scoreMap.get(session.id) || null,
      timestamp: session.startedAt || new Date(),
    }));
  } catch (error) {
    console.error("Error fetching user recent activity:", error);
    return [];
  }
}
