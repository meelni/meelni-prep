import assert from "node:assert/strict";
import test from "node:test";

import { SYNTHETIC_QUESTION_RANKING_MATRIX } from "../../test-fixtures/src/question-ranking";

import {
  QUESTION_RANKER_VERSION,
  QUESTION_RANKING_CONTRACT_VERSION,
  QUESTION_RANKING_LIMITS,
  QUESTION_RANKING_SCORE_TABLE,
  rankInterviewQuestions,
  type QuestionRankingCandidate,
  type RankQuestionsInputV1,
} from "./question-ranking";

const NOW = "2026-08-18T12:00:00.000Z";

test("synthetic fixture matrix remains deterministic", () => {
  for (const fixture of SYNTHETIC_QUESTION_RANKING_MATRIX) {
    const result = rankInterviewQuestions({
      contractVersion: QUESTION_RANKING_CONTRACT_VERSION,
      rankerVersion: QUESTION_RANKER_VERSION,
      catalogVersion: "question-catalog:synthetic-v1",
      referenceTime: NOW,
      request: fixture.request,
      candidates: fixture.candidates,
      history: fixture.history,
      feedbackSignals: fixture.feedbackSignals,
    });
    assert.equal(result.selected?.id, fixture.expectedQuestionId, fixture.name);
  }
});

test("scoring table stays explicit, additive, and version-bound", () => {
  assert.deepEqual(QUESTION_RANKING_SCORE_TABLE, {
    requestedRound: 36,
    requestedDifficulty: 12,
    requestedCompany: 18,
    recentWeakRound: 20,
    unseenQuestion: 24,
    practicedMoreThan90DaysAgo: 16,
    practiced31To90DaysAgo: 10,
    practiced8To30DaysAgo: 4,
    repeatedWithin7Days: -28,
    repeatedWithin24Hours: -48,
    masteredRound: -14,
    publishedCorpus: 8,
    googleSheetsProvenance: 4,
    datedSourceEvidence: 2,
  });
  assert.equal(QUESTION_RANKING_CONTRACT_VERSION, "question-ranking.v1");
  assert.equal(QUESTION_RANKER_VERSION, "deterministic-question-ranker.v1");
});

test("new and no-history users get the requested PM round deterministically", () => {
  const result = rankInterviewQuestions(
    rankingInput({
      candidates: [candidate("strategy", "strategy"), candidate("sense")],
    })
  );

  assert.equal(result.selected?.id, "sense");
  assert.equal(result.receipt.reasonCode, "requested_round");
  assert.equal(result.bounds.historyCount, 0);
  assert.equal(result.bounds.feedbackSignalCount, 0);
});

test("an unseen question outranks an otherwise identical recent repeat", () => {
  const result = rankInterviewQuestions(
    rankingInput({
      candidates: [candidate("recent"), candidate("unseen")],
      history: [
        {
          questionId: "recent",
          roundType: "product_sense",
          practicedAt: "2026-08-18T06:00:00.000Z",
        },
      ],
    })
  );

  assert.equal(result.selected?.id, "unseen");
  assert.ok(
    result.ordered[0]?.factorCodes.includes("unseenQuestion"),
    "the unseen factor is explainable"
  );
});

test("least-recently practiced is the deterministic score tie breaker", () => {
  const result = rankInterviewQuestions(
    rankingInput({
      candidates: [candidate("newer"), candidate("older")],
      history: [
        history("newer", "2026-07-01T00:00:00.000Z"),
        history("older", "2026-06-15T00:00:00.000Z"),
      ],
    })
  );

  assert.equal(result.ordered[0]?.score, result.ordered[1]?.score);
  assert.equal(result.selected?.id, "older");
});

test("recent validated weak-round evidence wins over another round", () => {
  const result = rankInterviewQuestions(
    rankingInput({
      request: {
        roundType: "behavioral",
        difficulty: "intermediate",
        company: null,
      },
      candidates: [
        candidate("behavior", "behavioral"),
        candidate("strategy", "strategy"),
      ],
      feedbackSignals: [
        {
          evidenceKind: "validated_scorecard",
          roundType: "strategy",
          overallScore: 5.5,
          observedAt: "2026-08-17T12:00:00.000Z",
        },
      ],
      history: [history("behavior", "2026-08-16T12:00:00.000Z", "behavioral")],
    })
  );

  assert.equal(result.selected?.id, "strategy");
  assert.equal(result.receipt.reasonCode, "recent_weak_round");
});

