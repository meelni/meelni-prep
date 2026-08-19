import {
  ALL_INTERVIEW_TYPES,
  type DifficultyLevel,
  type RoundType,
} from "./interview";

export const QUESTION_RANKING_CONTRACT_VERSION = "question-ranking.v1" as const;
export const QUESTION_RANKER_VERSION =
  "deterministic-question-ranker.v1" as const;

export const QUESTION_RANKING_LIMITS = {
  candidates: 64,
  history: 16,
  feedbackSignals: 8,
  companyLength: 160,
  questionTextLength: 2_000,
  versionLength: 128,
} as const;

/**
 * Additive weights are deliberately small, integer, and version-bound. Exact
 * practice recency and question ID remain deterministic tie breakers.
 */
export const QUESTION_RANKING_SCORE_TABLE = {
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
} as const;

export const QUESTION_SELECTION_REASON_CODES = [
  "requested_company",
  "recent_weak_round",
  "requested_round",
  "unseen_question",
  "least_recently_practiced",
  "corpus_quality",
  "catalog_fallback",
  "no_eligible_candidates",
] as const;

export type QuestionSelectionReasonCode =
  (typeof QUESTION_SELECTION_REASON_CODES)[number];

export type QuestionRankingSourceKind =
  | "google_sheets"
  | "legacy"
  | "embedded_fallback";
export type QuestionRankingQualityStatus =
  | "published"
  | "built_in_fallback"
  | "quarantined_unverified"
  | "quarantined_near_duplicate"
  | "retired_exact_duplicate"
  | "retired_source_missing";

export interface QuestionRankingCandidate {
  id: string;
  text: string;
  company: string | null;
  roundType: RoundType;
  difficulty: DifficultyLevel;
  sourceKind: QuestionRankingSourceKind;
  qualityStatus: QuestionRankingQualityStatus;
  askedAt: string | null;
  isActive: boolean;
}

export interface QuestionRankingHistoryEntry {
  questionId: string;
  roundType: RoundType;
  practicedAt: string;
}

/** The DB/workflow boundary emits this only after existing feedback validation. */
export interface ValidatedQuestionRankingFeedbackSignal {
  evidenceKind: "validated_scorecard";
  roundType: RoundType;
  overallScore: number;
  observedAt: string;
}

export interface QuestionRankingRequest {
  roundType: RoundType;
  difficulty: DifficultyLevel;
  company: string | null;
}

export interface RankQuestionsInputV1 {
  contractVersion: typeof QUESTION_RANKING_CONTRACT_VERSION;
  rankerVersion: typeof QUESTION_RANKER_VERSION;
  catalogVersion: string;
  referenceTime: string;
  request: QuestionRankingRequest;
  candidates: readonly QuestionRankingCandidate[];
  history: readonly QuestionRankingHistoryEntry[];
  feedbackSignals: readonly ValidatedQuestionRankingFeedbackSignal[];
}

export type QuestionRankingFactorCode =
  | keyof typeof QUESTION_RANKING_SCORE_TABLE
  | "practiceRecencyTieBreak"
  | "stableQuestionIdTieBreak";

export interface RankedQuestionCandidate {
  candidate: QuestionRankingCandidate;
  score: number;
  factorCodes: readonly QuestionRankingFactorCode[];
  lastPracticedAt: string | null;
}

export interface QuestionSelectionReceiptV1 {
  contractVersion: typeof QUESTION_RANKING_CONTRACT_VERSION;
  rankerVersion: typeof QUESTION_RANKER_VERSION;
  catalogVersion: string;
  questionId: string | null;
  reasonCode: QuestionSelectionReasonCode;
}

