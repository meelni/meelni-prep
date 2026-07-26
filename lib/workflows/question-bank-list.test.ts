import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeLikePattern,
  getPublishedQuestions,
  type QuestionBankRecord,
  type QuestionListFilter,
  type QuestionListStore,
} from "@/lib/db/questions";
import { handleQuestionsListRequest } from "@/app/api/questions/route";
import { NextRequest } from "next/server";
import { mapQuestionType } from "@/scripts/sync-questions-from-sheet";
import {
  getMissingQuestionRounds,
  getQuestionSyncSafetyError,
} from "@/lib/question-sync/safety";
import { parseIntegerParam } from "@/app/api/questions/route";

const records: QuestionBankRecord[] = [
  question("product-1", "Product Sense", true),
  question("product-legacy", "Product design/strategy", true),
  question("behavioral-1", "Behavioral", true),
  question("execution-1", "Execution", true),
  question("experiment-legacy", "A/B Testing", true),
  question("estimation-legacy", "Estimation", true),
  question("pricing-legacy", "Pricing", true),
  question("strategy-1", "Strategy", true),
  question("strategy-legacy", "Product Strategy", true),
  question("inactive", "Execution", false),
  question("quarantined", "Execution", false),
  question("retired", "Behavioral", false),
];

test("question listing resolves every canonical round and legacy stored aliases", async () => {
  const expectedIds = {
    product_sense: ["product-1", "product-legacy"],
    behavioral: ["behavioral-1"],
    execution: [
      "execution-1",
      "experiment-legacy",
      "estimation-legacy",
      "pricing-legacy",
    ],
    strategy: ["strategy-1", "strategy-legacy"],
  } as const;

  for (const [roundType, ids] of Object.entries(expectedIds)) {
    const result = await getPublishedQuestions(
      {
        roundType: roundType as keyof typeof expectedIds,
        limit: 20,
      },
      createMemoryStore(records)
    );

    assert.deepEqual(
      result.questions.map((record) => record.id),
      ids
    );
    assert.equal(result.total, ids.length);
  }
});

test("active filtering happens before pagination and returns the true total", async () => {
  const result = await getPublishedQuestions(
    {
      roundType: "execution",
      limit: 2,
      offset: 1,
    },
    createMemoryStore(records)
  );

  assert.deepEqual(
    result.questions.map((record) => record.id),
    ["experiment-legacy", "estimation-legacy"]
  );
  assert.equal(result.total, 4);
});

test("question listing applies search before pagination and count", async () => {
  const result = await getPublishedQuestions(
    { search: "pricing", limit: 1 },
    createMemoryStore(records)
  );

  assert.deepEqual(
    result.questions.map((record) => record.id),
    ["pricing-legacy"]
  );
  assert.equal(result.total, 1);
});

test("legacy labels are canonicalized in question API records", async () => {
  const result = await getPublishedQuestions(
    { limit: 20 },
    createMemoryStore(records)
  );

  assert.deepEqual(
    new Set(result.questions.map((record) => record.questionType)),
    new Set(["Product Sense", "Behavioral", "Execution", "Strategy"])
  );
});

test("public question route cannot opt into inactive historical rows", async () => {
  for (const suffix of ["", "?activeOnly=false", "?activeOnly=true"]) {
    const response = await handleQuestionsListRequest(
      new NextRequest(`http://localhost/api/questions${suffix}`),
      {
        getPublishedQuestions: (options) =>
          getPublishedQuestions(options, createMemoryStore(records)),
      }
    );
    const body = (await response.json()) as {
      questions: QuestionBankRecord[];
      pagination: { total: number };
    };

    assert.equal(response.status, 200);
    assert.equal(
      body.questions.every((question) => question.isActive),
      true
    );
    assert.equal(body.pagination.total, 9);
    assert.deepEqual(
      body.questions
        .map((question) => question.id)
        .filter((id) => ["inactive", "quarantined", "retired"].includes(id)),
      []
    );
  }
});

test("public question route reports an empty corpus as unavailable", async () => {
  const response = await handleQuestionsListRequest(
    new NextRequest("http://localhost/api/questions"),
    {
      getPublishedQuestions: async () => ({ questions: [], total: 0 }),
    }
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Question bank is temporarily unavailable",
    code: "question_bank_unavailable",
  });
});

