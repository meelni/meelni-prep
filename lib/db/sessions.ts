import { db } from "./index";
import {
  accountDeletionRequest,
  interviewSession,
  interviewQuestion,
  appUser,
  feedback,
  sessionQuestion,
  transcriptTurn,
} from "./schema";
import { eq, desc, and, asc, inArray, sql } from "drizzle-orm";
import {
  FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION,
  ALL_INTERVIEW_TYPES,
  isInterviewSessionCompletedForRead,
  MAX_CANONICAL_EVENT_ID_LENGTH,
  type CandidateAnswerBlock,
  type PersistedFeedbackEvidenceTurn,
  type RoundType,
} from "@/lib/internal/core";
import {
  classifyDashboardFeedbackPresentation,
  DASHBOARD_FEEDBACK_PRESENTATION_LIMITS,
  type DashboardFeedbackPresentationCandidate,
  type DashboardFeedbackPresentationKind,
} from "@/lib/dashboard/feedback-presentation";
import { getFrozenFeedbackEvaluationEvidence } from "./transcripts";
import { prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot } from "@/lib/evaluation/session-validator";
import { lockAccountIdentity } from "./account-identity-lock";
import { AccountDeletionPendingError } from "./users";

export interface CreateSessionInput {
  userId: string;
  role: "pm";
  roundType: "behavioral" | "product_sense" | "execution" | "strategy";
  mode: "voice_video" | "text";
  livekitRoomName?: string;
  config?: Record<string, unknown>;
}

export interface UpdateSessionInput {
  endedAt?: Date;
  config?: Record<string, unknown>;
}

export interface SessionWithSelectedQuestion {
  session: typeof interviewSession.$inferSelect;
  question: {
    id: string;
    text: string;
    company: string | null;
  } | null;
}

/**
 * Create a new interview session
 */
export async function createSession(input: CreateSessionInput) {
  return db.transaction(async (tx) => {
    // Serialize session creation with deletion capture. If creation commits
    // first, deletion snapshots the room; after acceptance, creation fails.
    await lockAccountIdentity(tx, input.userId);
    const [tombstone] = await tx
      .select({ userId: accountDeletionRequest.userId })
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, input.userId))
      .limit(1);
    if (tombstone) throw new AccountDeletionPendingError();

    const [session] = await tx
      .insert(interviewSession)
      .values({
        userId: input.userId,
        role: input.role,
        roundType: input.roundType,
        mode: input.mode,
        persona: null,
        livekitRoomName: input.livekitRoomName,
        config: input.config,
        startedAt: new Date(),
      })
      .returning();

    return session;
  });
}

/**
 * Get a session by ID
 */
export async function getSessionById(
  sessionId: string,
  database: Pick<typeof db, "select"> = db
) {
  const [session] = await database
    .select()
    .from(interviewSession)
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  return session;
}

/**
 * Get a session with the historical question selected for that session.
 *
 * This intentionally does not apply the public question-bank publication
 * filter: a retired question remains valid evidence for an existing session.
 */
export async function getSessionWithSelectedQuestionById(
  sessionId: string,
  database: Pick<typeof db, "select"> = db
): Promise<SessionWithSelectedQuestion | null> {
  const [result] = await database
    .select({
      session: interviewSession,
      question: {
        id: interviewQuestion.id,
        text: interviewQuestion.questionText,
        company: interviewQuestion.company,
      },
    })
    .from(interviewSession)
    .leftJoin(
      sessionQuestion,
      eq(sessionQuestion.sessionId, interviewSession.id)
    )
    .leftJoin(
      interviewQuestion,
      eq(interviewQuestion.id, sessionQuestion.questionId)
    )
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  return result ?? null;
}

/**
 * Get the server-owned facts required to authorize a participant reconnect.
 */
