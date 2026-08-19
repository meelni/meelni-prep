import type {
  QuestionRankingCandidate,
  QuestionRankingHistoryEntry,
  QuestionRankingRequest,
  ValidatedQuestionRankingFeedbackSignal,
} from "@meelni/core";

export interface SyntheticQuestionRankingFixture {
  name: string;
  request: QuestionRankingRequest;
  candidates: readonly QuestionRankingCandidate[];
  history: readonly QuestionRankingHistoryEntry[];
  feedbackSignals: readonly ValidatedQuestionRankingFeedbackSignal[];
  expectedQuestionId: string;
}

const requested: QuestionRankingRequest = {
  roundType: "product_sense",
  difficulty: "intermediate",
  company: null,
};

function candidate(
  id: string,
  overrides: Partial<QuestionRankingCandidate> = {}
): QuestionRankingCandidate {
  return {
    id,
    text: `Synthetic question ${id}`,
    company: null,
    roundType: "product_sense",
    difficulty: "intermediate",
    sourceKind: "google_sheets",
    qualityStatus: "published",
    askedAt: "2026-07-01T00:00:00.000Z",
    isActive: true,
    ...overrides,
  };
}

/** Provider-free inputs only. No fixture represents or derives from customer data. */
export const SYNTHETIC_QUESTION_RANKING_MATRIX: readonly SyntheticQuestionRankingFixture[] =
  [
    {
      name: "new user uses stable ID tie break",
      request: requested,
      candidates: [candidate("question-b"), candidate("question-a")],
      history: [],
      feedbackSignals: [],
      expectedQuestionId: "question-a",
    },
    {
      name: "unseen beats immediate repeat",
      request: requested,
      candidates: [candidate("recent"), candidate("unseen")],
      history: [
        {
          questionId: "recent",
          roundType: "product_sense",
          practicedAt: "2026-08-17T20:00:00.000Z",
        },
      ],
      feedbackSignals: [],
      expectedQuestionId: "unseen",
    },
    {
      name: "requested round remains primary over weak-round evidence",
      request: requested,
      candidates: [
        candidate("requested"),
        candidate("weak-strategy", { roundType: "strategy" }),
      ],
      history: [],
      feedbackSignals: [
        {
          evidenceKind: "validated_scorecard",
          roundType: "strategy",
          overallScore: 4.5,
          observedAt: "2026-08-10T00:00:00.000Z",
        },
      ],
      expectedQuestionId: "requested",
    },
    {
      name: "requested company wins equivalent catalog candidates",
      request: { ...requested, company: "Acme" },
      candidates: [
        candidate("other", { company: "Other" }),
        candidate("acme", { company: "Acme" }),
      ],
      history: [],
      feedbackSignals: [],
      expectedQuestionId: "acme",
    },
    {
      name: "empty corpus uses stable embedded round fallback",
      request: { ...requested, roundType: "execution" },
      candidates: [],
      history: [],
      feedbackSignals: [],
      expectedQuestionId: "fallback:question:v1:execution",
    },
  ];
