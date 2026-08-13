import {
  FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  FEEDBACK_QUALITY_SIGNAL_RATE_LIMIT,
  deriveFeedbackQualityOutcome,
  parseFeedbackQualitySignalView,
  presentCompletedFeedback,
  type CandidateAnswerBlock,
  type FeedbackQualityOutcome,
  type FeedbackQualitySignalCommand,
  type FeedbackQualitySignalView,
} from "@meelni/core";
import { and, eq, sql } from "drizzle-orm";

import { lockAccountIdentity } from "@/lib/db/account-identity-lock";
import {
  buildFeedbackReadQuery,
  decodeBoundedFeedbackReadRow,
} from "@/lib/db/feedback";
import {
  buildFeedbackEvidenceTurnsQuery,
  getFrozenFeedbackEvaluationEvidence,
} from "@/lib/db/transcripts";
import { prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot } from "@/lib/evaluation/session-validator";
import type {
  FeedbackQualityReadDisposition,
  FeedbackQualitySignalRepository,
  FeedbackQualityWriteDisposition,
} from "@/lib/workflows/feedback-quality-signal";

import { db } from "./index";
import {
  accountDeletionRequest,
  appUser,
  feedback,
  feedbackQualitySignal,
  interviewSession,
} from "./schema";

type FeedbackQualityDatabase = typeof db;
type FeedbackQualityDatabaseExecutor = Pick<
  FeedbackQualityDatabase,
  "select" | "insert" | "update" | "execute"
>;
type FeedbackQualitySignalRow = typeof feedbackQualitySignal.$inferSelect;

export interface FeedbackQualityRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface FeedbackQualityRateLimitRow {
  [key: string]: unknown;
  allowed: boolean;
  retry_after_seconds: number;
}

export async function consumeFeedbackQualitySignalRateLimit(
  userId: string,
  database: Pick<FeedbackQualityDatabase, "execute"> = db
): Promise<FeedbackQualityRateLimitDecision> {
  const rows = await database.execute<FeedbackQualityRateLimitRow>(sql`
    SELECT allowed, retry_after_seconds
    FROM public.consume_feedback_quality_signal_rate_limit(
      ${userId}::uuid,
      ${FEEDBACK_QUALITY_SIGNAL_RATE_LIMIT}
    )
  `);
  const row = rows[0];
  if (
    !row ||
    typeof row.allowed !== "boolean" ||
    !Number.isInteger(row.retry_after_seconds) ||
    row.retry_after_seconds < 0 ||
    row.retry_after_seconds > 60 * 60 ||
    (row.allowed && row.retry_after_seconds !== 0) ||
    (!row.allowed && row.retry_after_seconds < 1)
  ) {
    throw new Error("feedback_quality_rate_limit_result_invalid");
  }
  return {
    allowed: row.allowed,
    retryAfterSeconds: row.retry_after_seconds,
  };
}