export interface QuestionRankingResultV1 {
  contractVersion: typeof QUESTION_RANKING_CONTRACT_VERSION;
  rankerVersion: typeof QUESTION_RANKER_VERSION;
  catalogVersion: string;
  ordered: readonly RankedQuestionCandidate[];
  selected: QuestionRankingCandidate | null;
  receipt: QuestionSelectionReceiptV1;
  bounds: {
    candidateCount: number;
    historyCount: number;
    feedbackSignalCount: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const RECENT_FEEDBACK_WINDOW_DAYS = 90;
const WEAK_ROUND_MAX_SCORE = 6.5;
const MASTERED_ROUND_MIN_SCORE = 8;

export function rankInterviewQuestions(
  input: RankQuestionsInputV1
): QuestionRankingResultV1 {
  const referenceTime = parseTimestamp(input.referenceTime) ?? 0;
  const catalogVersion = boundedVersion(input.catalogVersion);
  const history = normalizeHistory(input.history);
  const feedbackSignals = normalizeFeedbackSignals(
    input.feedbackSignals,
    referenceTime
  );
  const candidates = normalizeCandidates(input.candidates);
  const latestPracticeByQuestion = latestPracticeTimes(history);
  const latestFeedbackByRound = latestFeedbackSignals(feedbackSignals);

  const rankedCandidates = candidates
    .map((candidate) =>
      scoreCandidate({
        candidate,
        request: input.request,
        referenceTime,
        lastPracticedAt:
          latestPracticeByQuestion.get(candidate.id)?.practicedAt ?? null,
        feedbackSignal: latestFeedbackByRound.get(candidate.roundType) ?? null,
      })
    )
    .sort(compareRankedCandidates);
  const fallback = buildQuestionRankingFallback(input.request);
  const ordered =
    rankedCandidates.length > 0
      ? rankedCandidates
      : [
          {
            candidate: fallback,
            score: 0,
            factorCodes: ["stableQuestionIdTieBreak" as const],
            lastPracticedAt: null,
          },
        ];
  const selected = ordered[0]!.candidate;
  const reasonCode =
    candidates.length === 0
      ? "catalog_fallback"
      : selectReasonCode(ordered[0]!, input.request);

  return {
    contractVersion: QUESTION_RANKING_CONTRACT_VERSION,
    rankerVersion: QUESTION_RANKER_VERSION,
    catalogVersion,
    ordered,
    selected,
    receipt: {
      contractVersion: QUESTION_RANKING_CONTRACT_VERSION,
      rankerVersion: QUESTION_RANKER_VERSION,
      catalogVersion,
      questionId: selected.id,
      reasonCode,
    },
    bounds: {
      candidateCount: candidates.length,
      historyCount: history.length,
      feedbackSignalCount: feedbackSignals.length,
    },
  };
}

export function buildQuestionRankingFallback(
  request: QuestionRankingRequest
): QuestionRankingCandidate {
  const textByRound: Record<RoundType, string> = {
    product_sense: "How would you improve a product you use regularly?",
    execution:
      "Choose a product and define the metrics you would use to evaluate its success.",
    strategy:
      "How would you evaluate whether a product should enter a new market?",
    behavioral:
      "Tell me about a product decision where you aligned people with different priorities.",
  };
  return {
    id: `fallback:question:v1:${request.roundType}`,
    text: textByRound[request.roundType],
    company: null,
    roundType: request.roundType,
    difficulty: request.difficulty,
    sourceKind: "embedded_fallback",
    qualityStatus: "built_in_fallback",
    askedAt: null,
    isActive: true,
  };
}

function scoreCandidate(input: {
  candidate: QuestionRankingCandidate;
  request: QuestionRankingRequest;
  referenceTime: number;
  lastPracticedAt: string | null;
  feedbackSignal: ValidatedQuestionRankingFeedbackSignal | null;
}): RankedQuestionCandidate {
  const factorCodes: QuestionRankingFactorCode[] = [];
  let score = 0;
  const add = (factor: keyof typeof QUESTION_RANKING_SCORE_TABLE) => {
    score += QUESTION_RANKING_SCORE_TABLE[factor];
    factorCodes.push(factor);
  };

  if (input.candidate.roundType === input.request.roundType) {
    add("requestedRound");
  }
  if (input.candidate.difficulty === input.request.difficulty) {
    add("requestedDifficulty");
  }
  if (
    input.request.company &&
    input.candidate.company &&
    normalizeCompany(input.request.company) ===
      normalizeCompany(input.candidate.company)
  ) {
    add("requestedCompany");
  }

  const feedbackScore = input.feedbackSignal?.overallScore;
  if (feedbackScore !== undefined && feedbackScore <= WEAK_ROUND_MAX_SCORE) {
    add("recentWeakRound");
  } else if (
    feedbackScore !== undefined &&
    feedbackScore >= MASTERED_ROUND_MIN_SCORE
  ) {
    add("masteredRound");
  }

  const lastPracticedAt = parseTimestamp(input.lastPracticedAt);
  if (lastPracticedAt === null) {
    add("unseenQuestion");
  } else {
    const ageDays = Math.max(
      0,
      Math.floor((input.referenceTime - lastPracticedAt) / DAY_MS)
    );
    if (ageDays > 90) add("practicedMoreThan90DaysAgo");
    else if (ageDays >= 31) add("practiced31To90DaysAgo");
    else if (ageDays >= 8) add("practiced8To30DaysAgo");
    else if (ageDays >= 1) add("repeatedWithin7Days");
    else add("repeatedWithin24Hours");
  }

  add("publishedCorpus");
  if (input.candidate.sourceKind === "google_sheets") {
    add("googleSheetsProvenance");
  }
  if (parseTimestamp(input.candidate.askedAt) !== null) {
    add("datedSourceEvidence");
  }

  return {
    candidate: input.candidate,
    score,
    factorCodes,
    lastPracticedAt: input.lastPracticedAt,
  };
}

function compareRankedCandidates(
  left: RankedQuestionCandidate,
  right: RankedQuestionCandidate
): number {
  if (left.score !== right.score) return right.score - left.score;
  const leftPractice = parseTimestamp(left.lastPracticedAt);
  const rightPractice = parseTimestamp(right.lastPracticedAt);
  if (leftPractice === null && rightPractice !== null) return -1;
  if (leftPractice !== null && rightPractice === null) return 1;
  if (leftPractice !== rightPractice) {
    return (leftPractice ?? 0) - (rightPractice ?? 0);
  }
  return left.candidate.id.localeCompare(right.candidate.id, "en");
}

function selectReasonCode(
  selected: RankedQuestionCandidate,
  request: QuestionRankingRequest
): QuestionSelectionReasonCode {
  if (
    request.company &&
    selected.candidate.company &&
    normalizeCompany(request.company) ===
      normalizeCompany(selected.candidate.company)
  ) {
    return "requested_company";
  }
  if (selected.factorCodes.includes("recentWeakRound")) {
    return "recent_weak_round";
  }
  if (selected.candidate.roundType === request.roundType) {
    return "requested_round";
  }
  if (selected.factorCodes.includes("unseenQuestion")) {
    return "unseen_question";
  }
  if (selected.lastPracticedAt) return "least_recently_practiced";
  if (
    selected.factorCodes.includes("googleSheetsProvenance") ||
    selected.factorCodes.includes("datedSourceEvidence")
  ) {
    return "corpus_quality";
  }
  return "catalog_fallback";
}

function normalizeCandidates(
  values: readonly QuestionRankingCandidate[]
): QuestionRankingCandidate[] {
  const byId = new Map<string, QuestionRankingCandidate>();
  for (const value of [...values].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), "en")
  )) {
    if (
      byId.size >= QUESTION_RANKING_LIMITS.candidates ||
      !isEligibleCandidate(value) ||
      byId.has(value.id)
    ) {
      continue;
    }
    byId.set(value.id, {
      ...value,
      text: value.text.trim(),
      company: value.company?.trim() || null,
    });
  }
  return [...byId.values()];
}