export async function getSessionForLiveKitJoin(sessionId: string) {
  const [session] = await db
    .select({
      id: interviewSession.id,
      userId: interviewSession.userId,
      mode: interviewSession.mode,
      livekitRoomName: interviewSession.livekitRoomName,
      config: interviewSession.config,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
      startContractVersion: interviewSession.startContractVersion,
      provisioningState: interviewSession.provisioningState,
      provisionedAt: interviewSession.provisionedAt,
      status: interviewSession.status,
      lifecycleState: interviewSession.lifecycleState,
      lifecycleVersion: interviewSession.lifecycleVersion,
      terminalReason: interviewSession.terminalReason,
      activatedAt: interviewSession.activatedAt,
      endingAt: interviewSession.endingAt,
      lastTransitionAt: interviewSession.lastTransitionAt,
      reconnectDeadlineAt: interviewSession.reconnectDeadlineAt,
      reconnectDeadlineOwner: interviewSession.reconnectDeadlineOwner,
      databaseNow: sql<Date>`clock_timestamp()`,
    })
    .from(interviewSession)
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  return session;
}

/**
 * Get the minimal owner-scoped facts required for explicit runtime settlement.
 */
export async function getSessionForUserEndSettlement(
  sessionId: string,
  userId: string
) {
  const [session] = await db
    .select({
      userId: interviewSession.userId,
      livekitRoomName: interviewSession.livekitRoomName,
      config: interviewSession.config,
      startedAt: interviewSession.startedAt,
      lifecycleState: interviewSession.lifecycleState,
      terminalReason: interviewSession.terminalReason,
      endingAt: interviewSession.endingAt,
      databaseNow: sql<Date>`clock_timestamp()`,
    })
    .from(interviewSession)
    .where(
      and(
        eq(interviewSession.id, sessionId),
        eq(interviewSession.userId, userId)
      )
    )
    .limit(1);

  return session;
}

/**
 * Get a session by ID with user information
 */
export async function getSessionWithUser(sessionId: string) {
  const [result] = await db
    .select({
      session: interviewSession,
      user: appUser,
    })
    .from(interviewSession)
    .leftJoin(appUser, eq(interviewSession.userId, appUser.id))
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  return result;
}

/**
 * Update a session
 */
export async function updateSession(
  sessionId: string,
  input: UpdateSessionInput
) {
  const [session] = await db
    .update(interviewSession)
    .set(input)
    .where(eq(interviewSession.id, sessionId))
    .returning();

  return session;
}

/**
 * End a session by setting endedAt timestamp
 */
export async function endSession(sessionId: string) {
  return updateSession(sessionId, { endedAt: new Date() });
}

/**
 * Get all sessions for a user, ordered by most recent first
 */
export async function getUserSessions(userId: string, limit = 50) {
  const sessions = await db
    .select()
    .from(interviewSession)
    .where(eq(interviewSession.userId, userId))
    .orderBy(desc(interviewSession.startedAt))
    .limit(limit);

  return sessions;
}

/**
 * Get sessions for a user with pagination and total count
 * Includes feedback data (status and overallScore) for each session
 */
export async function getUserSessionsPaginated(
  userId: string,
  limit = 20,
  offset = 0
) {
  // Get sessions with pagination, including feedback data
  const rows = await db
    .select(dashboardSessionSelection)
    .from(interviewSession)
    .leftJoin(feedback, eq(feedback.sessionId, interviewSession.id))
    .where(eq(interviewSession.userId, userId))
    .orderBy(desc(interviewSession.startedAt))
    .limit(limit)
    .offset(offset);
  const [evidenceBySession, answerEvidenceBySession] = await Promise.all([
    loadDashboardFeedbackEvidenceTurns(rows),
    loadDashboardDimensionCoverageAnswerBlocks(rows),
  ]);
  const sessions = rows.map((row) =>
    toDashboardSession(
      row,
      evidenceBySession.get(String(row.id)) ?? EMPTY_FEEDBACK_EVIDENCE_TURNS,
      answerEvidenceBySession.get(String(row.id)) ?? EMPTY_V3_ANSWER_EVIDENCE
    )
  );

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviewSession)
    .where(eq(interviewSession.userId, userId));

  const total = Number(countResult[0]?.count || 0);

  return { sessions, total };
}

