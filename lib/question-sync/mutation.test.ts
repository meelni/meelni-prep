import assert from "node:assert/strict";
import test from "node:test";

import { mutatePreparedQuestionSync } from "./mutation";
import type {
  PlannedQuestionSyncRecord,
  StoredQuestionSyncQuestion,
} from "./source";
import type { QuestionSyncStore } from "./store";
import type { PreparedQuestionSync, ProcessedQuestion } from "./types";

test("inactive exact identities are reactivated instead of inserted", async () => {
  const source = question();
  const calls: PlannedQuestionSyncRecord[][] = [];
  const result = await mutatePreparedQuestionSync(
    prepared([source]),
    { dryRun: false },
    store(
      [
        stored(source, {
          id: "inactive",
          isActive: false,
          qualityStatus: "retired_source_missing",
        }),
      ],
      calls
    )
  );

  assert.equal(result.questionsAdded, 0);
  assert.equal(result.questionsUpdated, 1);
  assert.equal(calls.flat()[0]?.id, "inactive");
  assert.equal(calls.flat()[0]?.qualityStatus, "published");
});

test("near duplicates are persisted as quarantined but excluded from publication counts", async () => {
  const canonical = question();
  const duplicate = question({
    askedAt: new Date("2026-02-01T00:00:00.000Z"),
    sourceFingerprint: "b".repeat(64),
  });
  const calls: PlannedQuestionSyncRecord[][] = [];
  const result = await mutatePreparedQuestionSync(
    prepared([duplicate, canonical]),
    { dryRun: false },
    store([], calls)
  );

  assert.equal(result.questionsAdded, 1);
  assert.equal(result.nearDuplicateRowsQuarantined, 1);
  assert.equal(result.questionsSkipped, 1);
  assert.equal(calls.flat().filter((record) => record.isActive).length, 1);
  assert.equal(
    calls
      .flat()
      .filter((record) => record.qualityStatus === "quarantined_near_duplicate")
      .length,
    1
  );
});

test("an earlier provenance occurrence can become canonical without a transient fingerprint collision", async () => {
  const later = question({
    askedAt: new Date("2026-02-01T00:00:00.000Z"),
    sourceFingerprint: "b".repeat(64),
  });
  const earlier = question({
    askedAt: new Date("2026-01-01T00:00:00.000Z"),
    sourceFingerprint: "a".repeat(64),
  });
  const rows = new Map<string, StoredQuestionSyncQuestion>([
    ["selected-question", stored(later, { id: "selected-question" })],
  ]);

  const result = await mutatePreparedQuestionSync(
    prepared([later, earlier]),
    { dryRun: false },
    uniqueFingerprintStore(rows)
  );

  assert.equal(result.nearDuplicateRowsQuarantined, 1);
  assert.equal(
    rows.get("selected-question")?.sourceFingerprint,
    "a".repeat(64)
  );
  assert.equal(
    [...rows.values()].some(
      (record) =>
        record.sourceFingerprint === "b".repeat(64) &&
        record.qualityStatus === "quarantined_near_duplicate" &&
        record.duplicateOfQuestionId === "selected-question"
    ),
    true
  );
});

test("a bounded surplus active duplicate converges within bulk removal safety", async () => {
  const source = question();
  const retained = Array.from({ length: 4 }, (_, index) =>
    question({
      questionText: `Retained ${index}`,
      sourceFingerprint: String(index + 1).repeat(64),
    })
  );
  const calls: PlannedQuestionSyncRecord[][] = [];
  const result = await mutatePreparedQuestionSync(
    prepared([source, ...retained]),
    { dryRun: false },
    store(
      [
        stored(source, {
          id: "z-surplus",
          sourceKind: "legacy",
          sourceFingerprint: null,
        }),
        stored(source, {
          id: "a-survivor",
          sourceKind: "legacy",
          sourceFingerprint: null,
        }),
        ...retained.map((item, index) =>
          stored(item, { id: `retained-${index}` })
        ),
      ],
      calls
    )
  );

  assert.equal(result.questionsDeactivated, 1);
  assert.equal(result.duplicateRecordsRetired, 1);
  assert.equal(
    calls.flat().find((record) => record.id === "z-surplus")
      ?.duplicateOfQuestionId,
    "a-survivor"
  );
});