function isEligibleCandidate(
  value: QuestionRankingCandidate
): value is QuestionRankingCandidate {
  return (
    value !== null &&
    typeof value === "object" &&
    isBoundedNonEmptyString(value.id, 256) &&
    isBoundedNonEmptyString(
      value.text,
      QUESTION_RANKING_LIMITS.questionTextLength
    ) &&
    (value.company === null ||
      isBoundedNonEmptyString(
        value.company,
        QUESTION_RANKING_LIMITS.companyLength
      )) &&
    isRoundType(value.roundType) &&
    ["beginner", "intermediate", "advanced"].includes(value.difficulty) &&
    ["google_sheets", "legacy"].includes(value.sourceKind) &&
    value.qualityStatus === "published" &&
    value.isActive === true &&
    (value.askedAt === null || parseTimestamp(value.askedAt) !== null)
  );
}

function normalizeHistory(
  values: readonly QuestionRankingHistoryEntry[]
): QuestionRankingHistoryEntry[] {
  return [...values]
    .filter(
      (value) =>
        isBoundedNonEmptyString(value?.questionId, 256) &&
        isRoundType(value?.roundType) &&
        parseTimestamp(value?.practicedAt) !== null
    )
    .sort((left, right) => {
      const byTime =
        parseTimestamp(right.practicedAt)! - parseTimestamp(left.practicedAt)!;
      return byTime || left.questionId.localeCompare(right.questionId, "en");
    })
    .slice(0, QUESTION_RANKING_LIMITS.history);
}