/** Strict, owner-scoped feedback projections for numeric analytics consumers. */
export interface FeedbackAnalyticsSession {
  id: string;
  userId: string;
  roundType: string;
  mode: string;
  startedAt: Date | null;
  endedAt: Date | null;
  config: unknown;
  feedback: {
    status: string;
    presentationKind: DashboardFeedbackPresentationKind;
    overallScore: string | null;
    structureScore: number | null;
    clarityScore: number | null;
    insightScore: number | null;
    communicationScore: number | null;
    leadershipScore: number | null;
  } | null;
}

export async function getUserSessionsForFeedbackAnalytics(
  userId: string
): Promise<FeedbackAnalyticsSession[]> {
  const rows = await db
    .select(dashboardSessionSelection)
    .from(interviewSession)
    .leftJoin(feedback, eq(feedback.sessionId, interviewSession.id))
    .where(eq(interviewSession.userId, userId))
    .orderBy(desc(interviewSession.startedAt));
  const [evidenceBySession, answerEvidenceBySession] = await Promise.all([
    loadDashboardFeedbackEvidenceTurns(rows),
    loadDashboardDimensionCoverageAnswerBlocks(rows),
  ]);
  return rows.map((row) =>
    toDashboardSession(
      row,
      evidenceBySession.get(String(row.id)) ?? EMPTY_FEEDBACK_EVIDENCE_TURNS,
      answerEvidenceBySession.get(String(row.id)) ?? EMPTY_V3_ANSWER_EVIDENCE
    )
  );
}

/**
 * Get sessions for a user filtered by round type
 */
export async function getUserSessionsByRoundType(
  userId: string,
  roundType: "behavioral" | "product_sense" | "execution" | "strategy",
  limit = 50
) {
  const sessions = await db
    .select()
    .from(interviewSession)
    .where(
      and(
        eq(interviewSession.userId, userId),
        eq(interviewSession.roundType, roundType)
      )
    )
    .orderBy(desc(interviewSession.startedAt))
    .limit(limit);

  return sessions;
}

/**
 * Get sessions for a user filtered by round type with pagination
 * Includes feedback data (status and overallScore) for each session
 */
export async function getUserSessionsByRoundTypePaginated(
  userId: string,
  roundType: "behavioral" | "product_sense" | "execution" | "strategy",
  limit = 20,
  offset = 0
) {
  // Get sessions with pagination, including feedback data
  const rows = await db
    .select(dashboardSessionSelection)
    .from(interviewSession)
    .leftJoin(feedback, eq(feedback.sessionId, interviewSession.id))
    .where(
      and(
        eq(interviewSession.userId, userId),
        eq(interviewSession.roundType, roundType)
      )
    )
    .orderBy(desc(interviewSession.startedAt))
    .limit(limit)
    .offset(offset);
  const [evidenceBySession, answerEvidenceBySession] = await Promise.all([
    loadDashboardFeedbackEvidenceTurns(rows),
    loadDashboardDimensionCoverageAnswerBlocks(rows),
  ]);
  const sessions = rows.map((row) =>
    toDashboardSession(
      row,
      evidenceBySession.get(String(row.id)) ?? EMPTY_FEEDBACK_EVIDENCE_TURNS,
      answerEvidenceBySession.get(String(row.id)) ?? EMPTY_V3_ANSWER_EVIDENCE
    )
  );

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviewSession)
    .where(
      and(
        eq(interviewSession.userId, userId),
        eq(interviewSession.roundType, roundType)
      )
    );

  const total = Number(countResult[0]?.count || 0);

  return { sessions, total };
}

