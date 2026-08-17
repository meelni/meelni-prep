/** Strict, owner-scoped score comparison over canonically presented feedback. */

import {
  getUserSessionsForFeedbackAnalytics,
  type FeedbackAnalyticsSession,
} from "@/lib/db/sessions";
import type {
  FeedbackContent,
  FeedbackScores,
  ScoreDelta,
  SessionAttempt,
  SessionComparisonDetail,
} from "@/lib/types/comparison";
import { getCompletedFeedbackScore } from "@meelni/core";

export type ValidatedComparisonSession = FeedbackAnalyticsSession;

export async function getSessionsByInterviewType(
  userId: string,
  roundType: string
): Promise<SessionAttempt[]> {
  const sessions = await getUserSessionsForFeedbackAnalytics(userId);
  return sessions
    .filter(isComparableSession)
    .filter((session) => session.roundType === roundType)
    .slice(0, 10)
    .map(toSessionAttempt);
}

export async function getSessionComparison(
  sessionId1: string,
  sessionId2: string,
  userId: string
): Promise<{
  session1: SessionComparisonDetail;
  session2: SessionComparisonDetail;
  scoreDelta: ScoreDelta;
} | null> {
  const sessions = await getUserSessionsForFeedbackAnalytics(userId);
  return buildSessionComparisonFromValidatedSessions(
    sessions,
    sessionId1,
    sessionId2
  );
}

export function buildSessionComparisonFromValidatedSessions(
  sessions: readonly ValidatedComparisonSession[],
  sessionId1: string,
  sessionId2: string
) {
  if (sessionId1 === sessionId2) return null;
  const first = sessions.find((session) => session.id === sessionId1);
  const second = sessions.find((session) => session.id === sessionId2);
  if (
    !first ||
    !second ||
    first.roundType !== second.roundType ||
    !isComparableSession(first) ||
    !isComparableSession(second)
  ) {
    return null;
  }
  const session1 = toSessionDetail(first);
  const session2 = toSessionDetail(second);
  return {
    session1,
    session2,
    scoreDelta: scoreDelta(session1.scores, session2.scores),
  };
}

function isComparableSession(
  session: ValidatedComparisonSession
): session is ValidatedComparisonSession & {
  feedback: NonNullable<ValidatedComparisonSession["feedback"]>;
} {
  return (
    session.feedback?.presentationKind === "scorecard" &&
    getCompletedFeedbackScore(session.feedback) !== null
  );
}

function toSessionAttempt(
  session: ValidatedComparisonSession & {
    feedback: NonNullable<ValidatedComparisonSession["feedback"]>;
  }
): SessionAttempt {
  return {
    id: session.id,
    startedAt: dateString(session.startedAt),
    endedAt: nullableDateString(session.endedAt),
    roundType: session.roundType,
    mode: session.mode,
    overallScore: getCompletedFeedbackScore(session.feedback),
    structureScore: session.feedback.structureScore,
    clarityScore: session.feedback.clarityScore,
    insightScore: session.feedback.insightScore,
    communicationScore: session.feedback.communicationScore,
    leadershipScore: session.feedback.leadershipScore,
  };
}

function toSessionDetail(
  session: ValidatedComparisonSession & {
    feedback: NonNullable<ValidatedComparisonSession["feedback"]>;
  }
): SessionComparisonDetail {
  return {
    id: session.id,
    startedAt: dateString(session.startedAt),
    endedAt: nullableDateString(session.endedAt),
    roundType: session.roundType,
    mode: session.mode,
    scores: {
      overall: getCompletedFeedbackScore(session.feedback),
      structure: session.feedback.structureScore,
      clarity: session.feedback.clarityScore,
      insight: session.feedback.insightScore,
      communication: session.feedback.communicationScore,
      leadership: session.feedback.leadershipScore,
    },
    feedback: emptyFeedbackContent(),
    // Comparison never invents row-based quotes. Exact citations remain on the
    // canonical feedback review and are invariant to transcript segmentation.
    keyQuotes: [],
  };
}

function scoreDelta(first: FeedbackScores, second: FeedbackScores): ScoreDelta {
  return {
    overall: delta(first.overall, second.overall),
    structure: delta(first.structure, second.structure),
    clarity: delta(first.clarity, second.clarity),
    insight: delta(first.insight, second.insight),
    communication: delta(first.communication, second.communication),
    leadership: delta(first.leadership, second.leadership),
  };
}

function delta(first: number | null, second: number | null) {
  return first === null || second === null ? null : second - first;
}

function emptyFeedbackContent(): FeedbackContent {
  return { strengths: [], improvements: [], summary: null };
}

function dateString(value: Date | string | null): string {
  return nullableDateString(value) ?? "";
}

function nullableDateString(value: Date | string | null): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
