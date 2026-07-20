import { asc, eq, inArray } from "drizzle-orm";

import type { AccountExportSource } from "@/lib/workflows/export-account-data";

import { db } from "./index";
import {
  appUser,
  bookmarkedQuestion,
  creditGrant,
  creditReservation,
  creditTransaction,
  feedback,
  focusedPracticeAttempt,
  interviewQuestion,
  interviewSession,
  paymentHistory,
  practiceSet,
  practiceSetQuestion,
  sessionQuestion,
  subscription,
  transcriptTurn,
  usageRecord,
  userAchievement,
  userInsights,
  userSettings,
} from "./schema";
import { transcriptChronologicalOrder } from "./transcript-ordering";

export async function loadAccountExportSource(
  userId: string
): Promise<AccountExportSource> {
  const [account] = await db
    .select({
      id: appUser.id,
      name: appUser.name,
      createdAt: appUser.createdAt,
      streakCurrent: appUser.streakCurrent,
      streakLongest: appUser.streakLongest,
      lastPracticeDate: appUser.lastPracticeDate,
    })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);

  const [settings] = await db
    .select({
      userId: userSettings.userId,
      displayName: userSettings.displayName,
      defaultInterviewType: userSettings.defaultInterviewType,
      defaultDifficulty: userSettings.defaultDifficulty,
      questionRecency: userSettings.questionRecency,
      emailNotifications: userSettings.emailNotifications,
      sessionCompletionEmail: userSettings.sessionCompletionEmail,
      feedbackReadyEmail: userSettings.feedbackReadyEmail,
      weeklyProgressReport: userSettings.weeklyProgressReport,
      theme: userSettings.theme,
      analyticsConsent: userSettings.analyticsConsent,
      analyticsConsentVersion: userSettings.analyticsConsentVersion,
      analyticsConsentSource: userSettings.analyticsConsentSource,
      analyticsConsentUpdatedAt: userSettings.analyticsConsentUpdatedAt,
      analyticsConsentRevision: userSettings.analyticsConsentRevision,
      createdAt: userSettings.createdAt,
      updatedAt: userSettings.updatedAt,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const sessions = await db
    .select({
      userId: interviewSession.userId,
      id: interviewSession.id,
      roundType: interviewSession.roundType,
      mode: interviewSession.mode,
      persona: interviewSession.persona,
      config: interviewSession.config,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
      lifecycleState: interviewSession.lifecycleState,
      terminalReason: interviewSession.terminalReason,
      status: interviewSession.status,
      totalTurns: interviewSession.totalTurns,
      totalWords: interviewSession.totalWords,
      durationSeconds: interviewSession.durationSeconds,
    })
    .from(interviewSession)
    .where(eq(interviewSession.userId, userId))
    .orderBy(asc(interviewSession.startedAt));

  const sessionIds = sessions.map(({ id }) => id);
  const questionRows = sessionIds.length
    ? await db
        .select({
          sessionId: sessionQuestion.sessionId,
          id: interviewQuestion.id,
          questionText: interviewQuestion.questionText,
          company: interviewQuestion.company,
          questionType: interviewQuestion.questionType,
          difficulty: interviewQuestion.difficulty,
          askedAt: interviewQuestion.askedAt,
          selectedAt: sessionQuestion.createdAt,
        })
        .from(sessionQuestion)
        .innerJoin(
          interviewQuestion,
          eq(sessionQuestion.questionId, interviewQuestion.id)
        )
        .where(inArray(sessionQuestion.sessionId, sessionIds))
        .orderBy(asc(sessionQuestion.createdAt))
    : [];
  const transcriptRows = sessionIds.length
    ? await db
        .select({
          sessionId: transcriptTurn.sessionId,
          speaker: transcriptTurn.speaker,
          startedAt: transcriptTurn.startedAt,
          endedAt: transcriptTurn.endedAt,
          text: transcriptTurn.text,
          audioMs: transcriptTurn.audioMs,
          latencyMs: transcriptTurn.latencyMs,
          section: transcriptTurn.section,
        })
        .from(transcriptTurn)
        .where(inArray(transcriptTurn.sessionId, sessionIds))
        .orderBy(
          asc(transcriptTurn.sessionId),
          ...transcriptChronologicalOrder()
        )
    : [];
  const feedbackRows = sessionIds.length
    ? await db
        .select({
          sessionId: feedback.sessionId,
          structureScore: feedback.structureScore,
          clarityScore: feedback.clarityScore,
          insightScore: feedback.insightScore,
          communicationScore: feedback.communicationScore,
          leadershipScore: feedback.leadershipScore,
          overallScore: feedback.overallScore,
          strengths: feedback.strengths,
          improvements: feedback.improvements,
          drills: feedback.drills,
          summary: feedback.summary,
          status: feedback.status,
          rubricVersion: feedback.rubricVersion,
          completionTier: feedback.completionTier,
          completionStats: feedback.completionStats,
          completionRecommendations: feedback.completionRecommendations,
          createdAt: feedback.createdAt,
        })
        .from(feedback)
        .where(inArray(feedback.sessionId, sessionIds))
    : [];

  const questionsBySession = groupBy(questionRows, (row) => row.sessionId);
  const transcriptBySession = groupBy(transcriptRows, (row) => row.sessionId);
  const feedbackBySession = new Map(
    feedbackRows.map((row) => [row.sessionId, without(row, "sessionId")])
  );

  const bookmarks = await db
    .select({
      userId: bookmarkedQuestion.userId,
      questionId: interviewQuestion.id,
      questionText: interviewQuestion.questionText,
      company: interviewQuestion.company,
      questionType: interviewQuestion.questionType,
      difficulty: interviewQuestion.difficulty,
      bookmarkedAt: bookmarkedQuestion.createdAt,
    })
    .from(bookmarkedQuestion)
    .innerJoin(
      interviewQuestion,
      eq(bookmarkedQuestion.questionId, interviewQuestion.id)
    )
    .where(eq(bookmarkedQuestion.userId, userId))
    .orderBy(asc(bookmarkedQuestion.createdAt));

  const practiceSets = await db
    .select({
      userId: practiceSet.userId,
      id: practiceSet.id,
      name: practiceSet.name,
      description: practiceSet.description,
      createdAt: practiceSet.createdAt,
      updatedAt: practiceSet.updatedAt,
    })
    .from(practiceSet)
    .where(eq(practiceSet.userId, userId))
    .orderBy(asc(practiceSet.createdAt));
  const practiceSetIds = practiceSets.map(({ id }) => id);
  const practiceSetQuestions = practiceSetIds.length
    ? await db
        .select({
          practiceSetId: practiceSetQuestion.practiceSetId,
          questionId: interviewQuestion.id,
          questionText: interviewQuestion.questionText,
          company: interviewQuestion.company,
          questionType: interviewQuestion.questionType,
          difficulty: interviewQuestion.difficulty,
          addedAt: practiceSetQuestion.createdAt,
        })
        .from(practiceSetQuestion)
        .innerJoin(
          interviewQuestion,
          eq(practiceSetQuestion.questionId, interviewQuestion.id)
        )
        .where(inArray(practiceSetQuestion.practiceSetId, practiceSetIds))
        .orderBy(asc(practiceSetQuestion.createdAt))
    : [];
  const questionsByPracticeSet = groupBy(
    practiceSetQuestions,
    (row) => row.practiceSetId
  );

  const achievements = await db
    .select({
      userId: userAchievement.userId,
      achievementId: userAchievement.achievementId,
      earnedAt: userAchievement.earnedAt,
    })
    .from(userAchievement)
    .where(eq(userAchievement.userId, userId))
    .orderBy(asc(userAchievement.earnedAt));

  const focusedPracticeAttempts = await db
    .select({
      userId: focusedPracticeAttempt.userId,
      id: focusedPracticeAttempt.id,
      sourceSessionId: focusedPracticeAttempt.sourceSessionId,
      sourceFeedbackId: focusedPracticeAttempt.sourceFeedbackId,
      contractVersion: focusedPracticeAttempt.contractVersion,
      lifecycleVersion: focusedPracticeAttempt.lifecycleVersion,
      state: focusedPracticeAttempt.state,
      feedbackVersion: focusedPracticeAttempt.feedbackVersion,
      plan: focusedPracticeAttempt.plan,
      sourceFinding: focusedPracticeAttempt.sourceFinding,
      startedAt: focusedPracticeAttempt.startedAt,
      completedAt: focusedPracticeAttempt.completedAt,
      completion: focusedPracticeAttempt.completion,
    })
    .from(focusedPracticeAttempt)
    .where(eq(focusedPracticeAttempt.userId, userId))
    .orderBy(asc(focusedPracticeAttempt.startedAt));

  const insights = await db
    .select({
      userId: userInsights.userId,
      overallStats: userInsights.overallStats,
      byInterviewType: userInsights.byInterviewType,
      byDifficulty: userInsights.byDifficulty,
      trends: userInsights.trends,
      competencyBreakdown: userInsights.competencyBreakdown,
      lastSessionId: userInsights.lastSessionId,
      lastUpdatedAt: userInsights.lastUpdatedAt,
      version: userInsights.version,
      createdAt: userInsights.createdAt,
    })
    .from(userInsights)
    .where(eq(userInsights.userId, userId))
    .orderBy(asc(userInsights.createdAt));

  const [subscriptionRow] = await db
    .select({
      userId: subscription.userId,
      tier: subscription.tier,
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEnd: subscription.trialEnd,
      canceledAt: subscription.canceledAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      gracePeriodEnd: subscription.gracePeriodEnd,
      planName: subscription.planName,
      priceInCents: subscription.priceInCents,
      currency: subscription.currency,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  const usage = await db
    .select({
      userId: usageRecord.userId,
      periodStart: usageRecord.periodStart,
      periodEnd: usageRecord.periodEnd,
      interviewsUsed: usageRecord.interviewsUsed,
      interviewsLimit: usageRecord.interviewsLimit,
      tierSnapshot: usageRecord.tierSnapshot,
      resetAt: usageRecord.resetAt,
      createdAt: usageRecord.createdAt,
      updatedAt: usageRecord.updatedAt,
    })
    .from(usageRecord)
    .where(eq(usageRecord.userId, userId))
    .orderBy(asc(usageRecord.periodStart));

  const payments = await db
    .select({
      userId: paymentHistory.userId,
      amountInCents: paymentHistory.amountInCents,
      currency: paymentHistory.currency,
      status: paymentHistory.status,
      tier: paymentHistory.tier,
      billingCycle: paymentHistory.billingCycle,
      periodStart: paymentHistory.periodStart,
      periodEnd: paymentHistory.periodEnd,
      createdAt: paymentHistory.createdAt,
    })
    .from(paymentHistory)
    .where(eq(paymentHistory.userId, userId))
    .orderBy(asc(paymentHistory.createdAt));

  const creditGrants = await db
    .select({
      userId: creditGrant.userId,
      catalogId: creditGrant.catalogId,
      source: creditGrant.source,
      originalCredits: creditGrant.originalCredits,
      remainingCredits: creditGrant.remainingCredits,
      reservedCredits: creditGrant.reservedCredits,
      expiresAt: creditGrant.expiresAt,
      rolloverEligible: creditGrant.rolloverEligible,
      createdAt: creditGrant.createdAt,
      updatedAt: creditGrant.updatedAt,
    })
    .from(creditGrant)
    .where(eq(creditGrant.userId, userId))
    .orderBy(asc(creditGrant.createdAt));
  const creditReservations = await db
    .select({
      userId: creditReservation.userId,
      status: creditReservation.status,
      credits: creditReservation.credits,
      sessionId: creditReservation.sessionId,
      expiresAt: creditReservation.expiresAt,
      createdAt: creditReservation.createdAt,
      updatedAt: creditReservation.updatedAt,
    })
    .from(creditReservation)
    .where(eq(creditReservation.userId, userId))
    .orderBy(asc(creditReservation.createdAt));
  const creditTransactions = await db
    .select({
      userId: creditTransaction.userId,
      type: creditTransaction.type,
      credits: creditTransaction.credits,
      balanceAfter: creditTransaction.balanceAfter,
      createdAt: creditTransaction.createdAt,
    })
    .from(creditTransaction)
    .where(eq(creditTransaction.userId, userId))
    .orderBy(asc(creditTransaction.createdAt));

  return {
    account: account ?? null,
    settings: settings ?? null,
    interviews: sessions.map((session) => ({
      ...session,
      questions: (questionsBySession.get(session.id) ?? []).map((row) =>
        without(row, "sessionId")
      ),
      transcript: (transcriptBySession.get(session.id) ?? []).map((row) =>
        without(row, "sessionId")
      ),
      feedback: feedbackBySession.get(session.id) ?? null,
    })),
    bookmarks,
    practiceSets: practiceSets.map((set) => ({
      ...set,
      questions: (questionsByPracticeSet.get(set.id) ?? []).map((row) =>
        without(row, "practiceSetId")
      ),
    })),
    focusedPracticeAttempts,
    achievements,
    insights,
    subscription: subscriptionRow ?? null,
    usage,
    payments,
    creditGrants,
    creditReservations,
    creditTransactions,
  };
}

function groupBy<T>(rows: T[], keyFor: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function without<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  key: K
): Omit<T, K> {
  const { [key]: removed, ...rest } = value;
  void removed;
  return rest;
}