export const dashboardSessionSelection = {
  id: interviewSession.id,
  userId: interviewSession.userId,
  role: interviewSession.role,
  roundType: interviewSession.roundType,
  mode: interviewSession.mode,
  persona: interviewSession.persona,
  livekitRoomName: interviewSession.livekitRoomName,
  config: interviewSession.config,
  startedAt: interviewSession.startedAt,
  endedAt: interviewSession.endedAt,
  lifecycleState: interviewSession.lifecycleState,
  status: interviewSession.status,
  lifecycleVersion: interviewSession.lifecycleVersion,
  terminalReason: interviewSession.terminalReason,
  activatedAt: interviewSession.activatedAt,
  endingAt: interviewSession.endingAt,
  lastTransitionAt: interviewSession.lastTransitionAt,
  feedback: {
    status: feedback.status,
    overallScore: feedback.overallScore,
    structureScore: feedback.structureScore,
    clarityScore: feedback.clarityScore,
    insightScore: feedback.insightScore,
    communicationScore: feedback.communicationScore,
    leadershipScore: feedback.leadershipScore,
  },
  feedbackPresentationCandidate: {
    id: feedback.id,
    sessionId: feedback.sessionId,
    status: feedback.status,
    outcomeReason: feedback.outcomeReason,
    completionTier: feedback.completionTier,
    overallScore: feedback.overallScore,
    structureScore: feedback.structureScore,
    clarityScore: feedback.clarityScore,
    insightScore: feedback.insightScore,
    communicationScore: feedback.communicationScore,
    leadershipScore: feedback.leadershipScore,
    schemaVersion: sql<
      string | null
    >`left(${feedback.schemaVersion}, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.version + 1})`,
    promptVersion: sql<
      string | null
    >`left(${feedback.promptVersion}, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.version + 1})`,
    modelVersion: sql<
      string | null
    >`left(${feedback.modelVersion}, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.version + 1})`,
    rubricVersion: sql<
      string | null
    >`left(${feedback.rubricVersion}, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.version + 1})`,
    evaluationState: sql<
      string | null
    >`left(${feedback.evaluationState}, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.version + 1})`,
    feedbackMode: sql<
      string | null
    >`left(${feedback.feedbackMode}, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.version + 1})`,
    feedbackRoundType: sql<
      string | null
    >`left(${feedback.feedbackRoundType}, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.version + 1})`,
    dimensionCoverageJson: sql<
      string | null
    >`left(${feedback.dimensionCoverage}::text, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.dimensionCoverageJson + 1})`,
    strengthsJson: sql<
      string | null
    >`left(${feedback.strengths}::text, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.findingsJson + 1})`,
    improvementsJson: sql<
      string | null
    >`left(${feedback.improvements}::text, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.findingsJson + 1})`,
    drillsJson: sql<
      string | null
    >`left(${feedback.drills}::text, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.drillsJson + 1})`,
    summary: sql<
      string | null
    >`left(${feedback.summary}, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.summary + 1})`,
    createdAt: feedback.createdAt,
  },
};

const EMPTY_FEEDBACK_EVIDENCE_TURNS: readonly PersistedFeedbackEvidenceTurn[] =
  [];
const EMPTY_CANDIDATE_ANSWER_BLOCKS: readonly CandidateAnswerBlock[] = [];
interface DashboardV3AnswerEvidence {
  blocks: readonly CandidateAnswerBlock[];
  state: "complete" | "partial" | undefined;
}
const EMPTY_V3_ANSWER_EVIDENCE: DashboardV3AnswerEvidence = {
  blocks: EMPTY_CANDIDATE_ANSWER_BLOCKS,
  state: undefined,
};
const MAX_DASHBOARD_FEEDBACK_EVIDENCE_ROWS_PER_PAGE = 2_000;
const MAX_DASHBOARD_FEEDBACK_EVIDENCE_TEXT_LENGTH = 20_000;

