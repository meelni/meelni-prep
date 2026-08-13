import {
  FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION,
  FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION,
  parseAnyFocusedPracticeAttempt,
  type AnyFocusedPracticeAttempt,
  type AnyInProgressFocusedPracticeAttempt,
} from "@meelni/core";
import { and, eq } from "drizzle-orm";

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
import { createFocusedPracticeSourceFingerprint } from "@/lib/focused-practice/source-fingerprint";
import {
  transitionFocusedPracticeAttemptCompletion,
  type BoundedFocusedPracticeSource,
  type FocusedPracticeAttemptRepository,
} from "@/lib/workflows/focused-practice-attempt";

import { db } from "./index";
import {
  accountDeletionRequest,
  appUser,
  feedback,
  focusedPracticeAttempt,
  interviewQuestion,
  interviewSession,
  sessionQuestion,
} from "./schema";

type FocusedPracticeDatabase = typeof db;
type FocusedPracticeAttemptRow = typeof focusedPracticeAttempt.$inferSelect;

export function createDrizzleFocusedPracticeAttemptRepository(
  database: FocusedPracticeDatabase = db
): FocusedPracticeAttemptRepository {
  return {
    async findOwnedBySource(input) {
      const rows = await database
        .select()
        .from(focusedPracticeAttempt)
        .where(
          and(
            eq(focusedPracticeAttempt.userId, input.userId),
            eq(focusedPracticeAttempt.sourceSessionId, input.sourceSessionId)
          )
        )
        .limit(1);
      return hydrateAttempt(rows[0]);
    },

    async loadOwnedSource(input) {
      return database.transaction((tx) => loadOwnedSourceSnapshot(tx, input));
    },

    async createOrLoadOwned(input) {
      return database.transaction(
        async (tx) => {
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
            return { disposition: "account_deletion_pending" } as const;
          }
          if (!users[0]) return { disposition: "not_found" } as const;

          const existingRows = await tx
            .select()
            .from(focusedPracticeAttempt)
            .where(
              and(
                eq(focusedPracticeAttempt.userId, input.userId),
                eq(
                  focusedPracticeAttempt.sourceSessionId,
                  input.sourceSessionId
                )
              )
            )
            .limit(1)
            .for("update");
          const existing = hydrateAttempt(existingRows[0]);
          if (existingRows[0] && !existing) {
            return { disposition: "source_conflict" } as const;
          }
          if (existing) {
            return existing.state === "completed"
              ? { disposition: "already_completed", attempt: existing }
              : { disposition: "resumed", attempt: existing };
          }

          const sources = await tx
            .select({
              sessionId: interviewSession.id,
              feedbackId: feedback.id,
              feedbackStatus: feedback.status,
            })
            .from(interviewSession)
            .innerJoin(feedback, eq(feedback.sessionId, interviewSession.id))
            .where(
              and(
                eq(interviewSession.id, input.sourceSessionId),
                eq(interviewSession.userId, input.userId),
                eq(feedback.id, input.attempt.sourceFeedbackId)
              )
            )
            .limit(1)
            .for("update");
          if (!sources[0]) return { disposition: "not_found" } as const;
          if (sources[0].feedbackStatus !== "completed") {
            return { disposition: "source_conflict" } as const;
          }

          const currentSource = await loadOwnedSourceSnapshot(tx, input);
          if (
            !currentSource ||
            currentSource.feedbackId !== input.attempt.sourceFeedbackId ||
            (input.attempt.contractVersion ===
              FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION &&
              currentSource.sourceFingerprint !==
                input.attempt.feedbackVersion.sourceFingerprint)
          ) {
            return { disposition: "source_conflict" } as const;
          }

          const insertedRows = await tx
            .insert(focusedPracticeAttempt)
            .values(toInsertValues(input.attempt))
            .onConflictDoNothing()
            .returning();
          const inserted = hydrateAttempt(insertedRows[0]);
          if (inserted?.state === "in_progress") {
            return { disposition: "created", attempt: inserted } as const;
          }
          const winnerRows = await tx
            .select()
            .from(focusedPracticeAttempt)
            .where(
              and(
                eq(focusedPracticeAttempt.userId, input.userId),
                eq(
                  focusedPracticeAttempt.sourceSessionId,
                  input.sourceSessionId
                )
              )
            )
            .limit(1)
            .for("update");
          const winner = hydrateAttempt(winnerRows[0]);
          if (!winner) return { disposition: "source_conflict" } as const;
          return winner.state === "completed"
            ? { disposition: "already_completed", attempt: winner }
            : { disposition: "resumed", attempt: winner };
        },
        { isolationLevel: "serializable" }
      );
    },

    async getOwned(input) {
      const rows = await database
        .select()
        .from(focusedPracticeAttempt)
        .where(
          and(
            eq(focusedPracticeAttempt.id, input.attemptId),
            eq(focusedPracticeAttempt.userId, input.userId)
          )
        )
        .limit(1);
      return hydrateAttempt(rows[0]);
    },

    async completeOwned(input) {
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
          return { disposition: "account_deletion_pending" } as const;
        }
        if (!users[0]) return { disposition: "not_found" } as const;

        const currentRows = await tx
          .select()
          .from(focusedPracticeAttempt)
          .where(
            and(
              eq(focusedPracticeAttempt.id, input.attemptId),
              eq(focusedPracticeAttempt.userId, input.userId)
            )
          )
          .limit(1)
          .for("update");
        const current = hydrateAttempt(currentRows[0]);
        if (!current) return { disposition: "not_found" } as const;

        const transition = transitionFocusedPracticeAttemptCompletion({
          attempt: current,
          completion: input.completion,
          completedAt: input.completedAt,
        });
        if (transition.state === "already_completed") {
          return {
            disposition: "already_completed",
            attempt: transition.attempt,
          } as const;
        }
        if (
          transition.state !== "completed" ||
          current.lifecycleVersion !== input.expectedVersion
        ) {
          return { disposition: "conflict" } as const;
        }

        const completed = transition.attempt;
        const updatedRows = await tx
          .update(focusedPracticeAttempt)
          .set({
            state: completed.state,
            lifecycleVersion: completed.lifecycleVersion,
            completedAt: new Date(completed.completedAt),
            completion: completed.completion,
            updatedAt: new Date(completed.completedAt),
          })
          .where(
            and(
              eq(focusedPracticeAttempt.id, input.attemptId),
              eq(focusedPracticeAttempt.userId, input.userId),
              eq(focusedPracticeAttempt.lifecycleVersion, input.expectedVersion)
            )
          )
          .returning();
        const updated = hydrateAttempt(updatedRows[0]);
        return updated?.state === "completed"
          ? { disposition: "completed", attempt: updated }
          : { disposition: "conflict" };
      });
    },
  };
}

