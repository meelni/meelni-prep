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
import {
  feedback,
  interviewQuestion,
  interviewSession,
  sessionQuestion,
} from "./schema";
import { getFrozenFeedbackEvaluationEvidence } from "./transcripts";

export const QUESTION_RANKING_DB_BOUNDS = {
  candidateRows: QUESTION_RANKING_LIMITS.candidates,
  historyRows: QUESTION_RANKING_LIMITS.history,
  feedbackRows: 1,
  // candidate + history + feedback row + the five bounded frozen-evidence reads
  maxDatabaseQueries: 8,
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
    async loadCandidates(request, limit) {
      const storedDifficulty = toStoredDifficulty(request.difficulty);
      const company = request.company?.trim() || null;
      const rows = await db
        .select({
          id: interviewQuestion.id,
          text: interviewQuestion.questionText,
          company: interviewQuestion.company,
          questionType: interviewQuestion.questionType,
          difficulty: interviewQuestion.difficulty,
          sourceKind: interviewQuestion.sourceKind,
          qualityStatus: interviewQuestion.qualityStatus,
          askedAt: interviewQuestion.askedAt,
          isActive: interviewQuestion.isActive,
        })
        .from(interviewQuestion)
        .where(
          and(
            eq(interviewQuestion.isActive, true),
            eq(interviewQuestion.qualityStatus, "published")
          )
        )
        .orderBy(
          company
            ? desc(
                sql`CASE WHEN lower(btrim(${interviewQuestion.company})) = lower(btrim(${company})) THEN 1 ELSE 0 END`
              )
            : asc(interviewQuestion.id),
          desc(
            sql`CASE WHEN ${interviewQuestion.questionType} = ANY(${questionTypesForRoundSql(
              request.roundType
            )}) THEN 1 ELSE 0 END`
          ),
          desc(
            sql`CASE WHEN ${interviewQuestion.difficulty} = ${storedDifficulty} THEN 1 ELSE 0 END`
          ),
          sql`${interviewQuestion.askedAt} DESC NULLS LAST`,
          asc(interviewQuestion.id)
        )
        .limit(Math.min(limit, QUESTION_RANKING_DB_BOUNDS.candidateRows));

      return rows.flatMap((row) => {
        const roundType = normalizeQuestionRound(row.questionType);
        if (!roundType) return [];
        return [
          {
            id: row.id,
            text: row.text,
            company: row.company,
            roundType,
            difficulty: fromStoredDifficulty(row.difficulty),
            sourceKind: row.sourceKind,
            qualityStatus: row.qualityStatus,
            askedAt: row.askedAt?.toISOString() ?? null,
            isActive: row.isActive,
          } satisfies QuestionRankingCandidate,
        ];
      });
    },

    async loadHistory(userId, limit) {
      const rows = await db
        .select({
          questionId: sessionQuestion.questionId,
          roundType: interviewSession.roundType,
          practicedAt: interviewSession.activatedAt,
        })
        .from(interviewSession)
        .innerJoin(
          sessionQuestion,
          eq(sessionQuestion.sessionId, interviewSession.id)
        )
        .where(
          and(
            eq(interviewSession.userId, userId),
            isNotNull(interviewSession.activatedAt)
          )
        )
        .orderBy(
          desc(interviewSession.activatedAt),
          asc(sessionQuestion.questionId)
        )
        .limit(Math.min(limit, QUESTION_RANKING_DB_BOUNDS.historyRows));

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
    },

    loadLatestValidatedFeedbackSignal,
  };
}

async function loadLatestValidatedFeedbackSignal(
  userId: string
): Promise<ValidatedQuestionRankingFeedbackSignal | null> {
  const [row] = await db
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
  const frozen = await getFrozenFeedbackEvaluationEvidence(row.sessionId);
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

function fromStoredDifficulty(
  difficulty: string | null
): QuestionRankingRequest["difficulty"] {
  if (difficulty === "Easy") return "beginner";
  if (difficulty === "Hard") return "advanced";
  return "intermediate";
}

function questionTypesForRoundSql(roundType: RoundType) {
  const aliases: Record<RoundType, readonly string[]> = {
    product_sense: ["Product Sense", "Product design/strategy"],
    behavioral: ["Behavioral"],
    execution: ["Execution", "A/B Testing", "Estimation", "Pricing"],
    strategy: ["Strategy", "Product Strategy"],
  };
  return sql`ARRAY[${sql.join(
    aliases[roundType].map((value) => sql`${value}`),
    sql`, `
  )}]::text[]`;
}