test("missing, invalid, future, and stale feedback signals are ignored", () => {
  const invalidSignals = [
    {
      evidenceKind: "unvalidated_row",
      roundType: "strategy",
      overallScore: 2,
      observedAt: "2026-08-17T12:00:00.000Z",
    },
    {
      evidenceKind: "validated_scorecard",
      roundType: "strategy",
      overallScore: -1,
      observedAt: "2026-08-17T12:00:00.000Z",
    },
    {
      evidenceKind: "validated_scorecard",
      roundType: "strategy",
      overallScore: 2,
      observedAt: "2026-08-19T12:00:00.000Z",
    },
    {
      evidenceKind: "validated_scorecard",
      roundType: "strategy",
      overallScore: 2,
      observedAt: "2026-01-01T12:00:00.000Z",
    },
  ] as never;
  const result = rankInterviewQuestions(
    rankingInput({
      candidates: [candidate("sense"), candidate("strategy", "strategy")],
      feedbackSignals: invalidSignals,
    })
  );

  assert.equal(result.selected?.id, "sense");
  assert.equal(result.bounds.feedbackSignalCount, 0);
});

test("requested difficulty and company are scored independently", () => {
  const difficulty = rankInterviewQuestions(
    rankingInput({
      request: {
        roundType: "product_sense",
        difficulty: "advanced",
        company: null,
      },
      candidates: [
        candidate("advanced", "product_sense", { difficulty: "advanced" }),
        candidate("medium"),
      ],
    })
  );
  const company = rankInterviewQuestions(
    rankingInput({
      request: {
        roundType: "product_sense",
        difficulty: "intermediate",
        company: "  Stripe ",
      },
      candidates: [
        candidate("other", "product_sense", { company: "Meta" }),
        candidate("stripe", "product_sense", { company: "stripe" }),
      ],
    })
  );

  assert.equal(difficulty.selected?.id, "advanced");
  assert.equal(company.selected?.id, "stripe");
  assert.equal(company.receipt.reasonCode, "requested_company");
});

test("published provenance and dated evidence improve corpus quality rank", () => {
  const result = rankInterviewQuestions(
    rankingInput({
      candidates: [
        candidate("legacy", "product_sense", {
          sourceKind: "legacy",
          askedAt: null,
        }),
        candidate("sourced", "product_sense", {
          sourceKind: "google_sheets",
          askedAt: "2026-07-01T00:00:00.000Z",
        }),
      ],
    })
  );

  assert.equal(result.selected?.id, "sourced");
  assert.ok(result.ordered[0]?.factorCodes.includes("googleSheetsProvenance"));
  assert.ok(result.ordered[0]?.factorCodes.includes("datedSourceEvidence"));
});

test("recent repeats and mastered rounds are penalized", () => {
  const result = rankInterviewQuestions(
    rankingInput({
      request: {
        roundType: "execution",
        difficulty: "intermediate",
        company: null,
      },
      candidates: [
        candidate("mastered", "execution"),
        candidate("fresh", "strategy"),
      ],
      history: [history("mastered", "2026-08-18T11:30:00.000Z", "execution")],
      feedbackSignals: [
        {
          evidenceKind: "validated_scorecard",
          roundType: "execution",
          overallScore: 9,
          observedAt: "2026-08-17T12:00:00.000Z",
        },
      ],
    })
  );

  assert.equal(result.selected?.id, "fresh");
  assert.ok(
    result.ordered
      .find(({ candidate }) => candidate.id === "mastered")
      ?.factorCodes.includes("masteredRound")
  );
});

