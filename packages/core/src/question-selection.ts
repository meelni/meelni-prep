import type { RoundType } from "./interview";
import type {
  QuestionRankingCandidate,
  QuestionSelectionReceiptV1,
} from "./question-ranking";

export const QUESTION_SELECTION_CONTRACT_VERSION =
  "question-selection.v1" as const;
export const QUESTION_SELECTION_CONFIG_KEY = "questionSelectionV1" as const;
export const EXPLICIT_QUESTION_OVERRIDE_VERSION =
  "explicit-question-override.v1" as const;
export const QUESTION_SELECTION_NOT_APPLICABLE_VERSION =
  "not-applicable" as const;

export type PersistedQuestionSelectionMode =
  | "explicit_override"
  | "ranked"
  | "catalog_fallback";

export type PersistedQuestionSelectionReasonCode =
  | "explicit_override"
  | QuestionSelectionReceiptV1["reasonCode"];

export interface PersistedSelectedQuestionV1 {
  id: string;
  company: string | null;
  text: string;
  type: string;
  roundType: RoundType;
  askedAt: string | null;
  isActive: true;
  createdAt: string | null;
}

/**
 * Server-owned replay metadata. It intentionally excludes scores, factor
 * weights, user history, and feedback evidence.
 */
export interface PersistedQuestionSelectionV1 {
  contractVersion: typeof QUESTION_SELECTION_CONTRACT_VERSION;
  mode: PersistedQuestionSelectionMode;
  reasonCode: PersistedQuestionSelectionReasonCode;
  rankerVersion: string;
  catalogVersion: string;
  questionId: string;
  question: PersistedSelectedQuestionV1;
}

export interface SelectedQuestionSnapshotInput {
  id: string;
  company: string | null;
  text: string;
  type: string;
  roundType: RoundType;
  askedAt: string | null;
  isActive: true;
  createdAt: string | null;
}

export function createExplicitQuestionSelection(
  question: SelectedQuestionSnapshotInput
): PersistedQuestionSelectionV1 {
  return {
    contractVersion: QUESTION_SELECTION_CONTRACT_VERSION,
    mode: "explicit_override",
    reasonCode: "explicit_override",
    rankerVersion: EXPLICIT_QUESTION_OVERRIDE_VERSION,
    catalogVersion: QUESTION_SELECTION_NOT_APPLICABLE_VERSION,
    questionId: question.id,
    question: { ...question },
  };
}

export function createRankedQuestionSelection(input: {
  candidate: QuestionRankingCandidate;
  questionType: string;
  receipt: QuestionSelectionReceiptV1;
}): PersistedQuestionSelectionV1 {
  const mode =
    input.candidate.sourceKind === "embedded_fallback"
      ? "catalog_fallback"
      : "ranked";
  return {
    contractVersion: QUESTION_SELECTION_CONTRACT_VERSION,
    mode,
    reasonCode: input.receipt.reasonCode,
    rankerVersion: input.receipt.rankerVersion,
    catalogVersion: input.receipt.catalogVersion,
    questionId: input.candidate.id,
    question: {
      id: input.candidate.id,
      company: input.candidate.company,
      text: input.candidate.text,
      type: input.questionType,
      roundType: input.candidate.roundType,
      askedAt: input.candidate.askedAt,
      isActive: true,
      createdAt: null,
    },
  };
}

export function addQuestionSelectionToStartConfig(
  config: Record<string, unknown>,
  selection: PersistedQuestionSelectionV1
): Record<string, unknown> {
  return {
    ...config,
    [QUESTION_SELECTION_CONFIG_KEY]: selection,
  };
}

export function readQuestionSelectionFromStartConfig(
  config: unknown
): PersistedQuestionSelectionV1 | null {
  if (!isRecord(config)) return null;
  const value = config[QUESTION_SELECTION_CONFIG_KEY];
  if (!isRecord(value) || !isRecord(value.question)) return null;
  const question = value.question;
  if (
    value.contractVersion !== QUESTION_SELECTION_CONTRACT_VERSION ||
    !isSelectionMode(value.mode) ||
    !isReasonCode(value.reasonCode) ||
    !isBoundedNonEmptyString(value.rankerVersion, 128) ||
    !isBoundedNonEmptyString(value.catalogVersion, 128) ||
    !isBoundedNonEmptyString(value.questionId, 256) ||
    value.questionId !== question.id ||
    !isBoundedNonEmptyString(question.id, 256) ||
    !isBoundedNonEmptyString(question.text, 2_000) ||
    !isBoundedNonEmptyString(question.type, 160) ||
    (question.company !== null &&
      (typeof question.company !== "string" ||
        question.company.length > 160)) ||
    !isRoundType(question.roundType) ||
    (question.askedAt !== null && !isTimestamp(question.askedAt)) ||
    question.isActive !== true ||
    (question.createdAt !== null && !isTimestamp(question.createdAt))
  ) {
    return null;
  }

  return value as unknown as PersistedQuestionSelectionV1;
}

export function isEmbeddedQuestionSelection(
  value: PersistedQuestionSelectionV1
): boolean {
  return (
    value.mode === "catalog_fallback" &&
    value.question.id === `fallback:question:v1:${value.question.roundType}`
  );
}

function isSelectionMode(
  value: unknown
): value is PersistedQuestionSelectionMode {
  return ["explicit_override", "ranked", "catalog_fallback"].includes(
    value as PersistedQuestionSelectionMode
  );
}

function isReasonCode(
  value: unknown
): value is PersistedQuestionSelectionReasonCode {
  return [
    "explicit_override",
    "requested_company",
    "recent_weak_round",
    "requested_round",
    "unseen_question",
    "least_recently_practiced",
    "corpus_quality",
    "catalog_fallback",
    "no_eligible_candidates",
  ].includes(value as PersistedQuestionSelectionReasonCode);
}

function isRoundType(value: unknown): value is RoundType {
  return ["behavioral", "product_sense", "execution", "strategy"].includes(
    value as RoundType
  );
}

function isBoundedNonEmptyString(value: unknown, maxLength: number): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
