import assert from "node:assert/strict";
import test from "node:test";

import {
  addQuestionSelectionToStartConfig,
  createExplicitQuestionSelection,
  createRankedQuestionSelection,
  isEmbeddedQuestionSelection,
  readQuestionSelectionFromStartConfig,
} from "./question-selection";
import {
  QUESTION_RANKER_VERSION,
  QUESTION_RANKING_CONTRACT_VERSION,
} from "./question-ranking";

test("explicit selection preserves the selected question snapshot byte-for-byte", () => {
  const selected = createExplicitQuestionSelection({
    id: "question-explicit",
    company: " Acme & Co. ",
    text: "  Keep deliberate whitespace?  ",
    type: "Product Sense / Custom",
    roundType: "product_sense",
    askedAt: "2026-08-01T00:00:00.000Z",
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
  });
  const decoded = readQuestionSelectionFromStartConfig(
    addQuestionSelectionToStartConfig({ duration: 30 }, selected)
  );

  assert.deepEqual(decoded, selected);
  assert.equal(decoded?.question.text, "  Keep deliberate whitespace?  ");
  assert.equal(decoded?.question.company, " Acme & Co. ");
  assert.equal(decoded?.question.type, "Product Sense / Custom");
  assert.equal(decoded?.reasonCode, "explicit_override");
});

test("ranked fallback persists compact replay metadata without scores or evidence", () => {
  const selected = createRankedQuestionSelection({
    candidate: {
      id: "fallback:question:v1:strategy",
      text: "How would you evaluate a new market?",
      company: null,
      roundType: "strategy",
      difficulty: "intermediate",
      sourceKind: "embedded_fallback",
      qualityStatus: "built_in_fallback",
      askedAt: null,
      isActive: true,
    },
    questionType: "Strategy",
    receipt: {
      contractVersion: QUESTION_RANKING_CONTRACT_VERSION,
      rankerVersion: QUESTION_RANKER_VERSION,
      catalogVersion: "question-catalog:empty",
      questionId: "fallback:question:v1:strategy",
      reasonCode: "catalog_fallback",
    },
  });
  const serialized = JSON.stringify(selected);

  assert.equal(isEmbeddedQuestionSelection(selected), true);
  assert.equal(selected.mode, "catalog_fallback");
  assert.equal(serialized.includes("score"), false);
  assert.equal(serialized.includes("history"), false);
  assert.equal(serialized.includes("feedback"), false);
  assert.deepEqual(
    readQuestionSelectionFromStartConfig({
      questionSelectionV1: selected,
    }),
    selected
  );
});

test("invalid or mismatched replay metadata is rejected", () => {
  assert.equal(readQuestionSelectionFromStartConfig({}), null);
  assert.equal(
    readQuestionSelectionFromStartConfig({
      questionSelectionV1: {
        contractVersion: "question-selection.v1",
        mode: "ranked",
        reasonCode: "requested_round",
        rankerVersion: QUESTION_RANKER_VERSION,
        catalogVersion: "catalog:v1",
        questionId: "different-id",
        question: {
          id: "question-id",
          company: null,
          text: "Question",
          type: "Strategy",
          roundType: "strategy",
          askedAt: null,
          isActive: true,
          createdAt: null,
        },
      },
    }),
    null
  );
});
