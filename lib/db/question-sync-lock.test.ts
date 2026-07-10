import assert from "node:assert/strict";
import test from "node:test";

import {
  QuestionSyncLockUnavailableError,
  runQuestionSyncTransaction,
  type QuestionSyncTransactionScope,
} from "./question-sync-lock";
import type { StoredQuestionSyncQuestion } from "@/lib/question-sync/source";
import type { QuestionSyncStore } from "@/lib/question-sync/store";
import { mutatePreparedQuestionSync } from "@/lib/question-sync/mutation";
import type {
  PreparedQuestionSync,
  ProcessedQuestion,
} from "@/lib/question-sync/types";

test("a connection loss after writes rolls back the transaction-bound store", async () => {
  const committed: StoredQuestionSyncQuestion[] = [];
  const begin = transactionalBegin(committed, { failCommit: true });

  await assert.rejects(
    runQuestionSyncTransaction(begin, async (store) => {
      await store.insertQuestions([question()]);
      return "done";
    }),
    /connection lost/
  );
  assert.deepEqual(committed, []);
});

test("callback failures roll back all writes on the lock-owning transaction", async () => {
  const committed: StoredQuestionSyncQuestion[] = [];
  const begin = transactionalBegin(committed);

  await assert.rejects(
    runQuestionSyncTransaction(begin, async (store) => {
      await store.insertQuestions([question()]);
      throw new Error("mutation failed");
    }),
    /mutation failed/
  );
  assert.deepEqual(committed, []);
});

test("a later insert-batch failure rolls back earlier inserts and every deactivation", async () => {
  const retained = Array.from({ length: 4 }, (_, index) =>
    question({ questionText: `Retained ${index}` })
  );
  const removed = question({ questionText: "Removed" });
  const committed: StoredQuestionSyncQuestion[] = [...retained, removed].map(
    (row, index) => ({ ...row, id: `existing-${index}`, isActive: true })
  );
  const before = committed.map((row) => ({ ...row }));
  const added = Array.from({ length: 501 }, (_, index) =>
    question({ questionText: `Added ${index}` })
  );
  const prepared: PreparedQuestionSync = {
    questions: [...retained, ...added],
    sourceRows: retained.length + added.length,
    validRows: retained.length + added.length,
    questionsSkipped: 0,
  };

  await assert.rejects(
    runQuestionSyncTransaction(
      transactionalBegin(committed, { failInsertCall: 2 }),
      (store) => mutatePreparedQuestionSync(prepared, { dryRun: false }, store)
    ),
    /insert batch failed/
  );
  assert.deepEqual(committed, before);
});

test("pre-lock transaction failures map to lock unavailable", async () => {
  await assert.rejects(
    runQuestionSyncTransaction(
      async () => {
        throw new Error("database unavailable");
      },
      async () => "never"
    ),
    QuestionSyncLockUnavailableError
  );
});

function transactionalBegin(
  committed: StoredQuestionSyncQuestion[],
  options: { failCommit?: boolean; failInsertCall?: number } = {}
) {
  return async <T>(
    callback: (
      scope: QuestionSyncTransactionScope
    ) => Promise<{ acquired: boolean; value?: T }>
  ) => {
    const working = committed.map((row) => ({ ...row }));
    const result = await callback({
      tryAcquireLock: async () => true,
      store: memoryStore(working, options),
    });
    if (options.failCommit) throw new Error("connection lost before commit");
    committed.splice(0, committed.length, ...working);
    return result;
  };
}

function memoryStore(
  rows: StoredQuestionSyncQuestion[],
  options: { failInsertCall?: number } = {}
): QuestionSyncStore {
  let insertCalls = 0;
  return {
    listQuestions: async () => rows,
    insertQuestions: async (questions) => {
      insertCalls++;
      if (insertCalls === options.failInsertCall) {
        throw new Error("insert batch failed");
      }
      rows.push(
        ...questions.map((item, index) => ({
          ...item,
          id: `new-${index}`,
          isActive: true,
        }))
      );
    },
    setQuestionsActive: async (ids, isActive) => {
      for (const row of rows) {
        if (ids.includes(row.id)) row.isActive = isActive;
      }
    },
  };
}

function question(
  overrides: Partial<ProcessedQuestion> = {}
): ProcessedQuestion {
  return {
    company: "Meta",
    questionText: "Improve Search",
    questionType: "Product Sense",
    askedAt: null,
    ...overrides,
  };
}