test("public question route preserves valid empty filtered results", async () => {
  const response = await handleQuestionsListRequest(
    new NextRequest("http://localhost/api/questions?type=strategy"),
    {
      getPublishedQuestions: async () => ({ questions: [], total: 0 }),
    }
  );

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).questions, []);
});

test("sheet ingestion writes database-compatible four-round labels", () => {
  assert.equal(mapQuestionType("Leadership & Drive"), "Behavioral");
  assert.equal(mapQuestionType("Product Design"), "Product Sense");
  assert.equal(mapQuestionType("A/B Testing"), "Execution");
  assert.equal(mapQuestionType("Estimation"), "Execution");
  assert.equal(mapQuestionType("Pricing"), "Execution");
  assert.equal(mapQuestionType("Product Strategy"), "Product Strategy");
  assert.equal(mapQuestionType("unknown category"), null);
});

test("question route pagination accepts only whole-number parameters", () => {
  assert.equal(parseIntegerParam(null, 100), 100);
  assert.equal(parseIntegerParam("20", 100), 20);
  assert.equal(parseIntegerParam("abc", 100), null);
  assert.equal(parseIntegerParam("10junk", 100), null);
  assert.equal(parseIntegerParam("1.5", 100), null);
  assert.equal(parseIntegerParam("-1", 100), null);
  assert.equal(parseIntegerParam("9007199254740993", 100), null);
  assert.equal(parseIntegerParam("9".repeat(400), 100), null);
});

test("question search escapes SQL wildcard characters for literal matching", () => {
  assert.equal(escapeLikePattern("100%_match\\path"), "100\\%\\_match\\\\path");
});

test("question sync aborts unsafe validation and deactivation plans", () => {
  assert.match(
    getQuestionSyncSafetyError({
      sourceRows: 100,
      validRows: 0,
      activeExistingRows: 100,
      deactivationRows: 100,
    }) || "",
    /no source rows passed validation/
  );
  assert.match(
    getQuestionSyncSafetyError({
      sourceRows: 100,
      validRows: 60,
      activeExistingRows: 100,
      deactivationRows: 10,
    }) || "",
    /only 60\.0%/
  );
  assert.match(
    getQuestionSyncSafetyError({
      sourceRows: 100,
      validRows: 100,
      activeExistingRows: 100,
      deactivationRows: 26,
    }) || "",
    /26\.0% of active questions/
  );
  assert.match(
    getQuestionSyncSafetyError({
      sourceRows: 19,
      validRows: 19,
      activeExistingRows: 19,
      deactivationRows: 19,
    }) || "",
    /100\.0% of active questions/
  );
  assert.equal(
    getQuestionSyncSafetyError({
      sourceRows: 100,
      validRows: 95,
      activeExistingRows: 100,
      deactivationRows: 5,
    }),
    null
  );
});

test("question sync requires source coverage for every interview round", () => {
  assert.deepEqual(
    getMissingQuestionRounds([
      { questionType: "Product Sense" },
      { questionType: "Behavioral" },
      { questionType: "Execution" },
    ]),
    ["strategy"]
  );
  assert.deepEqual(
    getMissingQuestionRounds([
      { questionType: "Product design/strategy" },
      { questionType: "Behavioral" },
      { questionType: "Pricing" },
      { questionType: "Product Strategy" },
    ]),
    []
  );
});

function createMemoryStore(source: QuestionBankRecord[]): QuestionListStore {
  function applyFilter(filter: QuestionListFilter) {
    return source.filter(
      (record) =>
        record.isActive &&
        (!filter.search ||
          record.questionText
            .toLowerCase()
            .includes(filter.search.toLowerCase()) ||
          record.company
            ?.toLowerCase()
            .includes(filter.search.toLowerCase())) &&
        (!filter.questionTypes ||
          filter.questionTypes.includes(record.questionType))
    );
  }

  return {
    async findMany(filter, { limit, offset }) {
      return applyFilter(filter).slice(offset, offset + limit);
    },
    async count(filter) {
      return applyFilter(filter).length;
    },
  };
}

function question(
  id: string,
  questionType: string,
  isActive: boolean
): QuestionBankRecord {
  return {
    id,
    company: "Example",
    questionText: `Question ${id}`,
    questionType,
    askedAt: null,
    isActive,
    createdAt: null,
  };
}
