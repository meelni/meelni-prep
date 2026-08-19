import assert from "node:assert/strict";
import test from "node:test";

import type { QuestionRankingCandidate } from "@meelni/core";

import {
  QUESTION_RANKING_DB_BOUNDS,
  createQuestionCandidatePreferenceBuckets,
  createQuestionCatalogVersion,
  getQuestionRankingContext,
  normalizeStoredQuestionAskedAt,
  normalizeStoredQuestionDifficulty,
  type QuestionRankingContextStore,
} from "./question-ranking";

const request = {
  roundType: "product_sense" as const,
  difficulty: "intermediate" as const,
  company: null,
};

test("ranking context performs three bounded logical reads and truncates oversized adapters", async () => {
  const calls: Array<{ operation: string; limit?: number }> = [];
  const candidates = Array.from(
    { length: QUESTION_RANKING_DB_BOUNDS.candidateRows + 20 },
    (_, index) => candidate(`question-${String(index).padStart(3, "0")}`)
  );
  const history = Array.from(
    { length: QUESTION_RANKING_DB_BOUNDS.historyRows + 20 },
    (_, index) => ({
      questionId: `question-${index}`,
      roundType: "product_sense" as const,
      practicedAt: new Date(
        Date.UTC(2026, 7, 18) - index * 86_400_000
      ).toISOString(),
    })
  );
  const store: QuestionRankingContextStore = {
    async loadCandidates(_request, limit) {
      calls.push({ operation: "candidates", limit });
      return candidates;
    },
    async loadHistory(_userId, limit) {
      calls.push({ operation: "history", limit });
      return history;
    },
    async loadLatestValidatedFeedbackSignal() {
      calls.push({ operation: "feedback" });
      return null;
    },
  };

  const context = await getQuestionRankingContext(
    { userId: "synthetic-user", request },
    store
  );

  assert.deepEqual(calls, [
    { operation: "candidates", limit: 64 },
    { operation: "history", limit: 16 },
    { operation: "feedback" },
  ]);
  assert.equal(context.candidates.length, 64);
  assert.equal(context.history.length, 16);
  assert.deepEqual(context.feedbackSignals, []);
  assert.equal(QUESTION_RANKING_DB_BOUNDS.maxDatabaseQueries, 11);
  assert.equal(QUESTION_RANKING_DB_BOUNDS.candidateBuckets, 32);
  assert.equal(QUESTION_RANKING_DB_BOUNDS.candidateWorkingRows, 2_048);
});

test("no-company candidate buckets preserve round then difficulty preference before recency and ID", () => {
  const buckets = createQuestionCandidatePreferenceBuckets(request);

  assert.equal(buckets.length, 32);
  assert.equal(
    buckets.filter(
      (bucket) =>
        bucket.questionType === "Product Sense" &&
        bucket.difficulty === "Medium"
    )[0]?.roundPriority,
    0
  );
  assert.equal(
    buckets.find(
      (bucket) =>
        bucket.questionType === "Product Sense" && bucket.difficulty === null
    )?.difficultyPriority,
    1
  );
  assert.deepEqual(
    new Set(
      buckets
        .filter((bucket) => bucket.questionType === "Behavioral")
        .map((bucket) => bucket.roundPriority)
    ),
    new Set([1])
  );
  assert.deepEqual(
    new Set(
      buckets
        .filter((bucket) => bucket.difficulty === "Medium")
        .map((bucket) => bucket.difficultyPriority)
    ),
    new Set([0])
  );
});

test("nullable stored difficulty remains neutral instead of becoming intermediate", () => {
  assert.equal(normalizeStoredQuestionDifficulty(null), null);
  assert.equal(normalizeStoredQuestionDifficulty("Medium"), "intermediate");
  assert.equal(normalizeStoredQuestionDifficulty("Easy"), "beginner");
  assert.equal(normalizeStoredQuestionDifficulty("Hard"), "advanced");
});

test("raw database timestamps normalize without assuming a Date instance", () => {
  assert.equal(
    normalizeStoredQuestionAskedAt("2026-08-18T12:00:00.000Z"),
    "2026-08-18T12:00:00.000Z"
  );
  assert.equal(
    normalizeStoredQuestionAskedAt(new Date("2026-08-18T12:00:00.000Z")),
    "2026-08-18T12:00:00.000Z"
  );
  assert.equal(normalizeStoredQuestionAskedAt("not-a-timestamp"), null);
  assert.equal(normalizeStoredQuestionAskedAt(null), null);
});

test("catalog versions are stable across adapter ordering and change with catalog content", () => {
  const left = candidate("question-a");
  const right = candidate("question-b");

  assert.equal(
    createQuestionCatalogVersion([left, right]),
    createQuestionCatalogVersion([right, left])
  );
  assert.notEqual(
    createQuestionCatalogVersion([left, right]),
    createQuestionCatalogVersion([
      left,
      { ...right, text: "Changed synthetic catalog text" },
    ])
  );
});

test("validated feedback is optional at the context boundary", async () => {
  const store: QuestionRankingContextStore = {
    async loadCandidates() {
      return [candidate("question-a")];
    },
    async loadHistory() {
      return [];
    },
    async loadLatestValidatedFeedbackSignal() {
      return {
        evidenceKind: "validated_scorecard",
        roundType: "execution",
        overallScore: 5,
        observedAt: "2026-08-17T00:00:00.000Z",
      };
    },
  };

  const context = await getQuestionRankingContext(
    { userId: "synthetic-user", request },
    store
  );

  assert.deepEqual(context.feedbackSignals, [
    {
      evidenceKind: "validated_scorecard",
      roundType: "execution",
      overallScore: 5,
      observedAt: "2026-08-17T00:00:00.000Z",
    },
  ]);
});

function candidate(id: string): QuestionRankingCandidate {
  return {
    id,
    text: `Synthetic question ${id}`,
    company: null,
    roundType: "product_sense",
    difficulty: "intermediate",
    sourceKind: "google_sheets",
    qualityStatus: "published",
    askedAt: "2026-08-01T00:00:00.000Z",
    isActive: true,
  };
}