/**
 * Batch the canonical user evidence needed by completed versioned feedback.
 * A page that exceeds the explicit aggregate cap fails closed rather than
 * partially validating links from a truncated evidence set.
 */
async function loadDashboardFeedbackEvidenceTurns(
  rows: readonly DashboardSessionRow[],
  database: Pick<typeof db, "select"> = db
): Promise<ReadonlyMap<string, readonly PersistedFeedbackEvidenceTurn[]>> {
  const sessionIds = rows.flatMap((row) =>
    row.feedbackPresentationCandidate &&
    row.feedbackPresentationCandidate.status === "completed" &&
    row.feedbackPresentationCandidate.schemaVersion !== null &&
    row.feedbackPresentationCandidate.schemaVersion !==
      FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION &&
    typeof row.id === "string"
      ? [row.id]
      : []
  );
  if (sessionIds.length === 0) return new Map();

  const evidenceRows = await buildDashboardFeedbackEvidenceTurnsQuery(
    database,
    sessionIds
  );
  if (evidenceRows.length > MAX_DASHBOARD_FEEDBACK_EVIDENCE_ROWS_PER_PAGE) {
    return new Map();
  }

  const grouped = new Map<string, PersistedFeedbackEvidenceTurn[]>();
  for (const row of evidenceRows) {
    const turns = grouped.get(row.sessionId) ?? [];
    turns.push(row);
    grouped.set(row.sessionId, turns);
  }
  return grouped;
}

async function loadDashboardDimensionCoverageAnswerBlocks(
  rows: readonly DashboardSessionRow[]
): Promise<ReadonlyMap<string, DashboardV3AnswerEvidence>> {
  const sessionIds = rows.flatMap((row) =>
    row.feedbackPresentationCandidate?.status === "completed" &&
    row.feedbackPresentationCandidate.schemaVersion ===
      FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION &&
    typeof row.id === "string"
      ? [row.id]
      : []
  );
  const entries = await Promise.all(
    sessionIds.map(async (sessionId) => {
      const evidence = await getFrozenFeedbackEvaluationEvidence(sessionId);
      const prepared =
        prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot(evidence);
      return [
        sessionId,
        {
          blocks: prepared.eligible
            ? prepared.blocks
            : EMPTY_CANDIDATE_ANSWER_BLOCKS,
          state:
            prepared.eligible && evidence.snapshotValid
              ? (evidence.snapshotState ?? undefined)
              : undefined,
        },
      ] as const;
    })
  );
  return new Map(entries);
}

export function buildDashboardFeedbackEvidenceTurnsQuery(
  database: Pick<typeof db, "select">,
  sessionIds: readonly string[]
) {
  return database
    .select({
      sessionId: transcriptTurn.sessionId,
      eventId: sql<
        string | null
      >`left(${transcriptTurn.eventId}, ${MAX_CANONICAL_EVENT_ID_LENGTH + 1})`,
      speaker: transcriptTurn.speaker,
      text: sql<
        string | null
      >`left(${transcriptTurn.text}, ${MAX_DASHBOARD_FEEDBACK_EVIDENCE_TEXT_LENGTH + 1})`,
      contractVersion: transcriptTurn.contractVersion,
    })
    .from(transcriptTurn)
    .where(
      and(
        inArray(transcriptTurn.sessionId, [...sessionIds]),
        eq(transcriptTurn.speaker, "user")
      )
    )
    .orderBy(
      asc(transcriptTurn.sessionId),
      asc(transcriptTurn.startedAt),
      asc(transcriptTurn.writerId),
      asc(transcriptTurn.sequence),
      asc(transcriptTurn.eventId),
      asc(transcriptTurn.id)
    )
    .limit(MAX_DASHBOARD_FEEDBACK_EVIDENCE_ROWS_PER_PAGE + 1);
}

