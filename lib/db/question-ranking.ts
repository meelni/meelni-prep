import { createHash } from "node:crypto";

import {
  FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION,
  FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION,
  QUESTION_RANKING_LIMITS,
  getCompletedFeedbackScore,
  normalizeQuestionRound,
  type QuestionRankingCandidate,
  type QuestionRankingHistoryEntry,
  type QuestionRankingRequest,
  type RoundType,
  type ValidatedQuestionRankingFeedbackSignal,
} from "@meelni/core";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import {
  classifyDashboardFeedbackPresentation,
  DASHBOARD_FEEDBACK_PRESENTATION_LIMITS,
} from "@/lib/dashboard/feedback-presentation";
import {
  prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot,
  prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot,
} from "@/lib/evaluation/session-validator";
import { db } from "./index";
import { withInteractiveReadTransaction } from "./interactive-read";
import {
  feedback,
  interviewQuestion,
  interviewSession,
  sessionQuestion,
} from "./schema";
import { getFrozenFeedbackEvaluationEvidence } from "./transcripts";
import { INTERACTIVE_READ_STATEMENT_TIMEOUT_MS } from "@/lib/http/deadline";

type QuestionRankingReadDatabase = Pick<typeof db, "select" | "execute">;

type StoredQuestionDifficulty = "Easy" | "Medium" | "Hard" | null;

export interface QuestionCandidatePreferenceBucket {
  questionType: string;
  difficulty: StoredQuestionDifficulty;
  roundPriority: 0 | 1;
  difficultyPriority: 0 | 1;
}

export const QUESTION_RANKING_DB_BOUNDS = {
  candidateRows: QUESTION_RANKING_LIMITS.candidates,
  candidateBuckets: 32,
  candidateRowsPerBucket: QUESTION_RANKING_LIMITS.candidates,
  candidateWorkingRows: 32 * QUESTION_RANKING_LIMITS.candidates,
  historyRows: QUESTION_RANKING_LIMITS.history,
  feedbackRows: 1,
  statementTimeoutMs: INTERACTIVE_READ_STATEMENT_TIMEOUT_MS,
  // Three SET LOCAL statements + candidate + history + feedback row + the five
  // bounded frozen-evidence reads.
  maxDatabaseQueries: 11,
} as const;

export interface QuestionRankingContext {
  catalogVersion: string;
  candidates: readonly QuestionRankingCandidate[];
  history: readonly QuestionRankingHistoryEntry[];
  feedbackSignals: readonly ValidatedQuestionRankingFeedbackSignal[];
}

export interface QuestionRankingContextStore {
  loadCandidates(
    request: QuestionRankingRequest,
    limit: number
  ): Promise<readonly QuestionRankingCandidate[]>;
  loadHistory(
    userId: string,
    limit: number
  ): Promise<readonly QuestionRankingHistoryEntry[]>;
  loadLatestValidatedFeedbackSignal(
    userId: string
  ): Promise<ValidatedQuestionRankingFeedbackSignal | null>;
}

export async function getQuestionRankingContext(
  input: { userId: string; request: QuestionRankingRequest },
  store: QuestionRankingContextStore = createDrizzleQuestionRankingContextStore()
): Promise<QuestionRankingContext> {
  const [candidates, history, feedbackSignal] = await Promise.all([
    store.loadCandidates(
      input.request,
      QUESTION_RANKING_DB_BOUNDS.candidateRows
    ),
    store.loadHistory(input.userId, QUESTION_RANKING_DB_BOUNDS.historyRows),
    store.loadLatestValidatedFeedbackSignal(input.userId),
  ]);
  const boundedCandidates = candidates.slice(
    0,
    QUESTION_RANKING_DB_BOUNDS.candidateRows
  );
  const boundedHistory = history.slice(
    0,
    QUESTION_RANKING_DB_BOUNDS.historyRows
  );

  return {
    catalogVersion: createQuestionCatalogVersion(boundedCandidates),
    candidates: boundedCandidates,
    history: boundedHistory,
    feedbackSignals: feedbackSignal ? [feedbackSignal] : [],
  };
}

