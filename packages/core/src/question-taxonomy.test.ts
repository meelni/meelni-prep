import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalQuestionTypeLabel,
  normalizeQuestionRound,
  QUESTION_ROUND_LABELS,
  QUESTION_ROUND_TYPES,
  questionTypeStorageAliasesForRound,
} from "./question-taxonomy";

test("question taxonomy exposes exactly the four PM interview rounds", () => {
  assert.deepEqual(QUESTION_ROUND_TYPES, [
    "product_sense",
    "behavioral",
    "execution",
    "strategy",
  ]);
  assert.deepEqual(QUESTION_ROUND_LABELS, {
    product_sense: "Product Sense",
    behavioral: "Behavioral",
    execution: "Execution",
    strategy: "Strategy",
  });
});

test("public aliases normalize at the question boundary", () => {
  assert.equal(normalizeQuestionRound("product_sense"), "product_sense");
  assert.equal(normalizeQuestionRound("Product Sense"), "product_sense");
  assert.equal(normalizeQuestionRound("behavioral"), "behavioral");
  assert.equal(normalizeQuestionRound("EXECUTION"), "execution");
  assert.equal(normalizeQuestionRound("product-strategy"), "strategy");
  assert.equal(normalizeQuestionRound("unknown"), null);
});

test("legacy stored labels collapse to canonical four-round labels", () => {
  assert.equal(
    canonicalQuestionTypeLabel("Product design/strategy"),
    "Product Sense"
  );
  assert.equal(canonicalQuestionTypeLabel("A/B Testing"), "Execution");
  assert.equal(canonicalQuestionTypeLabel("Estimation"), "Execution");
  assert.equal(canonicalQuestionTypeLabel("Pricing"), "Execution");
  assert.equal(canonicalQuestionTypeLabel("Product Strategy"), "Strategy");
});

test("database reads remain compatible with legacy labels during migration", () => {
  assert.deepEqual(questionTypeStorageAliasesForRound("product_sense"), [
    "Product Sense",
    "Product design/strategy",
  ]);
  assert.deepEqual(questionTypeStorageAliasesForRound("execution"), [
    "Execution",
    "A/B Testing",
    "Estimation",
    "Pricing",
  ]);
  assert.deepEqual(questionTypeStorageAliasesForRound("strategy"), [
    "Strategy",
    "Product Strategy",
  ]);
});
