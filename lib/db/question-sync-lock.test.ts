import assert from "node:assert/strict";
import test from "node:test";

import {
  createQuestionSyncTransactionBegin,
  QuestionSyncLockUnavailableError,
  runQuestionSyncTransaction,
  type QuestionSyncTransactionScope,
} from "./question-sync-lock";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
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
      await store.writeQuestions([planned(question(), "new")]);
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
      await store.writeQuestions([planned(question(), "new")]);
      throw new Error("mutation failed");
    }),
    /mutation failed/
  );
  assert.deepEqual(committed, []);
});

test("a later insert-batch failure rolls back earlier inserts and every deactivation", async () => {
  const retained = Array.from({ length: 4 }, (_, index) =>
    question({
      questionText: `Retained ${index}`,
      sourceFingerprint: fingerprint(index),
    })
  );
  const removed = question({
    questionText: "Removed",
    sourceFingerprint: fingerprint(10),
  });
  const committed: StoredQuestionSyncQuestion[] = [...retained, removed].map(
    (row, index) => stored(row, `existing-${index}`)
  );
  const before = committed.map((row) => ({ ...row }));
  const added = Array.from({ length: 501 }, (_, index) =>
    question({
      questionText: `Added ${index}`,
      sourceFingerprint: fingerprint(index + 100),
    })
  );
  const prepared: PreparedQuestionSync = {
    questions: [...retained, ...added],
    sourceRows: retained.length + added.length,
    validRows: retained.length + added.length,
    invalidRows: 0,
    exactDuplicateRows: 0,
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

test("the Drizzle transaction owns both the advisory lock and sync store", async () => {
  const store = memoryStore([]);
  const transaction = {
    execute: async () => [{ acquired: true }],
  };
  let storeDatabase: unknown;
  let transactionCalls = 0;

  const database = {
    transaction: async (
      callback: (value: typeof transaction) => Promise<unknown>
    ) => {
      transactionCalls++;
      return callback(transaction);
    },
  } as unknown as PostgresJsDatabase<typeof schema>;

  const result = await runQuestionSyncTransaction(
    createQuestionSyncTransactionBegin(database, (value) => {
      storeDatabase = value;
      return store;
    }),
    async (transactionStore) => {
      assert.equal(transactionStore, store);
      return "done";
    }
  );

  assert.deepEqual(result, { acquired: true, value: "done" });
  assert.equal(transactionCalls, 1);
  assert.equal(storeDatabase, transaction);
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
  let writeCalls = 0;
  return {
    listQuestions: async () => rows,
    writeQuestions: async (questions) => {
      writeCalls++;
      if (writeCalls === options.failInsertCall) {
        throw new Error("insert batch failed");
      }
      for (const question of questions) {
        const index = rows.findIndex((row) => row.id === question.id);
        if (index === -1) rows.push({ ...question });
        else rows[index] = { ...question };
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
    sourceKind: "google_sheets",
    sourceCategory: "Product Design",
    sourceFingerprint: "f".repeat(64),
    ...overrides,
  };
}

function planned(
  source: ProcessedQuestion,
  id: string
): PlannedQuestionSyncRecord {
  return {
    ...source,
    id,
    isActive: true,
    qualityStatus: "published",
    duplicateOfQuestionId: null,
  };
}

function stored(
  source: ProcessedQuestion,
  id: string
): StoredQuestionSyncQuestion {
  return planned(source, id);
}

function fingerprint(index: number): string {
  return index.toString(16).padStart(64, "0");
}