export function createQuestionCatalogVersion(
  candidates: readonly QuestionRankingCandidate[]
): string {
  const canonical = [...candidates]
    .sort((left, right) => left.id.localeCompare(right.id, "en"))
    .map((candidate) => ({
      id: candidate.id,
      text: candidate.text,
      company: candidate.company,
      roundType: candidate.roundType,
      difficulty: candidate.difficulty,
      sourceKind: candidate.sourceKind,
      qualityStatus: candidate.qualityStatus,
      askedAt: candidate.askedAt,
      isActive: candidate.isActive,
    }));
  return `question-catalog:sha256:${createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex")}`;
}

export function createDrizzleQuestionRankingContextStore(): QuestionRankingContextStore {
  return {
    loadCandidates: (request, limit) =>
      withInteractiveReadTransaction((database) =>
        loadBoundedCandidateWindow(database, request, limit)
      ),
    loadHistory: (userId, limit) =>
      withInteractiveReadTransaction((database) =>
        loadBoundedQuestionHistory(database, userId, limit)
      ),
    loadLatestValidatedFeedbackSignal: (userId) =>
      withInteractiveReadTransaction((database) =>
        loadLatestValidatedFeedbackSignal(userId, database)
      ),
  };
}

interface QuestionCandidateRow {
  [key: string]: unknown;
  id: string;
  text: string;
  company: string | null;
  questionType: string;
  difficulty: StoredQuestionDifficulty;
  sourceKind: "legacy" | "google_sheets";
  qualityStatus: "published";
  askedAt: Date | string | null;
  isActive: boolean;
}

async function loadBoundedCandidateWindow(
  database: QuestionRankingReadDatabase,
  request: QuestionRankingRequest,
  limit: number
): Promise<readonly QuestionRankingCandidate[]> {
  const rows = await database.execute<QuestionCandidateRow>(
    buildBoundedCandidateWindowQuery(request, limit)
  );

  return rows.flatMap((row) => {
    const roundType = normalizeQuestionRound(row.questionType);
    if (!roundType) return [];
    return [
      {
        id: row.id,
        text: row.text,
        company: row.company,
        roundType,
        difficulty: normalizeStoredQuestionDifficulty(row.difficulty),
        sourceKind: row.sourceKind,
        qualityStatus: row.qualityStatus,
        askedAt: normalizeStoredQuestionAskedAt(row.askedAt),
        isActive: row.isActive,
      } satisfies QuestionRankingCandidate,
    ];
  });
}

export function buildBoundedCandidateWindowQuery(
  request: QuestionRankingRequest,
  limit: number
) {
  const boundedLimit = Math.min(
    limit,
    QUESTION_RANKING_DB_BOUNDS.candidateRows
  );
  const preferences = createQuestionCandidatePreferenceBuckets(request);
  const boundedBucketQueries = preferences.map((preference) => {
    const difficultyPredicate =
      preference.difficulty === null
        ? sql`${interviewQuestion.difficulty} IS NULL`
        : sql`${interviewQuestion.difficulty} = ${preference.difficulty}`;
    // Keep the fixed difficulty pathkey so null buckets use the index's
    // recency/ID order instead of a bitmap scan and per-bucket sort.
    return sql`
      SELECT
        ${preference.roundPriority}::integer AS "roundPriority",
        ${preference.difficultyPriority}::integer AS "difficultyPriority",
        candidate.*
      FROM (
        SELECT
          ${interviewQuestion.id} AS "id",
          ${interviewQuestion.questionText} AS "text",
          ${interviewQuestion.company} AS "company",
          ${interviewQuestion.questionType} AS "questionType",
          ${interviewQuestion.difficulty} AS "difficulty",
          ${interviewQuestion.sourceKind} AS "sourceKind",
          ${interviewQuestion.qualityStatus} AS "qualityStatus",
          ${interviewQuestion.askedAt} AS "askedAt",
          ${interviewQuestion.isActive} AS "isActive"
        FROM ${interviewQuestion}
        WHERE ${interviewQuestion.isActive} = true
          AND ${interviewQuestion.qualityStatus} = 'published'
          AND ${interviewQuestion.questionType} = ${preference.questionType}
          AND ${difficultyPredicate}
        ORDER BY
          ${interviewQuestion.difficulty} ASC NULLS LAST,
          ${interviewQuestion.askedAt} DESC NULLS LAST,
          ${interviewQuestion.id} ASC
        LIMIT ${boundedLimit}
      ) AS candidate
    `;
  });
  const company = request.company?.trim() || null;
  const ordering = [
    sql`"roundPriority" ASC`,
    ...(company
      ? [
          sql`CASE WHEN lower(btrim("company")) = lower(btrim(${company})) THEN 0 ELSE 1 END ASC`,
        ]
      : []),
    sql`"difficultyPriority" ASC`,
    sql`"askedAt" DESC NULLS LAST`,
    sql`"id" ASC`,
  ];
  return sql`
    WITH bounded_buckets AS (
      ${sql.join(boundedBucketQueries, sql` UNION ALL `)}
    )
    SELECT
      "id",
      "text",
      "company",
      "questionType",
      "difficulty",
      "sourceKind",
      "qualityStatus",
      "askedAt",
      "isActive"
    FROM bounded_buckets
    ORDER BY ${sql.join(ordering, sql`, `)}
    LIMIT ${boundedLimit}
  `;
}

