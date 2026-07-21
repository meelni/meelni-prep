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
  const activeExistingIds = new Set(
    existingQuestions
      .filter((question) => question.isActive)
      .map((question) => question.id)
  );
  const activeRowsToDeactivate = plan.questionsToUpdate.filter(
    (question) => !question.isActive && activeExistingIds.has(question.id)
  ).length;
  const safetyError = getQuestionSyncSafetyError({
    activeExistingRows: existingQuestions.filter(
      (question) => question.isActive
    ).length,
    deactivationRows: activeRowsToDeactivate,
    sourceRows: prepared.sourceRows,
    validRows: prepared.validRows,
  });
  if (safetyError) throw new Error("question_sync_safety_abort");

  if (!options.dryRun) {
    const publishedInserts = plan.questionsToInsert.filter(
      (question) => question.qualityStatus === "published"
    );
    const quarantineInserts = plan.questionsToInsert.filter(
      (question) => question.qualityStatus !== "published"
    );
    // Canonical rows must exist before duplicate links are written. Existing
    // records update next so a provenance fingerprint can move from the
    // canonical row to its quarantine record without a transient collision.
    for (const chunk of chunks(publishedInserts, WRITE_CHUNK_SIZE)) {
      await store.writeQuestions(chunk);
    }
    for (const chunk of chunks(plan.questionsToUpdate, WRITE_CHUNK_SIZE)) {
      await store.writeQuestions(chunk);
    }
    for (const chunk of chunks(quarantineInserts, WRITE_CHUNK_SIZE)) {
      await store.writeQuestions(chunk);
    }
  }

  const publishedInserts = plan.questionsToInsert.filter(
    (question) => question.qualityStatus === "published"
  ).length;
  const publishedUpdates = plan.questionsToUpdate.filter(
    (question) => question.qualityStatus === "published"
  ).length;

  return {
    success: true,
    questionsAdded: publishedInserts,
    questionsUpdated: publishedUpdates,
    questionsDeactivated: activeRowsToDeactivate,
    questionsSkipped:
      prepared.questionsSkipped + plan.nearDuplicateRowsQuarantined,
    invalidRows: prepared.invalidRows,
    exactDuplicateRows: prepared.exactDuplicateRows,
    nearDuplicateRowsQuarantined: plan.nearDuplicateRowsQuarantined,
    duplicateRecordsRetired: plan.duplicateRecordsRetired,
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
