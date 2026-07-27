import assert from "node:assert/strict";
import test from "node:test";

import type { DashboardQuestionInput } from "./contracts";
import { buildQuestionBankFacets } from "./question-bank-filters";

const questions: DashboardQuestionInput[] = [
  question("q1", "Figma", "product_sense", "Improve team discovery"),
  question("q2", "Stripe", "product_sense", "Improve payment activation"),
  question("q3", "Stripe", "execution", "Diagnose an activation decline"),
  question("q4", "Airbnb", "strategy", "Choose a market to enter"),
  question("q5", "Airbnb", "behavioral", "Change direction with evidence"),
];

test("question bank facets describe the complete corpus without filters", () => {
  const facets = buildQuestionBankFacets(questions, {
    searchQuery: "",
    roundLabel: "All rounds",
    company: null,
  });

  assert.equal(facets.results.length, 5);
  assert.equal(facets.allRoundsCount, 5);
  assert.deepEqual(facets.roundCounts, {
    "Product Sense": 2,
    Execution: 1,
    Strategy: 1,
    Behavioral: 1,
  });
  assert.equal(facets.allCompaniesCount, 5);
  assert.deepEqual(facets.companyCounts, {
    Figma: 1,
    Stripe: 2,
    Airbnb: 2,
  });
});

test("round selection updates company facets without erasing other round counts", () => {
  const facets = buildQuestionBankFacets(questions, {
    searchQuery: "",
    roundLabel: "Product Sense",
    company: null,
  });

  assert.equal(facets.results.length, 2);
  assert.equal(facets.allRoundsCount, 5);
  assert.deepEqual(facets.roundCounts, {
    "Product Sense": 2,
    Execution: 1,
    Strategy: 1,
    Behavioral: 1,
  });
  assert.equal(facets.allCompaniesCount, 2);
  assert.deepEqual(facets.companyCounts, {
    Figma: 1,
    Stripe: 1,
  });
});

test("company and search filters make round counts contextual", () => {
  const companyFacets = buildQuestionBankFacets(questions, {
    searchQuery: "",
    roundLabel: "All rounds",
    company: "Stripe",
  });
  const searchFacets = buildQuestionBankFacets(questions, {
    searchQuery: "activation",
    roundLabel: "All rounds",
    company: null,
  });

  assert.equal(companyFacets.results.length, 2);
  assert.equal(companyFacets.allRoundsCount, 2);
  assert.deepEqual(companyFacets.roundCounts, {
    "Product Sense": 1,
    Execution: 1,
  });
  assert.equal(searchFacets.results.length, 2);
  assert.equal(searchFacets.allCompaniesCount, 2);
  assert.deepEqual(searchFacets.companyCounts, { Stripe: 2 });
});

function question(
  id: string,
  company: string,
  questionType: string,
  questionText: string
): DashboardQuestionInput {
  return {
    id,
    company,
    questionType,
    questionText,
    isActive: true,
  };
}