async function loadBoundedQuestionHistory(
  database: QuestionRankingReadDatabase,
  userId: string,
  limit: number
): Promise<readonly QuestionRankingHistoryEntry[]> {
  const boundedLimit = Math.min(limit, QUESTION_RANKING_DB_BOUNDS.historyRows);
  const recentSessions = database
    .select({
      sessionId: interviewSession.id,
      roundType: interviewSession.roundType,
      practicedAt: interviewSession.activatedAt,
    })
    .from(interviewSession)
    .where(
      and(
        eq(interviewSession.userId, userId),
        isNotNull(interviewSession.activatedAt)
      )
    )
    .orderBy(desc(interviewSession.activatedAt), asc(interviewSession.id))
    .limit(boundedLimit)
    .as("recent_question_practice_sessions");
  const rows = await database
    .select({
      questionId: sessionQuestion.questionId,
      roundType: recentSessions.roundType,
      practicedAt: recentSessions.practicedAt,
    })
    .from(recentSessions)
    .innerJoin(
      sessionQuestion,
      eq(sessionQuestion.sessionId, recentSessions.sessionId)
    )
    .orderBy(desc(recentSessions.practicedAt), asc(sessionQuestion.questionId))
    .limit(boundedLimit);

  return rows.flatMap((row) => {
    const roundType = normalizeQuestionRound(row.roundType);
    if (!roundType || !row.practicedAt) return [];
    return [
      {
        questionId: row.questionId,
        roundType,
        practicedAt: row.practicedAt.toISOString(),
      } satisfies QuestionRankingHistoryEntry,
    ];
  });
}

