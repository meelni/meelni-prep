import assert from "node:assert/strict";
import test from "node:test";

import {
  QUESTION_RANKER_VERSION,
  QUESTION_RANKING_CONTRACT_VERSION,
  addQuestionSelectionToStartConfig,
  buildQuestionRankingFallback,
  createExplicitQuestionSelection,
  createRankedQuestionSelection,
} from "@meelni/core";

import { resolvePersistedStartQuestionAuthority } from "./interview-starts";

const persistedQuestion = {
  id: "11111111-1111-4111-8111-111111111111",
  company: "Persisted Company",
  text: "Persisted question bytes — do not replace",
  type: "Product Sense",
  roundType: "product_sense" as const,
  askedAt: "2026-08-01T00:00:00.000Z",
  isActive: true as const,
  createdAt: "2026-07-01T00:00:00.000Z",
};

test("explicit and ranked replays reconstruct exact question bytes from the accepted snapshot", () => {
  const explicit = createExplicitQuestionSelection(persistedQuestion);
  const ranked = createRankedQuestionSelection({
    candidate: {
      id: persistedQuestion.id,
      company: persistedQuestion.company,
      text: persistedQuestion.text,
      roundType: persistedQuestion.roundType,
      difficulty: "intermediate",
      sourceKind: "google_sheets",
      qualityStatus: "published",
      askedAt: persistedQuestion.askedAt,
      isActive: true,
    },
    questionType: persistedQuestion.type,
    receipt: {
      contractVersion: QUESTION_RANKING_CONTRACT_VERSION,
      rankerVersion: QUESTION_RANKER_VERSION,
      catalogVersion: "question-catalog:test-v1",
      questionId: persistedQuestion.id,
      reasonCode: "requested_round",
    },
  });

  for (const selection of [explicit, ranked]) {
    const authority = resolvePersistedStartQuestionAuthority(
      addQuestionSelectionToStartConfig({}, selection)
    );
    assert.deepEqual(authority, {
      relationQuestionId: persistedQuestion.id,
      question: {
        id: persistedQuestion.id,
        company: persistedQuestion.company,
        questionText: persistedQuestion.text,
        questionType: persistedQuestion.type,
        askedAt: new Date(persistedQuestion.askedAt),
        isActive: true,
        createdAt: selection.question.createdAt
          ? new Date(selection.question.createdAt)
          : null,
      },
    });
  }
});

test("a persisted fallback winner exclusively suppresses a concurrent catalog retry relation", () => {
  const fallback = buildQuestionRankingFallback({
    roundType: "product_sense",
    difficulty: "intermediate",
    company: null,
  });
  const selection = createRankedQuestionSelection({
    candidate: fallback,
    questionType: "Product Sense",
    receipt: {
      contractVersion: QUESTION_RANKING_CONTRACT_VERSION,
      rankerVersion: QUESTION_RANKER_VERSION,
      catalogVersion: "question-catalog:unavailable",
      questionId: fallback.id,
      reasonCode: "catalog_fallback",
    },
  });
  const incomingRetryQuestionId = "22222222-2222-4222-8222-222222222222";

  const authority = resolvePersistedStartQuestionAuthority(
    addQuestionSelectionToStartConfig({}, selection)
  );

  assert.equal(authority?.relationQuestionId, null);
  assert.notEqual(authority?.question.id, incomingRetryQuestionId);
  assert.equal(authority?.question.id, fallback.id);
  assert.equal(authority?.question.questionText, fallback.text);
});