export function createDrizzleFeedbackQualitySignalRepository(
  database: FeedbackQualityDatabase = db
): FeedbackQualitySignalRepository {
  return {
    async readOwned(input): Promise<FeedbackQualityReadDisposition> {
      return database.transaction(async (tx) => {
        const tombstones = await tx
          .select({ userId: accountDeletionRequest.userId })
          .from(accountDeletionRequest)
          .where(eq(accountDeletionRequest.userId, input.userId))
          .limit(1);
        if (tombstones[0]) return { disposition: "not_found" };

        const source = await loadOwnedQualitySource(tx, input);
        if (!source) return { disposition: "not_found" };
        const rows = await tx
          .select()
          .from(feedbackQualitySignal)
          .where(
            and(
              eq(feedbackQualitySignal.userId, input.userId),
              eq(feedbackQualitySignal.feedbackId, source.feedbackId)
            )
          )
          .limit(1);
        const signal = hydrateFeedbackQualitySignalRow(rows[0]);
        if (rows[0] && (!signal || signal.outcome !== source.outcome)) {
          return { disposition: "signal_invalid" };
        }
        return {
          disposition: "available",
          state: { outcome: source.outcome, signal },
        };
      });
    },

    async writeOwned(input): Promise<FeedbackQualityWriteDisposition> {
      return database.transaction(async (tx) => {
        await lockAccountIdentity(tx, input.userId);
        const users = await tx
          .select({ id: appUser.id })
          .from(appUser)
          .where(eq(appUser.id, input.userId))
          .limit(1)
          .for("update");
        const tombstones = await tx
          .select({ userId: accountDeletionRequest.userId })
          .from(accountDeletionRequest)
          .where(eq(accountDeletionRequest.userId, input.userId))
          .limit(1);
        if (tombstones[0]) {
          return { disposition: "account_deletion_pending" };
        }
        if (!users[0]) return { disposition: "not_found" };

        const lockedSources = await tx
          .select({ id: feedback.id })
          .from(interviewSession)
          .innerJoin(feedback, eq(feedback.sessionId, interviewSession.id))
          .where(
            and(
              eq(interviewSession.id, input.sessionId),
              eq(interviewSession.userId, input.userId),
              eq(feedback.status, "completed")
            )
          )
          .limit(1)
          .for("update");
        if (!lockedSources[0]) return { disposition: "not_found" };

        const source = await loadOwnedQualitySource(tx, input);
        if (!source || source.outcome !== input.outcome) {
          return { disposition: "not_found" };
        }
        const currentRows = await tx
          .select()
          .from(feedbackQualitySignal)
          .where(
            and(
              eq(feedbackQualitySignal.userId, input.userId),
              eq(feedbackQualitySignal.feedbackId, source.feedbackId)
            )
          )
          .limit(1)
          .for("update");
        const current = hydrateFeedbackQualitySignalRow(currentRows[0]);
        if (
          currentRows[0] &&
          (!current || current.outcome !== source.outcome)
        ) {
          return { disposition: "signal_invalid" };
        }

        if (current) {
          if (sameSelection(current, input.command)) {
            return {
              disposition: "unchanged",
              state: { outcome: source.outcome, signal: current },
            };
          }
          if (input.command.expectedRevision !== current.revision) {
            return {
              disposition: "conflict",
              state: { outcome: source.outcome, signal: current },
            };
          }
          const updatedRows = await tx
            .update(feedbackQualitySignal)
            .set({
              response: input.command.response,
              reason: input.command.reason,
              revision: current.revision + 1,
              updatedAt: sql`clock_timestamp()`,
            })
            .where(
              and(
                eq(feedbackQualitySignal.id, currentRows[0]!.id),
                eq(feedbackQualitySignal.userId, input.userId),
                eq(feedbackQualitySignal.revision, current.revision)
              )
            )
            .returning();
          const updated = hydrateFeedbackQualitySignalRow(updatedRows[0]);
          return updated
            ? {
                disposition: "updated",
                state: { outcome: source.outcome, signal: updated },
              }
            : { disposition: "signal_invalid" };
        }

        if (input.command.expectedRevision !== null) {
          return {
            disposition: "conflict",
            state: { outcome: source.outcome, signal: null },
          };
        }
        const insertedRows = await tx
          .insert(feedbackQualitySignal)
          .values({
            userId: input.userId,
            sessionId: input.sessionId,
            feedbackId: source.feedbackId,
            contractVersion: input.command.contractVersion,
            reviewOutcome: source.outcome,
            response: input.command.response,
            reason: input.command.reason,
          })
          .onConflictDoNothing()
          .returning();
        const inserted = hydrateFeedbackQualitySignalRow(insertedRows[0]);
        return inserted
          ? {
              disposition: "created",
              state: { outcome: source.outcome, signal: inserted },
            }
          : { disposition: "signal_invalid" };
      });
    },
  };
}

export const drizzleFeedbackQualitySignalRepository =
  createDrizzleFeedbackQualitySignalRepository();

