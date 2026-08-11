import {
  FEEDBACK_RUBRIC_VERSION,
  FeedbackV2ParseError,
  parseGroundedFeedbackNarrative,
  type FeedbackV2Item,
} from "./feedback-v2";
import {
  prepareFeedbackTranscript,
  type FeedbackTranscriptTurn,
} from "./feedback-transcript";

export const FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION =
  "feedback.evidence-limited.v1" as const;
export const FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION =
  "feedback.prompt.evidence-limited.v1" as const;

export interface EvidenceLimitedFeedbackResult {
  schemaVersion: typeof FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION;
  promptVersion: typeof FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION;
  modelVersion: string;
  rubricVersion: typeof FEEDBACK_RUBRIC_VERSION;
  evaluationState: "partial";
  strengths: FeedbackV2Item[];
  improvements: FeedbackV2Item[];
  summary: string;
}

export type FeedbackEvaluationResult =
  | import("./feedback-v2").FeedbackV2Result
  | EvidenceLimitedFeedbackResult;

export function isEvidenceLimitedFeedbackResult(
  value: FeedbackEvaluationResult
): value is EvidenceLimitedFeedbackResult {
  return value.schemaVersion === FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION;
}

export function parseEvidenceLimitedFeedback(
  value: unknown,
  options: {
    transcript: FeedbackTranscriptTurn[];
    modelVersion: string;
  }
): EvidenceLimitedFeedbackResult {
  const root = requireRecord(value);
  requireExactKeys(root, [
    "schemaVersion",
    "promptVersion",
    "rubricVersion",
    "evaluationState",
    "strengths",
    "improvements",
    "summary",
  ]);
  requireExact(root.schemaVersion, FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION);
  requireExact(root.promptVersion, FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION);
  requireExact(root.rubricVersion, FEEDBACK_RUBRIC_VERSION);
  requireExact(root.evaluationState, "partial");

  const modelVersion = requireString(options.modelVersion, 256);
  const prepared = prepareFeedbackTranscript(options.transcript);
  if (!prepared.eligible) {
    throw new Error("evidence-limited transcript is not trustworthy");
  }
  const narrative = parseGroundedFeedbackNarrative({
    strengths: root.strengths,
    improvements: root.improvements,
    summary: root.summary,
    transcript: prepared.transcript,
    maximumFindings: 3,
  });
  const canonicalNarrative = canonicalizeNumericFreeNarrative(narrative);

  return {
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    modelVersion,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "partial",
    ...canonicalNarrative,
  };
}

const ENGLISH_NUMBER_VALUE_ATOMS = new Set([
  "zero",
  "nought",
  "naught",
  "nil",
  "oh",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
  "million",
  "billion",
  "trillion",
  "quadrillion",
  "zeroth",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
  "twentieth",
  "thirtieth",
  "fortieth",
  "fiftieth",
  "sixtieth",
  "seventieth",
  "eightieth",
  "ninetieth",
  "hundredth",
  "thousandth",
  "millionth",
  "billionth",
  "trillionth",
  "quadrillionth",
  "half",
  "halves",
  "quarter",
  "quarters",
  "single",
  "double",
  "triple",
  "quadruple",
  "once",
  "twice",
  "thrice",
  "pair",
  "pairs",
  "couple",
  "couples",
  "dozen",
  "dozens",
  "score",
  "scores",
]);
const UNICODE_FORMAT_OR_IGNORABLE =
  /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
const UNICODE_NUMBER = /\p{N}/u;
const ENGLISH_WORD_ATOM = /[\p{L}\p{M}]+/gu;
const EXPLICIT_GRADE_SYMBOL =
  /(?:^|[^\p{L}\p{N}])[A-F][+-](?=$|[^\p{L}\p{N}])|\b(?:an?|grade(?:d)?|rating|rated|mark(?:ed)?|award(?:ed)?|earn(?:ed|s)?|receive(?:d|s)?)\s+(?:of\s+)?(?:an?\s+)?[A-F](?=$|[^\p{L}\p{N}])|(?:^|[^\p{L}\p{N}])[A-F]\s+(?:grade|rating)\b/u;

function canonicalizeNumericFreeNarrative(
  narrative: Pick<
    EvidenceLimitedFeedbackResult,
    "strengths" | "improvements" | "summary"
  >
): Pick<
  EvidenceLimitedFeedbackResult,
  "strengths" | "improvements" | "summary"
> {
  return {
    strengths: narrative.strengths.map(canonicalizeFinding),
    improvements: narrative.improvements.map(canonicalizeFinding),
    summary: canonicalizeNumericFreeText(narrative.summary),
  };
}

function canonicalizeFinding(finding: FeedbackV2Item): FeedbackV2Item {
  return {
    ...finding,
    observation: canonicalizeNumericFreeText(finding.observation),
    nextStep: canonicalizeNumericFreeText(finding.nextStep),
  };
}

function canonicalizeNumericFreeText(value: string): string {
  const canonical = value
    .normalize("NFKC")
    .replace(UNICODE_FORMAT_OR_IGNORABLE, "");
  if (
    UNICODE_NUMBER.test(value) ||
    UNICODE_NUMBER.test(canonical) ||
    containsEnglishNumberValueAtom(canonical) ||
    EXPLICIT_GRADE_SYMBOL.test(canonical)
  ) {
    throw new FeedbackV2ParseError(
      "score_invalid",
      "evidence-limited narrative must be numeric-value-free"
    );
  }
  return canonical;
}

function containsEnglishNumberValueAtom(value: string): boolean {
  for (const match of value.matchAll(ENGLISH_WORD_ATOM)) {
    if (ENGLISH_NUMBER_VALUE_ATOMS.has(match[0].toLocaleLowerCase("en-US"))) {
      return true;
    }
  }
  return false;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("evidence-limited response is not an object");
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): void {
  const expected = new Set(keys);
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !expected.has(key))
  ) {
    throw new Error("evidence-limited response fields are invalid");
  }
}

function requireExact(value: unknown, expected: string): void {
  if (value !== expected) throw new Error("evidence-limited version mismatch");
}

function requireString(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum
  ) {
    throw new Error("evidence-limited text is invalid");
  }
  return value;
}