test("stable question ID breaks exact ties independently of candidate order", () => {
  const forward = rankInterviewQuestions(
    rankingInput({ candidates: [candidate("b"), candidate("a")] })
  );
  const reverse = rankInterviewQuestions(
    rankingInput({ candidates: [candidate("a"), candidate("b")] })
  );

  assert.deepEqual(
    forward.ordered.map(({ candidate }) => candidate.id),
    ["a", "b"]
  );
  assert.deepEqual(reverse.ordered, forward.ordered);
  assert.deepEqual(reverse.receipt, forward.receipt);
});

test("inactive, quarantined, retired, malformed, and deleted candidates use the embedded fallback", () => {
  const result = rankInterviewQuestions(
    rankingInput({
      candidates: [
        candidate("inactive", "product_sense", { isActive: false }),
        candidate("quarantined", "product_sense", {
          qualityStatus: "quarantined_unverified",
        }),
        candidate("retired", "product_sense", {
          qualityStatus: "retired_source_missing",
        }),
        candidate("malformed", "product_sense", { text: "" }),
      ],
    })
  );

  assert.deepEqual(result.selected, {
    id: "fallback:question:v1:product_sense",
    text: "How would you improve a product you use regularly?",
    company: null,
    roundType: "product_sense",
    difficulty: "intermediate",
    sourceKind: "embedded_fallback",
    qualityStatus: "built_in_fallback",
    askedAt: null,
    isActive: true,
  });
  assert.equal(result.receipt.questionId, result.selected.id);
  assert.equal(result.receipt.reasonCode, "catalog_fallback");
  assert.equal(result.bounds.candidateCount, 0);
});

test("candidate, history, and feedback processing remain explicitly bounded", () => {
  const result = rankInterviewQuestions(
    rankingInput({
      candidates: Array.from(
        { length: QUESTION_RANKING_LIMITS.candidates + 20 },
        (_, index) => candidate(`q-${String(index).padStart(3, "0")}`)
      ),
      history: Array.from(
        { length: QUESTION_RANKING_LIMITS.history + 20 },
        (_, index) =>
          history(
            `q-${String(index).padStart(3, "0")}`,
            `2026-08-${String(17 - (index % 10)).padStart(2, "0")}T12:00:00.000Z`
          )
      ),
      feedbackSignals: Array.from(
        { length: QUESTION_RANKING_LIMITS.feedbackSignals + 20 },
        (_, index) => ({
          evidenceKind: "validated_scorecard" as const,
          roundType: "product_sense" as const,
          overallScore: 6,
          observedAt: `2026-08-${String(17 - (index % 10)).padStart(2, "0")}T12:00:00.000Z`,
        })
      ),
    })
  );

  assert.deepEqual(result.bounds, {
    candidateCount: QUESTION_RANKING_LIMITS.candidates,
    historyCount: QUESTION_RANKING_LIMITS.history,
    feedbackSignalCount: QUESTION_RANKING_LIMITS.feedbackSignals,
  });
  assert.equal(result.ordered.length, QUESTION_RANKING_LIMITS.candidates);
});

function rankingInput(
  overrides: Partial<RankQuestionsInputV1> = {}
): RankQuestionsInputV1 {
  return {
    contractVersion: QUESTION_RANKING_CONTRACT_VERSION,
    rankerVersion: QUESTION_RANKER_VERSION,
    catalogVersion: "question-catalog:test-v1",
    referenceTime: NOW,
    request: {
      roundType: "product_sense",
      difficulty: "intermediate",
      company: null,
    },
    candidates: [],
    history: [],
    feedbackSignals: [],
    ...overrides,
  };
}

function candidate(
  id: string,
  roundType: QuestionRankingCandidate["roundType"] = "product_sense",
  overrides: Partial<QuestionRankingCandidate> = {}
): QuestionRankingCandidate {
  return {
    id,
    text: `Synthetic ${id} question`,
    company: null,
    roundType,
    difficulty: "intermediate",
    sourceKind: "legacy",
    qualityStatus: "published",
    askedAt: null,
    isActive: true,
    ...overrides,
  };
}

function history(
  questionId: string,
  practicedAt: string,
  roundType: QuestionRankingCandidate["roundType"] = "product_sense"
) {
  return { questionId, roundType, practicedAt };
}