async function loadLatestValidatedFeedbackSignal(
  userId: string,
  database: QuestionRankingReadDatabase
): Promise<ValidatedQuestionRankingFeedbackSignal | null> {
  const [row] = await database
    .select({
      sessionId: interviewSession.id,
      sessionRoundType: interviewSession.roundType,
      candidate: {
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
        evaluationState: feedback.evaluationState,
        feedbackMode: feedback.feedbackMode,
        feedbackRoundType: feedback.feedbackRoundType,
        dimensionCoverageJson: sql<
          string | null
        >`left(${feedback.dimensionCoverage}::text, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.dimensionCoverageJson + 1})`,
        verifiedPrefixScopeJson: sql<
          string | null
        >`left(${feedback.verifiedPrefixScope}::text, ${DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.verifiedPrefixScopeJson + 1})`,
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
    })
    .from(feedback)
    .innerJoin(interviewSession, eq(interviewSession.id, feedback.sessionId))
    .where(
      and(
        eq(interviewSession.userId, userId),
        eq(feedback.status, "completed"),
        eq(feedback.outcomeReason, "feedback_generated"),
        eq(feedback.completionTier, "full"),
        eq(feedback.feedbackMode, "full_scorecard"),
        inArray(feedback.schemaVersion, [
          FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION,
          FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION,
        ])
      )
    )
    .orderBy(desc(feedback.createdAt), asc(feedback.id))
    .limit(QUESTION_RANKING_DB_BOUNDS.feedbackRows);
  if (!row?.candidate.createdAt) return null;

  const roundType = normalizeQuestionRound(row.sessionRoundType);
  if (!roundType || row.candidate.feedbackRoundType !== roundType) return null;
  const frozen = await getFrozenFeedbackEvaluationEvidence(
    row.sessionId,
    database
  );
  const preparedTrusted =
    row.candidate.schemaVersion === FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION
      ? prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot(frozen)
      : null;
  const prepared =
    preparedTrusted ??
    prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot(frozen);
  if (
    !frozen.snapshotValid ||
    !prepared.eligible ||
    (frozen.snapshotState !== "complete" && frozen.snapshotState !== "partial")
  ) {
    return null;
  }
  const presentationKind = classifyDashboardFeedbackPresentation(
    row.candidate,
    [],
    prepared.blocks,
    roundType,
    frozen.snapshotState,
    preparedTrusted?.eligible &&
      preparedTrusted.projection.status === "verified_prefix"
      ? preparedTrusted.projection
      : undefined
  );
  const overallScore = getCompletedFeedbackScore(row.candidate);
  if (presentationKind !== "scorecard" || overallScore === null) return null;

  return {
    evidenceKind: "validated_scorecard",
    roundType,
    overallScore,
    observedAt: row.candidate.createdAt.toISOString(),
  };
}

function toStoredDifficulty(
  difficulty: QuestionRankingRequest["difficulty"]
): "Easy" | "Medium" | "Hard" {
  if (difficulty === "beginner") return "Easy";
  if (difficulty === "advanced") return "Hard";
  return "Medium";
}

export function normalizeStoredQuestionDifficulty(
  difficulty: string | null
): QuestionRankingCandidate["difficulty"] {
  if (difficulty === "Easy") return "beginner";
  if (difficulty === "Hard") return "advanced";
  if (difficulty === "Medium") return "intermediate";
  return null;
}

export function normalizeStoredQuestionAskedAt(
  askedAt: Date | string | null
): string | null {
  if (askedAt === null) return null;
  const timestamp = askedAt instanceof Date ? askedAt : new Date(askedAt);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

const STORED_QUESTION_TYPE_ROUNDS = [
  { questionType: "A/B Testing", roundType: "execution" },
  { questionType: "Product design/strategy", roundType: "product_sense" },
  { questionType: "Behavioral", roundType: "behavioral" },
  { questionType: "Execution", roundType: "execution" },
  { questionType: "Product Sense", roundType: "product_sense" },
  { questionType: "Pricing", roundType: "execution" },
  { questionType: "Estimation", roundType: "execution" },
  { questionType: "Product Strategy", roundType: "strategy" },
] as const satisfies readonly {
  questionType: string;
  roundType: RoundType;
}[];

const STORED_QUESTION_DIFFICULTIES = [
  "Easy",
  "Medium",
  "Hard",
  null,
] as const satisfies readonly StoredQuestionDifficulty[];

export function createQuestionCandidatePreferenceBuckets(
  request: QuestionRankingRequest
): readonly QuestionCandidatePreferenceBucket[] {
  const requestedDifficulty = toStoredDifficulty(request.difficulty);
  return STORED_QUESTION_TYPE_ROUNDS.flatMap((question) =>
    STORED_QUESTION_DIFFICULTIES.map((difficulty) => ({
      questionType: question.questionType,
      difficulty,
      roundPriority: question.roundType === request.roundType ? 0 : 1,
      difficultyPriority: difficulty === requestedDifficulty ? 0 : 1,
    }))
  );
}
