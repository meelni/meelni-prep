import {
  QuestionSyncLockUnavailableError,
  withQuestionSyncLock,
  type QuestionSyncLockResult,
} from "@/lib/db/question-sync-lock";
import { prepareQuestionSyncSource } from "@/scripts/sync-questions-from-sheet";
import { mutatePreparedQuestionSync } from "@/lib/question-sync/mutation";
import type { QuestionSyncStore } from "@/lib/question-sync/store";
import type {
  PreparedQuestionSync,
  SyncResult,
} from "@/lib/question-sync/types";

export type QuestionSyncTrigger = "cron" | "manual" | "cli";

export interface QuestionSyncWorkflowInput {
  trigger: QuestionSyncTrigger;
  dryRun: boolean;
}

export interface QuestionSyncSummary {
  questionsAdded: number;
  questionsUpdated: number;
  questionsDeactivated: number;
  questionsSkipped: number;
  totalProcessed: number;
  errors: number;
}

export type QuestionSyncWorkflowResult =
  | {
      status: "completed";
      success: true;
      trigger: QuestionSyncTrigger;
      dryRun: boolean;
      triggeredAt: string;
      summary: QuestionSyncSummary;
    }
  | {
      status: "busy";
      success: false;
      trigger: QuestionSyncTrigger;
      dryRun: boolean;
      triggeredAt: string;
      errorCode: "question_sync_in_progress";
    }
  | {
      status: "failed" | "unavailable";
      success: false;
      trigger: QuestionSyncTrigger;
      dryRun: boolean;
      triggeredAt: string;
      errorCode: "question_sync_failed" | "question_sync_unavailable";
    };

export interface QuestionSyncAuditEvent {
  event: "question_sync_outcome";
  trigger: QuestionSyncTrigger;
  dryRun: boolean;
  outcome: "completed" | "busy" | "failed" | "unavailable";
  durationMs: number;
  summary?: QuestionSyncSummary;
  errorCode?:
    | "question_sync_in_progress"
    | "question_sync_failed"
    | "question_sync_unavailable";
}

export interface QuestionSyncWorkflowDependencies {
  prepare(): Promise<PreparedQuestionSync>;
  mutate(
    prepared: PreparedQuestionSync,
    options: { dryRun: boolean },
    store: QuestionSyncStore
  ): Promise<SyncResult>;
  withLock<T>(
    run: (store: QuestionSyncStore) => Promise<T>
  ): Promise<QuestionSyncLockResult<T>>;
  audit(event: QuestionSyncAuditEvent): void;
  now(): Date;
}

const defaultDependencies: QuestionSyncWorkflowDependencies = {
  prepare: prepareQuestionSyncSource,
  mutate: mutatePreparedQuestionSync,
  withLock: withQuestionSyncLock,
  audit: logQuestionSyncAudit,
  now: () => new Date(),
};

export async function runQuestionSyncWorkflow(
  input: QuestionSyncWorkflowInput,
  dependencies: QuestionSyncWorkflowDependencies = defaultDependencies
): Promise<QuestionSyncWorkflowResult> {
  const startedAt = dependencies.now();
  const triggeredAt = startedAt.toISOString();

  try {
    // Provider I/O is deliberately outside the transaction. The transaction
    // then fences the complete database read/plan/write mutation.
    const prepared = await dependencies.prepare();
    const locked = await dependencies.withLock((store) =>
      dependencies.mutate(prepared, { dryRun: input.dryRun }, store)
    );

    if (!locked.acquired) {
      return finish(
        {
          status: "busy",
          success: false,
          trigger: input.trigger,
          dryRun: input.dryRun,
          triggeredAt,
          errorCode: "question_sync_in_progress",
        },
        startedAt,
        dependencies
      );
    }

    const result = locked.value;
    if (!result?.success) {
      return finish(
        {
          status: "failed",
          success: false,
          trigger: input.trigger,
          dryRun: input.dryRun,
          triggeredAt,
          errorCode: "question_sync_failed",
        },
        startedAt,
        dependencies
      );
    }

    return finish(
      {
        status: "completed",
        success: true,
        trigger: input.trigger,
        dryRun: input.dryRun,
        triggeredAt,
        summary: safeSummary(result),
      },
      startedAt,
      dependencies
    );
  } catch (error) {
    const unavailable = error instanceof QuestionSyncLockUnavailableError;
    return finish(
      {
        status: unavailable ? "unavailable" : "failed",
        success: false,
        trigger: input.trigger,
        dryRun: input.dryRun,
        triggeredAt,
        errorCode: unavailable
          ? "question_sync_unavailable"
          : "question_sync_failed",
      },
      startedAt,
      dependencies
    );
  }
}

function safeSummary(result: SyncResult): QuestionSyncSummary {
  return {
    questionsAdded: result.questionsAdded,
    questionsUpdated: result.questionsUpdated,
    questionsDeactivated: result.questionsDeactivated,
    questionsSkipped: result.questionsSkipped,
    totalProcessed: result.totalProcessed,
    errors: result.errors,
  };
}

function finish<T extends QuestionSyncWorkflowResult>(
  result: T,
  startedAt: Date,
  dependencies: QuestionSyncWorkflowDependencies
): T {
  const event: QuestionSyncAuditEvent = {
    event: "question_sync_outcome",
    trigger: result.trigger,
    dryRun: result.dryRun,
    outcome: result.status,
    durationMs: Math.max(0, dependencies.now().getTime() - startedAt.getTime()),
  };

  if (result.status === "completed") event.summary = result.summary;
  else event.errorCode = result.errorCode;

  dependencies.audit(event);
  return result;
}

function logQuestionSyncAudit(event: QuestionSyncAuditEvent): void {
  console.info("question_sync_audit", JSON.stringify(event));
}