export function hydrateFeedbackQualitySignalRow(
  row: FeedbackQualitySignalRow | undefined
): FeedbackQualitySignalView | null {
  if (!row) return null;
  return parseFeedbackQualitySignalView({
    contractVersion: row.contractVersion,
    outcome: row.reviewOutcome,
    response: row.response,
    reason: row.reason,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

async function loadOwnedQualitySource(
  database: FeedbackQualityDatabaseExecutor,
  input: { userId: string; sessionId: string }
): Promise<{ feedbackId: string; outcome: FeedbackQualityOutcome } | null> {
  const sources = await database
    .select({
      userId: interviewSession.userId,
      sessionId: interviewSession.id,
      roundType: interviewSession.roundType,
      feedbackId: feedback.id,
      feedbackStatus: feedback.status,
    })
    .from(interviewSession)
    .innerJoin(feedback, eq(feedback.sessionId, interviewSession.id))
    .where(
      and(
        eq(interviewSession.id, input.sessionId),
        eq(interviewSession.userId, input.userId)
      )
    )
    .limit(2);
  const source = sources[0];
  if (
    !source ||
    sources.length !== 1 ||
    source.userId !== input.userId ||
    source.sessionId !== input.sessionId ||
    source.feedbackStatus !== "completed"
  ) {
    return null;
  }

  const feedbackRows = await buildFeedbackReadQuery(database, input.sessionId);
  const boundedRow = feedbackRows[0];
  if (!boundedRow || boundedRow.id !== source.feedbackId) return null;
  const bounded = decodeBoundedFeedbackReadRow(boundedRow);
  const evidenceTurns =
    bounded.schemaVersion === FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION
      ? []
      : await buildFeedbackEvidenceTurnsQuery(database, input.sessionId);
  let answerBlocks: CandidateAnswerBlock[] = [];
  let frozenEvidenceState: "complete" | "partial" | undefined;
  if (bounded.schemaVersion === FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION) {
    const frozen = await getFrozenFeedbackEvaluationEvidence(
      input.sessionId,
      database
    );
    const prepared =
      prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot(frozen);
    answerBlocks = prepared.eligible ? prepared.blocks : [];
    frozenEvidenceState =
      frozen.snapshotValid &&
      (frozen.snapshotState === "complete" ||
        frozen.snapshotState === "partial")
        ? frozen.snapshotState
        : undefined;
  }
  const presented = presentCompletedFeedback(
    {
      id: bounded.id,
      sessionId: bounded.sessionId,
      structureScore: bounded.structureScore,
      clarityScore: bounded.clarityScore,
      insightScore: bounded.insightScore,
      communicationScore: bounded.communicationScore,
      leadershipScore: bounded.leadershipScore,
      overallScore: bounded.overallScore,
      strengths: bounded.strengths,
      improvements: bounded.improvements,
      drills: bounded.drills,
      summary: bounded.summary,
      rubricVersion: bounded.rubricVersion,
      schemaVersion: bounded.schemaVersion,
      promptVersion: bounded.promptVersion,
      modelVersion: bounded.modelVersion,
      evaluationState: bounded.evaluationState,
      feedbackMode: bounded.feedbackMode,
      feedbackRoundType: bounded.feedbackRoundType,
      dimensionCoverage: bounded.dimensionCoverage,
      createdAt: bounded.createdAt,
    },
    {
      evidenceTurns,
      answerBlocks,
      expectedRoundType:
        source.roundType === "product_sense" ||
        source.roundType === "execution" ||
        source.roundType === "behavioral" ||
        source.roundType === "strategy"
          ? source.roundType
          : undefined,
      frozenEvidenceState,
      scoreWithheldReason:
        bounded.schemaVersion === FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION &&
        hasEvidenceLimitedOnlyConstraint(bounded.completionStats)
          ? "verified_evidence_integrity"
          : "rubric_coverage",
    }
  );
  const outcome = deriveFeedbackQualityOutcome(presented);
  return outcome ? { feedbackId: source.feedbackId, outcome } : null;
}

function sameSelection(
  current: FeedbackQualitySignalView,
  command: FeedbackQualitySignalCommand
): boolean {
  return (
    current.response === command.response && current.reason === command.reason
  );
}

function hasEvidenceLimitedOnlyConstraint(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "feedbackModeConstraint" in value &&
    value.feedbackModeConstraint === "evidence_limited_only"
  );
}