test("duplicate-driven bulk retirement is covered by the safety guard", async () => {
  const greaterThan = question({
    questionText: "Should conversion be > 10%?",
    sourceFingerprint: "a".repeat(64),
  });
  const lessThan = question({
    questionText: "Should conversion be < 10%?",
    sourceFingerprint: "b".repeat(64),
  });
  const existing = Array.from({ length: 10 }, (_, index) =>
    stored(index % 2 === 0 ? greaterThan : lessThan, {
      id: `existing-${index}`,
      sourceKind: "legacy",
      sourceFingerprint: null,
    })
  );
  const calls: PlannedQuestionSyncRecord[][] = [];

  await assert.rejects(
    mutatePreparedQuestionSync(
      prepared([greaterThan, lessThan]),
      { dryRun: false },
      store(existing, calls)
    ),
    /question_sync_safety_abort/
  );
  assert.deepEqual(calls, []);
});

test("insert failure aborts before any existing-row update", async () => {
  const retained = Array.from({ length: 4 }, (_, index) =>
    question({
      questionText: `Retained ${index}`,
      sourceFingerprint: String(index + 1).repeat(64),
    })
  );
  const removed = question({
    questionText: "Removed",
    sourceFingerprint: "a".repeat(64),
  });
  const added = question({
    questionText: "Added",
    sourceFingerprint: "b".repeat(64),
  });
  const existing = [...retained, removed].map((item, index) =>
    stored(item, { id: `existing-${index}` })
  );
  const calls: PlannedQuestionSyncRecord[][] = [];
  const failingStore = store(existing, calls, { failFirstWrite: true });

  await assert.rejects(
    mutatePreparedQuestionSync(
      prepared([...retained, added]),
      { dryRun: false },
      failingStore
    ),
    /write failed/
  );
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.every((record) => !existing.some((row) => row.id === record.id)),
    true
  );
});

test("dry runs report deterministic outcomes but perform no writes", async () => {
  const calls: PlannedQuestionSyncRecord[][] = [];
  const result = await mutatePreparedQuestionSync(
    prepared([question()]),
    { dryRun: true },
    store([], calls)
  );

  assert.equal(result.questionsAdded, 1);
  assert.equal(result.exactDuplicateRows, 0);
  assert.deepEqual(calls, []);
});

function prepared(questions: ProcessedQuestion[]): PreparedQuestionSync {
  return {
    questions,
    sourceRows: questions.length,
    validRows: questions.length,
    invalidRows: 0,
    exactDuplicateRows: 0,
    questionsSkipped: 0,
  };
}

function store(
  rows: StoredQuestionSyncQuestion[],
  calls: PlannedQuestionSyncRecord[][],
  options: { failFirstWrite?: boolean } = {}
): QuestionSyncStore {
  return {
    listQuestions: async () => rows,
    writeQuestions: async (questions) => {
      calls.push([...questions]);
      if (options.failFirstWrite) throw new Error("write failed");
    },
  };
}

function uniqueFingerprintStore(
  rows: Map<string, StoredQuestionSyncQuestion>
): QuestionSyncStore {
  return {
    listQuestions: async () => [...rows.values()],
    writeQuestions: async (questions) => {
      for (const question of questions) {
        if (
          question.sourceFingerprint &&
          [...rows.values()].some(
            (row) =>
              row.id !== question.id &&
              row.sourceFingerprint === question.sourceFingerprint
          )
        ) {
          throw new Error("source fingerprint collision");
        }
        rows.set(question.id, { ...question });
      }
    },
  };
}

function stored(
  source: ProcessedQuestion,
  overrides: Partial<StoredQuestionSyncQuestion> = {}
): StoredQuestionSyncQuestion {
  return {
    ...source,
    id: "existing",
    isActive: true,
    qualityStatus: "published",
    duplicateOfQuestionId: null,
    ...overrides,
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