export const drizzleFocusedPracticeAttemptRepository =
  createDrizzleFocusedPracticeAttemptRepository();

export function hydrateFocusedPracticeAttemptRow(
  row: FocusedPracticeAttemptRow | undefined
): AnyFocusedPracticeAttempt | null {
  return hydrateAttempt(row);
}

function hydrateAttempt(
  row: FocusedPracticeAttemptRow | undefined
): AnyFocusedPracticeAttempt | null {
  if (!row) return null;
  if (
    !isRecord(row.plan) ||
    row.plan.contractVersion !== row.planContractVersion ||
    row.plan.templateVersion !== row.planTemplateVersion ||
    row.plan.templateId !== row.planTemplateId
  ) {
    return null;
  }
  const decoded = parseAnyFocusedPracticeAttempt({
    attemptId: row.id,
    userId: row.userId,
    sourceSessionId: row.sourceSessionId,
    sourceFeedbackId: row.sourceFeedbackId,
    contractVersion: row.contractVersion,
    lifecycleVersion: row.lifecycleVersion,
    state: row.state,
    feedbackVersion: row.feedbackVersion,
    plan: row.plan,
    sourceFinding: row.sourceFinding,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    completion: row.completion,
  });
  return decoded.state === "valid" ? decoded.attempt : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toInsertValues(attempt: AnyInProgressFocusedPracticeAttempt) {
  return {
    id: attempt.attemptId,
    userId: attempt.userId,
    sourceSessionId: attempt.sourceSessionId,
    sourceFeedbackId: attempt.sourceFeedbackId,
    contractVersion: attempt.contractVersion,
    lifecycleVersion: attempt.lifecycleVersion,
    state: attempt.state,
    feedbackVersion: attempt.feedbackVersion,
    planContractVersion: attempt.plan.contractVersion,
    planTemplateVersion: attempt.plan.templateVersion,
    planTemplateId: attempt.plan.templateId,
    plan: attempt.plan,
    sourceFinding: attempt.sourceFinding,
    startedAt: new Date(attempt.startedAt),
    completedAt: null,
    completion: null,
  };
}

type FocusedPracticeReadDatabase = Pick<FocusedPracticeDatabase, "select">;

async function loadOwnedSourceSnapshot(
  database: FocusedPracticeReadDatabase,
  input: { userId: string; sourceSessionId: string }
): Promise<BoundedFocusedPracticeSource | null> {
  const rows = await database
    .select({
      userId: interviewSession.userId,
      sessionId: interviewSession.id,
      roundType: interviewSession.roundType,
      feedbackId: feedback.id,
      feedbackStatus: feedback.status,
      questionId: interviewQuestion.id,
      questionText: interviewQuestion.questionText,
    })
    .from(interviewSession)
    .innerJoin(feedback, eq(feedback.sessionId, interviewSession.id))
    .leftJoin(
      sessionQuestion,
      eq(sessionQuestion.sessionId, interviewSession.id)
    )
    .leftJoin(
      interviewQuestion,
      eq(interviewQuestion.id, sessionQuestion.questionId)
    )
    .where(
      and(
        eq(interviewSession.id, input.sourceSessionId),
        eq(interviewSession.userId, input.userId)
      )
    )
    .limit(2);
  const source = rows[0];
  if (!source || rows.length !== 1) return null;

  const feedbackRows = await buildFeedbackReadQuery(
    database,
    input.sourceSessionId
  );
  const boundedFeedbackRow = feedbackRows[0];
  if (!boundedFeedbackRow || boundedFeedbackRow.id !== source.feedbackId) {
    return null;
  }
  const boundedFeedback = decodeBoundedFeedbackReadRow(boundedFeedbackRow);
  const evidenceTurns = await buildFeedbackEvidenceTurnsQuery(
    database,
    input.sourceSessionId
  );
  let frozenEvidenceState: "complete" | "partial" | null = null;
  let answerBlocks: BoundedFocusedPracticeSource["answerBlocks"] = [];
  let frozenEvidence: Awaited<
    ReturnType<typeof getFrozenFeedbackEvaluationEvidence>
  > | null = null;
  if (
    boundedFeedback.schemaVersion === FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION
  ) {
    frozenEvidence = await getFrozenFeedbackEvaluationEvidence(
      input.sourceSessionId,
      database
    );
    const prepared =
      prepareCandidateAnswerBlockEvidenceFromFrozenSnapshot(frozenEvidence);
    if (
      frozenEvidence.snapshotValid &&
      (frozenEvidence.snapshotState === "complete" ||
        frozenEvidence.snapshotState === "partial")
    ) {
      frozenEvidenceState = frozenEvidence.snapshotState;
    }
    answerBlocks = prepared.eligible ? prepared.blocks : [];
  }
  const question =
    source.questionId && source.questionText
      ? {
          questionId: source.questionId,
          questionText: source.questionText,
        }
      : null;
  const sourceFingerprint = createFocusedPracticeSourceFingerprint({
    userId: source.userId,
    sessionId: source.sessionId,
    feedbackId: source.feedbackId,
    roundType: source.roundType,
    feedbackStatus: source.feedbackStatus,
    question,
    feedback: boundedFeedback,
    evidenceTurns,
    frozenEvidence,
  });
  return {
    userId: source.userId,
    sessionId: source.sessionId,
    feedbackId: source.feedbackId,
    roundType: source.roundType,
    feedbackStatus: source.feedbackStatus,
    question,
    feedback: boundedFeedback,
    evidenceTurns,
    answerBlocks,
    frozenEvidenceState,
    sourceFingerprint,
    completionStats: boundedFeedback.completionStats,
  };
}