type DashboardSessionRow = {
  id: unknown;
  roundType?: unknown;
  feedback: {
    status: string;
    overallScore: string | null;
    structureScore: number | null;
    clarityScore: number | null;
    insightScore: number | null;
    communicationScore: number | null;
    leadershipScore: number | null;
  } | null;
  feedbackPresentationCandidate: DashboardFeedbackPresentationCandidate | null;
};

type PresentedDashboardSession<T extends DashboardSessionRow> = Omit<
  T,
  "feedbackPresentationCandidate" | "feedback"
> & {
  feedback:
    | (NonNullable<T["feedback"]> & {
        presentationKind: DashboardFeedbackPresentationKind;
      })
    | null;
};

export function toDashboardSession<T extends DashboardSessionRow>(
  row: T,
  evidenceTurns: readonly PersistedFeedbackEvidenceTurn[] = [],
  answerEvidence: DashboardV3AnswerEvidence = EMPTY_V3_ANSWER_EVIDENCE
): PresentedDashboardSession<T> {
  const {
    feedbackPresentationCandidate,
    feedback: persistedFeedback,
    ...session
  } = row;
  if (!persistedFeedback) {
    return { ...session, feedback: null } as PresentedDashboardSession<T>;
  }
  const presentationKind = feedbackPresentationCandidate
    ? classifyDashboardFeedbackPresentation(
        feedbackPresentationCandidate,
        evidenceTurns,
        answerEvidence.blocks,
        parseDashboardRoundType(row.roundType),
        answerEvidence.state
      )
    : "unavailable";
  const exposesDimensionScores =
    presentationKind === "scored" ||
    presentationKind === "full_scorecard" ||
    presentationKind === "partial_scorecard";
  const exposesOverallScore =
    presentationKind === "scored" || presentationKind === "full_scorecard";

  return {
    ...session,
    feedback: {
      ...persistedFeedback,
      overallScore: exposesOverallScore ? persistedFeedback.overallScore : null,
      structureScore: exposesDimensionScores
        ? persistedFeedback.structureScore
        : null,
      clarityScore: exposesDimensionScores
        ? persistedFeedback.clarityScore
        : null,
      insightScore: exposesDimensionScores
        ? persistedFeedback.insightScore
        : null,
      communicationScore: exposesDimensionScores
        ? persistedFeedback.communicationScore
        : null,
      leadershipScore: exposesDimensionScores
        ? persistedFeedback.leadershipScore
        : null,
      presentationKind,
    },
  } as PresentedDashboardSession<T>;
}

function parseDashboardRoundType(value: unknown): RoundType | undefined {
  return typeof value === "string" &&
    ALL_INTERVIEW_TYPES.some((roundType) => roundType === value)
    ? (value as RoundType)
    : undefined;
}

/**
 * Get user session stats (all sessions for stats calculation)
 */
export async function getUserSessionStats(userId: string) {
  // Get all sessions for the user
  const allSessions = await db
    .select({
      id: interviewSession.id,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
      lifecycleState: interviewSession.lifecycleState,
      status: interviewSession.status,
    })
    .from(interviewSession)
    .where(eq(interviewSession.userId, userId));

  const totalSessions = allSessions.length;
  // SAV-188 will move the legacy end/feedback writers to canonical terminal
  // transitions. Until then, honor a completed legacy projection only while
  // the canonical row is still nonterminal; canonical terminal truth wins.
  const completedSessions = allSessions.filter((session) =>
    isInterviewSessionCompletedForRead({
      state: session.lifecycleState,
      legacyStatus: session.status,
    })
  );

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

  return {
    totalSessions,
    totalMinutes,
    avgScore: 0, // Will be calculated from feedback table when implemented
    completionRate,
  };
}

/**
 * Check if a session belongs to a user (for authorization)
 */
export async function isSessionOwnedByUser(
  sessionId: string,
  userId: string,
  database: Pick<typeof db, "select"> = db
): Promise<boolean> {
  const [session] = await database
    .select({ userId: interviewSession.userId })
    .from(interviewSession)
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  return session?.userId === userId;
}
