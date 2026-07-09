import type { RoundType } from "./interview";

export const QUESTION_ROUND_TYPES = [
  "product_sense",
  "behavioral",
  "execution",
  "strategy",
] as const satisfies readonly RoundType[];

export const QUESTION_ROUND_LABELS = {
  product_sense: "Product Sense",
  behavioral: "Behavioral",
  execution: "Execution",
  strategy: "Strategy",
} as const satisfies Record<RoundType, string>;

export type CanonicalQuestionType = (typeof QUESTION_ROUND_LABELS)[RoundType];

const STORED_QUESTION_TYPE_ALIASES = {
  product_sense: ["Product Sense", "Product design/strategy"],
  behavioral: ["Behavioral"],
  execution: ["Execution", "A/B Testing", "Estimation", "Pricing"],
  strategy: ["Strategy", "Product Strategy"],
} as const satisfies Record<RoundType, readonly string[]>;

const QUESTION_TYPE_ALIAS_TO_ROUND: Readonly<Record<string, RoundType>> = {
  product_sense: "product_sense",
  product: "product_sense",
  product_design: "product_sense",
  product_design_strategy: "product_sense",
  design: "product_sense",
  behavioral: "behavioral",
  behavioural: "behavioral",
  behavior: "behavioral",
  behaviour: "behavioral",
  execution: "execution",
  product_execution: "execution",
  analytics: "execution",
  analytical: "execution",
  metrics: "execution",
  a_b_testing: "execution",
  ab_testing: "execution",
  estimation: "execution",
  pricing: "execution",
  strategy: "strategy",
  product_strategy: "strategy",
};

function normalizeAliasKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Normalize public API aliases and persisted legacy labels to one PM round. */
export function normalizeQuestionRound(value: string): RoundType | null {
  return QUESTION_TYPE_ALIAS_TO_ROUND[normalizeAliasKey(value)] ?? null;
}

/** Return the only display/storage label that new question data should use. */
export function canonicalQuestionTypeLabel(
  value: string
): CanonicalQuestionType | null {
  const roundType = normalizeQuestionRound(value);
  return roundType ? QUESTION_ROUND_LABELS[roundType] : null;
}

/**
 * Include legacy labels while old deployments and databases roll forward.
 * New writes must use QUESTION_ROUND_LABELS instead.
 */
export function questionTypeStorageAliasesForRound(
  roundType: RoundType
): readonly string[] {
  return STORED_QUESTION_TYPE_ALIASES[roundType];
}