function normalizeFeedbackSignals(
  values: readonly ValidatedQuestionRankingFeedbackSignal[],
  referenceTime: number
): ValidatedQuestionRankingFeedbackSignal[] {
  return [...values]
    .filter((value) => {
      const observedAt = parseTimestamp(value?.observedAt);
      return (
        value?.evidenceKind === "validated_scorecard" &&
        isRoundType(value?.roundType) &&
        typeof value?.overallScore === "number" &&
        Number.isFinite(value.overallScore) &&
        value.overallScore >= 0 &&
        value.overallScore <= 10 &&
        observedAt !== null &&
        observedAt <= referenceTime &&
        referenceTime - observedAt <= RECENT_FEEDBACK_WINDOW_DAYS * DAY_MS
      );
    })
    .sort((left, right) => {
      const byTime =
        parseTimestamp(right.observedAt)! - parseTimestamp(left.observedAt)!;
      return byTime || left.roundType.localeCompare(right.roundType, "en");
    })
    .slice(0, QUESTION_RANKING_LIMITS.feedbackSignals);
}

function latestPracticeTimes(
  history: readonly QuestionRankingHistoryEntry[]
): ReadonlyMap<string, QuestionRankingHistoryEntry> {
  const result = new Map<string, QuestionRankingHistoryEntry>();
  for (const entry of history) {
    if (!result.has(entry.questionId)) result.set(entry.questionId, entry);
  }
  return result;
}

function latestFeedbackSignals(
  signals: readonly ValidatedQuestionRankingFeedbackSignal[]
): ReadonlyMap<RoundType, ValidatedQuestionRankingFeedbackSignal> {
  const result = new Map<RoundType, ValidatedQuestionRankingFeedbackSignal>();
  for (const signal of signals) {
    if (!result.has(signal.roundType)) result.set(signal.roundType, signal);
  }
  return result;
}

function normalizeCompany(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function boundedVersion(value: string): string {
  return isBoundedNonEmptyString(value, QUESTION_RANKING_LIMITS.versionLength)
    ? value
    : "catalog:unknown";
}

function isRoundType(value: unknown): value is RoundType {
  return (
    typeof value === "string" &&
    ALL_INTERVIEW_TYPES.includes(value as RoundType)
  );
}

function isBoundedNonEmptyString(value: unknown, maxLength: number): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
