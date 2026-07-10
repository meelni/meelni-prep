import assert from "node:assert/strict";
import test from "node:test";

import { mutatePreparedQuestionSync } from "./mutation";
import type { StoredQuestionSyncQuestion } from "./source";
import type { QuestionSyncStore } from "./store";
import type { PreparedQuestionSync, ProcessedQuestion } from "./types";

test("inactive exact identities are reactivated instead of inserted", async () => {
  const source = question();
  const calls: string[] = [];
  const result = await mutatePreparedQuestionSync(
    prepared([source]),
    { dryRun: false },
    store([{ ...source, id: "inactive", isActive: false }], calls)
  );

  assert.equal(result.questionsAdded, 0);
  assert.equal(result.questionsUpdated, 1);
  assert.deepEqual(calls, ["active:true:inactive"]);
});

test("surplus active duplicates converge without tripping bulk removal safety", async () => {
  const source = question();
  const calls: string[] = [];
  const result = await mutatePreparedQuestionSync(
    prepared([source]),
    { dryRun: false },
    store(
      [
        { ...source, id: "z-surplus", isActive: true },
        { ...source, id: "a-survivor", isActive: true },
      ],
      calls
    )
  );

  assert.equal(result.questionsDeactivated, 1);
  assert.deepEqual(calls, ["active:false:z-surplus"]);
});

test("insert failure aborts before any deactivation", async () => {
  const retained = Array.from({ length: 4 }, (_, index) =>
    question({ questionText: `Retained ${index}` })
  );
  const removed = question({ questionText: "Removed" });
  const added = question({ questionText: "Added" });
  const existing = [...retained, removed].map((item, index) => ({
    ...item,
    id: `existing-${index}`,
    isActive: true,
  }));
  const calls: string[] = [];
  const failingStore = store(existing, calls, { failInsert: true });

  await assert.rejects(
    mutatePreparedQuestionSync(
      prepared([...retained, added]),
      { dryRun: false },
      failingStore
    ),
    /insert failed/
  );
  assert.deepEqual(calls, ["insert:1"]);
});

test("dry runs use the locked snapshot but perform no writes", async () => {
  const calls: string[] = [];
  const result = await mutatePreparedQuestionSync(
    prepared([question()]),
    { dryRun: true },
    store([], calls)
  );

  assert.equal(result.questionsAdded, 1);
  assert.deepEqual(calls, []);
});

function prepared(questions: ProcessedQuestion[]): PreparedQuestionSync {
  return {
    questions,
    sourceRows: questions.length,
    validRows: questions.length,
    questionsSkipped: 0,
  };
}

function store(
  rows: StoredQuestionSyncQuestion[],
  calls: string[],
  options: { failInsert?: boolean } = {}
): QuestionSyncStore {
  return {
    listQuestions: async () => rows,
    insertQuestions: async (questions) => {
      calls.push(`insert:${questions.length}`);
      if (options.failInsert) throw new Error("insert failed");
    },
    setQuestionsActive: async (ids, active) => {
      calls.push(`active:${active}:${ids.join(",")}`);
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
