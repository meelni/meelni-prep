/**
 * Database queries for session comparison feature
 */

import { db } from "@/lib/db";
import { interviewSession, feedback, transcriptTurn } from "@/lib/db/schema";
import { transcriptChronologicalOrder } from "@/lib/db/transcript-ordering";
import { eq, and, desc } from "drizzle-orm";
import {
  SessionAttempt,
  SessionComparisonDetail,
  FeedbackScores,
  FeedbackContent,
  ScoreDelta,
} from "@/lib/types/comparison";
import { projectFeedbackItems } from "@meelni/core";

/**
 * Get all sessions for a specific user and interview type
 * Used to populate the attempt selection dropdown
 */
export async function getSessionsByInterviewType(
  userId: string,
  roundType: string
): Promise<SessionAttempt[]> {
  const sessions = await db
    .select({
      id: interviewSession.id,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
      roundType: interviewSession.roundType,
      mode: interviewSession.mode,
      overallScore: feedback.overallScore,
      structureScore: feedback.structureScore,
      clarityScore: feedback.clarityScore,
      insightScore: feedback.insightScore,
      communicationScore: feedback.communicationScore,
      leadershipScore: feedback.leadershipScore,
    })
    .from(interviewSession)
    .leftJoin(feedback, eq(interviewSession.id, feedback.sessionId))
    .where(
      and(
        eq(interviewSession.userId, userId),
        eq(interviewSession.roundType, roundType)
      )
    )
    .orderBy(desc(interviewSession.startedAt))
    .limit(10); // Limit to 10 most recent attempts

  return sessions.map((session) => ({
    id: session.id,
    startedAt: session.startedAt?.toISOString() || "",
    endedAt: session.endedAt?.toISOString() || null,
    roundType: session.roundType,
    mode: session.mode,
    overallScore: session.overallScore ? Number(session.overallScore) : null,
    structureScore: session.structureScore,
    clarityScore: session.clarityScore,
    insightScore: session.insightScore,
    communicationScore: session.communicationScore,
    leadershipScore: session.leadershipScore,
  }));
}

/**
 * Get detailed comparison data for two sessions
 * Includes feedback scores, strengths/improvements, and key transcript quotes
 */
export async function getSessionComparison(
  sessionId1: string,
  sessionId2: string,
  userId: string
): Promise<{
  session1: SessionComparisonDetail;
  session2: SessionComparisonDetail;
  scoreDelta: ScoreDelta;
} | null> {
  // Fetch both sessions with feedback
  const [session1Data, session2Data] = await Promise.all([
    fetchSessionDetail(sessionId1, userId),
    fetchSessionDetail(sessionId2, userId),
  ]);

  if (!session1Data || !session2Data) {
    return null;
  }

  // Calculate score delta
  const scoreDelta: ScoreDelta = {
    overall:
      session1Data.scores.overall !== null &&
      session2Data.scores.overall !== null
        ? session2Data.scores.overall - session1Data.scores.overall
        : null,
    structure:
      session1Data.scores.structure !== null &&
      session2Data.scores.structure !== null
        ? session2Data.scores.structure - session1Data.scores.structure
        : null,
    clarity:
      session1Data.scores.clarity !== null &&
      session2Data.scores.clarity !== null
        ? session2Data.scores.clarity - session1Data.scores.clarity
        : null,
    insight:
      session1Data.scores.insight !== null &&
      session2Data.scores.insight !== null
        ? session2Data.scores.insight - session1Data.scores.insight
        : null,
    communication:
      session1Data.scores.communication !== null &&
      session2Data.scores.communication !== null
        ? session2Data.scores.communication - session1Data.scores.communication
        : null,
    leadership:
      session1Data.scores.leadership !== null &&
      session2Data.scores.leadership !== null
        ? session2Data.scores.leadership - session1Data.scores.leadership
        : null,
  };

  return {
    session1: session1Data,
    session2: session2Data,
    scoreDelta,
  };
}

/**
 * Helper: Fetch detailed session data
 */
async function fetchSessionDetail(
  sessionId: string,
  userId: string
): Promise<SessionComparisonDetail | null> {
  // Fetch session with feedback
  const sessionWithFeedback = await db
    .select({
      id: interviewSession.id,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
      roundType: interviewSession.roundType,
      mode: interviewSession.mode,
      userId: interviewSession.userId,
      overallScore: feedback.overallScore,
      structureScore: feedback.structureScore,
      clarityScore: feedback.clarityScore,
      insightScore: feedback.insightScore,
      communicationScore: feedback.communicationScore,
      leadershipScore: feedback.leadershipScore,
      strengths: feedback.strengths,
      improvements: feedback.improvements,
      summary: feedback.summary,
    })
    .from(interviewSession)
    .leftJoin(feedback, eq(interviewSession.id, feedback.sessionId))
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  if (sessionWithFeedback.length === 0) {
    return null;
  }

  const session = sessionWithFeedback[0];

  // Verify ownership
  if (session.userId !== userId) {
    return null;
  }

  // Fetch transcript turns (user turns only for key quotes)
  const transcriptTurns = await db
    .select({
      text: transcriptTurn.text,
      speaker: transcriptTurn.speaker,
    })
    .from(transcriptTurn)
    .where(
      and(
        eq(transcriptTurn.sessionId, sessionId),
        eq(transcriptTurn.speaker, "user")
      )
    )
    .orderBy(...transcriptChronologicalOrder())
    .limit(20); // Limit to 20 turns

  // Extract key quotes (take first 3-4 meaningful user responses)
  const keyQuotes = transcriptTurns
    .filter((turn) => turn.text && turn.text.length > 50) // Filter short responses
    .slice(0, 4)
    .map((turn) => turn.text || "");

  // Build feedback scores
  const scores: FeedbackScores = {
    overall: session.overallScore ? Number(session.overallScore) : null,
    structure: session.structureScore,
    clarity: session.clarityScore,
    insight: session.insightScore,
    communication: session.communicationScore,
    leadership: session.leadershipScore,
  };

  // Build feedback content
  const feedbackContent: FeedbackContent = {
    strengths: projectFeedbackItems(session.strengths),
    improvements: projectFeedbackItems(session.improvements),
    summary: session.summary,
  };

  return {
    id: session.id,
    startedAt: session.startedAt?.toISOString() || "",
    endedAt: session.endedAt?.toISOString() || null,
    roundType: session.roundType,
    mode: session.mode,
    scores,
    feedback: feedbackContent,
    keyQuotes,
  };
}
