import { and, eq, isNull } from "drizzle-orm";

import { db } from "./index";
import { feedback, feedbackGenerationStageAttempt } from "./schema";
import {
  normalizeFeedbackGenerationStageAttempt,
  type FeedbackGenerationStageAttemptInput,
  type NormalizedFeedbackGenerationStageAttempt,
} from "@/lib/operations/feedback-generation-stage-attempt";

export type FeedbackGenerationStageAttemptWriteResult =
  | "inserted"
  | "duplicate"
  | "conflict";

export type FeedbackGenerationStageAttemptRecordResult =
  | FeedbackGenerationStageAttemptWriteResult
  | "fenced"
  | "rejected";

export type FeedbackGenerationStageAttemptInsert = Omit<
  NormalizedFeedbackGenerationStageAttempt,
  "usage"
> & {
  feedbackId: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export interface FeedbackGenerationStageAttemptFence {
  feedbackId: string;
  generationEventId: string | null;
}

export interface FeedbackGenerationStageAttemptRepository {
  withFeedbackLock<T>(
    sessionId: string,
    work: (
      fence: FeedbackGenerationStageAttemptFence | null,
      insert: (
        record: FeedbackGenerationStageAttemptInsert
      ) => Promise<FeedbackGenerationStageAttemptWriteResult>
    ) => Promise<T>
  ): Promise<T>;
}

export interface FeedbackGenerationStageAttemptStore {
  record(
    input: FeedbackGenerationStageAttemptInput & { sessionId: string }
  ): Promise<FeedbackGenerationStageAttemptRecordResult>;
  recordMany(
    inputs: Array<FeedbackGenerationStageAttemptInput & { sessionId: string }>
  ): Promise<FeedbackGenerationStageAttemptRecordResult[]>;
}

type FeedbackGenerationStageAttemptDatabase = Pick<typeof db, "transaction">;

export function createFeedbackGenerationStageAttemptStore(
  repository: FeedbackGenerationStageAttemptRepository = createDrizzleFeedbackGenerationStageAttemptRepository()
): FeedbackGenerationStageAttemptStore {
  const recordMany: FeedbackGenerationStageAttemptStore["recordMany"] = async (
    inputs
  ) => {
    if (inputs.length === 0) return [];
    const sessionId = inputs[0]!.sessionId;
    const generationEventId = inputs[0]!.generationEventId;
    const normalized = inputs.map(({ sessionId: rowSessionId, ...input }) =>
      rowSessionId === sessionId &&
      input.generationEventId === generationEventId
        ? normalizeFeedbackGenerationStageAttempt(input)
        : null
    );
    if (normalized.some((attempt) => attempt === null)) {
      return inputs.map(() => "rejected" as const);
    }
    return repository.withFeedbackLock(sessionId, async (fence, insert) => {
      if (!fence || fence.generationEventId !== generationEventId) {
        return inputs.map(() => "fenced" as const);
      }
      const results: FeedbackGenerationStageAttemptRecordResult[] = [];
      for (const attempt of normalized) {
        results.push(await insert(flattenAttempt(fence.feedbackId, attempt!)));
      }
      return results;
    });
  };
  return {
    async record(input) {
      return (await recordMany([input]))[0] ?? "rejected";
    },
    recordMany,
  };
}

export function createDrizzleFeedbackGenerationStageAttemptRepository(
  database: FeedbackGenerationStageAttemptDatabase = db
): FeedbackGenerationStageAttemptRepository {
  return {
    withFeedbackLock(sessionId, work) {
      return database.transaction(async (tx) => {
        const rows = await tx
          .select({
            feedbackId: feedback.id,
            generationEventId: feedback.dispatchEventId,
          })
          .from(feedback)
          .where(eq(feedback.sessionId, sessionId))
          .limit(1)
          .for("update");
        return work(rows[0] ?? null, async (record) => {
          const inserted = await tx
            .insert(feedbackGenerationStageAttempt)
            .values(record)
            .onConflictDoNothing()
            .returning({ id: feedbackGenerationStageAttempt.id });
          if (inserted.length === 1) return "inserted";

          const existingRows = await tx
            .select()
            .from(feedbackGenerationStageAttempt)
            .where(exactAttempt(record))
            .limit(1);
          const existing = existingRows[0];
          return existing && immutableAttemptMatches(existing, record)
            ? "duplicate"
            : "conflict";
        });
      });
    },
  };
}

function flattenAttempt(
  feedbackId: string,
  input: NormalizedFeedbackGenerationStageAttempt
): FeedbackGenerationStageAttemptInsert {
  const { usage, ...record } = input;
  return {
    feedbackId,
    ...record,
    inputTokens: usage?.inputTokens ?? null,
    cachedInputTokens: usage?.cachedInputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
  };
}

function exactAttempt(record: FeedbackGenerationStageAttemptInsert) {
  return and(
    eq(feedbackGenerationStageAttempt.feedbackId, record.feedbackId),
    eq(
      feedbackGenerationStageAttempt.generationEventFence,
      record.generationEventFence
    ),
    eq(feedbackGenerationStageAttempt.workflowAttempt, record.workflowAttempt),
    eq(feedbackGenerationStageAttempt.operation, record.operation),
    record.providerAttempt === null
      ? isNull(feedbackGenerationStageAttempt.providerAttempt)
      : eq(
          feedbackGenerationStageAttempt.providerAttempt,
          record.providerAttempt
        )
  );
}

function immutableAttemptMatches(
  existing: typeof feedbackGenerationStageAttempt.$inferSelect,
  expected: FeedbackGenerationStageAttemptInsert
): boolean {
  return (
    existing.feedbackId === expected.feedbackId &&
    existing.generationEventFence === expected.generationEventFence &&
    existing.workflowAttempt === expected.workflowAttempt &&
    existing.operation === expected.operation &&
    existing.stage === expected.stage &&
    existing.providerAttempt === expected.providerAttempt &&
    existing.outcome === expected.outcome &&
    existing.failureClass === expected.failureClass &&
    existing.retryable === expected.retryable &&
    existing.startedAt.getTime() === expected.startedAt.getTime() &&
    existing.completedAt.getTime() === expected.completedAt.getTime() &&
    existing.durationMs === expected.durationMs &&
    existing.durationBucket === expected.durationBucket &&
    existing.remainingBudgetMs === expected.remainingBudgetMs &&
    existing.retryAfterMs === expected.retryAfterMs &&
    existing.environmentClass === expected.environmentClass &&
    existing.release === expected.release &&
    existing.providerDiagnosticKind === expected.providerDiagnosticKind &&
    existing.providerHttpStatus === expected.providerHttpStatus &&
    existing.observedModel === expected.observedModel &&
    existing.observedServiceTier === expected.observedServiceTier &&
    existing.inputTokens === expected.inputTokens &&
    existing.cachedInputTokens === expected.cachedInputTokens &&
    existing.outputTokens === expected.outputTokens &&
    existing.totalTokens === expected.totalTokens
  );
}
