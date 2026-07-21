import {
  FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION,
  parseFocusedPracticeAttempt,
  type FocusedPracticeAttempt,
  type InProgressFocusedPracticeAttempt,
} from "@meelni/core";
import { and, eq } from "drizzle-orm";

import { lockAccountIdentity } from "@/lib/db/account-identity-lock";
import {
  buildFeedbackReadQuery,
  decodeBoundedFeedbackReadRow,
} from "@/lib/db/feedback";
import { buildFeedbackEvidenceTurnsQuery } from "@/lib/db/transcripts";
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
            eq(focusedPracticeAttempt.sourceSessionId, input.sourceSessionId),
            eq(focusedPracticeAttempt.contractVersion, input.contractVersion)
          )
        )
        .limit(1);
      return hydrateAttempt(rows[0]);
    },

    async loadOwnedSource(input) {
      return database.transaction(async (tx) => {
        const rows = await tx
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
          tx,
          input.sourceSessionId
        );
        const evidenceTurns = await buildFeedbackEvidenceTurnsQuery(
          tx,
          input.sourceSessionId
        );
        const boundedFeedback = feedbackRows[0];
        if (!boundedFeedback || boundedFeedback.id !== source.feedbackId) {
          return null;
        }

        return {
          userId: source.userId,
          sessionId: source.sessionId,
          feedbackId: source.feedbackId,
          roundType: source.roundType,
          feedbackStatus: source.feedbackStatus,
          question:
            source.questionId && source.questionText
              ? {
                  questionId: source.questionId,
                  questionText: source.questionText,
                }
              : null,
          feedback: decodeBoundedFeedbackReadRow(boundedFeedback),
          evidenceTurns,
        } satisfies BoundedFocusedPracticeSource;
      });
    },

    async createOrLoadOwned(input) {
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

        const existingRows = await tx
          .select()
          .from(focusedPracticeAttempt)
          .where(
            and(
              eq(focusedPracticeAttempt.userId, input.userId),
              eq(focusedPracticeAttempt.sourceSessionId, input.sourceSessionId),
              eq(
                focusedPracticeAttempt.contractVersion,
                FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION
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

        const insertedRows = await tx
          .insert(focusedPracticeAttempt)
          .values(toInsertValues(input.attempt))
          .onConflictDoNothing()
          .returning();
        const inserted = hydrateAttempt(insertedRows[0]);
        if (!inserted || inserted.state !== "in_progress") {
          return { disposition: "source_conflict" } as const;
        }
        return { disposition: "created", attempt: inserted } as const;
      });
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
): FocusedPracticeAttempt | null {
  return hydrateAttempt(row);
}

function hydrateAttempt(
  row: FocusedPracticeAttemptRow | undefined
): FocusedPracticeAttempt | null {
  if (!row) return null;
  if (
    !isRecord(row.plan) ||
    row.plan.contractVersion !== row.planContractVersion ||
    row.plan.templateVersion !== row.planTemplateVersion ||
    row.plan.templateId !== row.planTemplateId
  ) {
    return null;
  }
  const decoded = parseFocusedPracticeAttempt({
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

function toInsertValues(attempt: InProgressFocusedPracticeAttempt) {
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
