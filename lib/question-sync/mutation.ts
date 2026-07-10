import { getQuestionSyncSafetyError } from "./safety";
import { planQuestionSync } from "@/lib/question-sync/source";
import type { QuestionSyncStore } from "@/lib/question-sync/store";
import type { PreparedQuestionSync, SyncResult } from "./types";

const WRITE_CHUNK_SIZE = 500;

export async function mutatePreparedQuestionSync(
  prepared: PreparedQuestionSync,
  options: { dryRun: boolean },
  store: QuestionSyncStore
): Promise<SyncResult> {
  const existingQuestions = await store.listQuestions();
  const plan = planQuestionSync(prepared.questions, existingQuestions);
  const safetyError = getQuestionSyncSafetyError({
    activeExistingRows: existingQuestions.filter(
      (question) => question.isActive
    ).length,
    // Surplus duplicates retain one active identity and are safe to converge;
    // the bulk-deactivation guard applies only to identities absent upstream.
    deactivationRows: plan.sourceMissingQuestionIdsToDeactivate.length,
    sourceRows: prepared.sourceRows,
    validRows: prepared.validRows,
  });
  if (safetyError) throw new Error("question_sync_safety_abort");

  if (!options.dryRun) {
    // Inserts and reactivations must succeed before deactivation begins. The
    // store is transaction-bound, so any later failure rolls all changes back.
    for (const chunk of chunks(plan.questionsToInsert, WRITE_CHUNK_SIZE)) {
      await store.insertQuestions(chunk);
    }
    for (const chunk of chunks(
      plan.questionIdsToReactivate,
      WRITE_CHUNK_SIZE
    )) {
      await store.setQuestionsActive(chunk, true);
    }
    for (const chunk of chunks(
      plan.questionIdsToDeactivate,
      WRITE_CHUNK_SIZE
    )) {
      await store.setQuestionsActive(chunk, false);
    }
  }

  return {
    success: true,
    questionsAdded: plan.questionsToInsert.length,
    questionsUpdated: plan.questionIdsToReactivate.length,
    questionsDeactivated: plan.questionIdsToDeactivate.length,
    questionsSkipped: prepared.questionsSkipped,
    totalProcessed: prepared.sourceRows,
    errors: 0,
    timestamp: new Date().toISOString(),
  };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
