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
  requireNoNumericalRating(narrative);

  return {
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    modelVersion,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "partial",
    ...narrative,
  };
}

type CustomerCopyTokenKind = "word" | "number" | "punctuation" | "newline";

interface CustomerCopyToken {
  kind: CustomerCopyTokenKind;
  value: string;
  start: number;
  end: number;
}

interface NumericalSpan {
  startIndex: number;
  endIndex: number;
  value: number;
}

const NUMBER_WORD_VALUES = new Map<string, number>([
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
]);
const RATING_SCALE_WORDS = new Set(["five", "ten", "hundred"]);
const RATING_LABELS = new Set([
  "assessment",
  "evaluation",
  "grade",
  "mark",
  "overall",
  "rating",
  "review",
  "score",
]);
const RATING_UNITS = new Set(["point", "points", "star", "stars"]);
const EVALUATED_SUBJECTS = new Set([
  "answer",
  "assessment",
  "attempt",
  "candidate",
  "it",
  "performance",
  "response",
  "this",
]);
const EVALUATION_ACTIONS = new Set([
  "assess",
  "assessed",
  "award",
  "awarded",
  "call",
  "called",
  "consider",
  "considered",
  "evaluate",
  "evaluated",
  "give",
  "gave",
  "grade",
  "graded",
  "judge",
  "judged",
  "mark",
  "marked",
  "place",
  "placed",
  "put",
  "rank",
  "ranked",
  "rate",
  "rated",
  "score",
  "scored",
]);
const EVALUATION_RESULT_VERBS = new Set([
  "came",
  "comes",
  "earn",
  "earned",
  "earns",
  "is",
  "landed",
  "lands",
  "merit",
  "merited",
  "merits",
  "rate",
  "rated",
  "rates",
  "receive",
  "received",
  "receives",
  "sat",
  "scored",
  "scores",
  "sits",
  "stood",
  "was",
]);
const PREFIX_BRIDGE_PUNCTUATION = new Set(["-", ":", "–", "—"]);
const LOCAL_CLAUSE_BOUNDARIES = new Set([
  ",",
  ".",
  ":",
  ";",
  "!",
  "?",
  "–",
  "—",
]);
const COORDINATING_CLAUSE_WORDS = new Set(["and", "but", "or", "then"]);
const NOUN_PHRASE_BOUNDARY_WORDS = new Set([
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "out",
  "than",
  "to",
  "toward",
  "towards",
  "with",
]);
const ARTICLE_WORDS = new Set(["a", "an", "the"]);
const COMPOUND_HYPHENS = new Set(["-", "‐", "‑"]);
const CURRENCY_MARKS = new Set(["$", "£", "€", "¥"]);

function containsNumericalRating(value: string): boolean {
  const tokens = tokenizeCustomerCopy(value);
  return getNumericalSpans(tokens).some((span) =>
    isNumericalRatingSpan(tokens, span)
  );
}

function tokenizeCustomerCopy(value: string): CustomerCopyToken[] {
  const tokens: CustomerCopyToken[] = [];
  for (const match of value.matchAll(
    /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*|\d+(?:\.\d+)?|\r\n|\r|\n|[^\s]/gu
  )) {
    const raw = match[0];
    const normalized = raw.normalize("NFKC").toLocaleLowerCase("en-US");
    const start = match.index;
    let kind: CustomerCopyTokenKind;
    if (/^(?:\r\n|\r|\n)$/u.test(raw)) {
      kind = "newline";
    } else if (/^\d/u.test(raw)) {
      kind = "number";
    } else if (/^[\p{L}\p{M}]/u.test(raw)) {
      kind = "word";
    } else {
      kind = "punctuation";
    }
    tokens.push({ kind, value: normalized, start, end: start + raw.length });
  }
  return tokens;
}

function getNumericalSpans(tokens: CustomerCopyToken[]): NumericalSpan[] {
  const spans: NumericalSpan[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const value = getTokenNumber(tokens[index]!);
    if (value === null) continue;

    let endIndex = index;
    let resolvedValue = value;
    const pointToken = tokens[index + 1];
    const fractionToken = tokens[index + 2];
    const fractionValue = fractionToken ? getTokenNumber(fractionToken) : null;
    if (
      pointToken?.kind === "word" &&
      pointToken.value === "point" &&
      fractionValue !== null &&
      fractionValue >= 0 &&
      fractionValue <= 9
    ) {
      resolvedValue = Number(`${value}.${fractionValue}`);
      endIndex = index + 2;
    }

    spans.push({ startIndex: index, endIndex, value: resolvedValue });
    index = endIndex;
  }
  return spans;
}

function getTokenNumber(token: CustomerCopyToken): number | null {
  if (token.kind === "number") {
    const value = Number(token.value);
    return Number.isFinite(value) ? value : null;
  }
  return token.kind === "word"
    ? (NUMBER_WORD_VALUES.get(token.value) ?? null)
    : null;
}

function isNumericalRatingSpan(
  tokens: CustomerCopyToken[],
  span: NumericalSpan
): boolean {
  if (hasExplicitRatingScale(tokens, span)) return true;

  const hasEvaluationFrame = hasLocalEvaluationFrame(tokens, span.startIndex);
  if (
    hasLocalRatingBinding(tokens, span, hasEvaluationFrame) ||
    hasAdjacentAnaphoricRatingBinding(tokens, span)
  ) {
    return true;
  }

  if (span.value < 0 || span.value > 10 || !hasEvaluationFrame) return false;
  return !isStructuralQuantity(tokens, span);
}

function hasExplicitRatingScale(
  tokens: CustomerCopyToken[],
  span: NumericalSpan
): boolean {
  const first = tokens[span.endIndex + 1];
  const second = tokens[span.endIndex + 2];
  const third = tokens[span.endIndex + 3];
  if (first?.value === "/" && second && isRatingScaleToken(second)) {
    return true;
  }
  return (
    first?.kind === "word" &&
    first.value === "out" &&
    second?.kind === "word" &&
    second.value === "of" &&
    third !== undefined &&
    isRatingScaleToken(third)
  );
}

function isRatingScaleToken(token: CustomerCopyToken): boolean {
  if (token.kind === "number") {
    return token.value === "5" || token.value === "10" || token.value === "100";
  }
  return token.kind === "word" && RATING_SCALE_WORDS.has(token.value);
}

function hasLocalEvaluationFrame(
  tokens: CustomerCopyToken[],
  numberIndex: number
): boolean {
  const prefixWords = getLocalPrefixWords(tokens, numberIndex);
  while (
    prefixWords.length > 0 &&
    ["a", "an", "the"].includes(prefixWords[prefixWords.length - 1]!)
  ) {
    prefixWords.pop();
  }
  if (prefixWords.length === 0) return hasSeparatedOverall(tokens, numberIndex);

  const labelProjection = [...prefixWords];
  while (
    labelProjection.length > 0 &&
    ["a", "an", "as", "at", "is", "of", "the", "was"].includes(
      labelProjection[labelProjection.length - 1]!
    )
  ) {
    labelProjection.pop();
  }
  if (RATING_LABELS.has(labelProjection[labelProjection.length - 1] ?? "")) {
    return true;
  }

  if (
    endsWithWords(prefixWords, ["aim", "for"]) ||
    endsWithWords(prefixWords, ["shoot", "for"]) ||
    endsWithWords(prefixWords, ["strive", "for"]) ||
    endsWithWords(prefixWords, ["work", "toward"]) ||
    endsWithWords(prefixWords, ["work", "towards"]) ||
    endsWithWords(prefixWords, ["aim", "to", "reach"]) ||
    endsWithWords(prefixWords, ["aim", "to", "get"]) ||
    endsWithWords(prefixWords, ["aim", "to", "become"]) ||
    prefixWords[prefixWords.length - 1] === "target" ||
    prefixWords[prefixWords.length - 1] === "reach"
  ) {
    return true;
  }

  const recentWords = prefixWords.slice(-10);
  const subjectIndex = recentWords.findLastIndex((word) =>
    EVALUATED_SUBJECTS.has(word)
  );
  if (
    subjectIndex >= 0 &&
    recentWords
      .slice(subjectIndex + 1)
      .some((word) => EVALUATION_RESULT_VERBS.has(word))
  ) {
    return true;
  }

  const actionIndex = recentWords.findLastIndex((word) =>
    EVALUATION_ACTIONS.has(word)
  );
  return actionIndex >= 0 && (subjectIndex > actionIndex || actionIndex === 0);
}

function getLocalPrefixWords(
  tokens: CustomerCopyToken[],
  numberIndex: number
): string[] {
  const words: string[] = [];
  for (
    let index = numberIndex - 1;
    index >= 0 && words.length < 12;
    index -= 1
  ) {
    const token = tokens[index]!;
    if (
      token.kind === "newline" ||
      (token.kind === "punctuation" &&
        PREFIX_BRIDGE_PUNCTUATION.has(token.value))
    ) {
      continue;
    }
    if (token.kind === "punctuation") break;
    if (token.kind === "word") words.unshift(token.value);
  }
  return words;
}

function hasSeparatedOverall(
  tokens: CustomerCopyToken[],
  numberIndex: number
): boolean {
  let index = numberIndex - 1;
  if (["a", "an"].includes(tokens[index]?.value ?? "")) index -= 1;
  let crossedSeparator = false;
  while (index >= 0) {
    const token = tokens[index]!;
    if (
      token.kind === "newline" ||
      (token.kind === "punctuation" &&
        (PREFIX_BRIDGE_PUNCTUATION.has(token.value) ||
          token.value === "," ||
          token.value === "?"))
    ) {
      crossedSeparator = true;
      index -= 1;
      continue;
    }
    return (
      crossedSeparator && token.kind === "word" && token.value === "overall"
    );
  }
  return false;
}

function endsWithWords(value: string[], suffix: string[]): boolean {
  return (
    value.length >= suffix.length &&
    suffix.every(
      (word, index) => value[value.length - suffix.length + index] === word
    )
  );
}

function hasLocalRatingBinding(
  tokens: CustomerCopyToken[],
  span: NumericalSpan,
  hasEvaluationFrame: boolean
): boolean {
  const phrase = getLocalComplement(tokens, span.endIndex + 1);
  const words = phrase.filter((token) => token.kind === "word");
  const asIndex = words.findIndex((token) => token.value === "as");
  if (
    asIndex >= 0 &&
    words
      .slice(asIndex + 1, asIndex + 4)
      .some((token) => RATING_LABELS.has(token.value))
  ) {
    return true;
  }

  const nounPhraseWords = getNounPhraseWords(words);
  const nounPhraseHead = nounPhraseWords[nounPhraseWords.length - 1];
  if (nounPhraseHead && RATING_LABELS.has(nounPhraseHead.value)) return true;

  if (
    !hasEvaluationFrame ||
    !nounPhraseHead ||
    !RATING_UNITS.has(nounPhraseHead.value)
  ) {
    return false;
  }

  const firstToken = phrase[0];
  const hyphenatedModifier =
    firstToken?.kind === "punctuation" &&
    COMPOUND_HYPHENS.has(firstToken.value) &&
    words[0] !== undefined;
  return !hyphenatedModifier || nounPhraseWords.length === 1;
}

function getNounPhraseWords(words: CustomerCopyToken[]): CustomerCopyToken[] {
  const nounPhrase: CustomerCopyToken[] = [];
  for (const token of words) {
    if (NOUN_PHRASE_BOUNDARY_WORDS.has(token.value)) break;
    if (!ARTICLE_WORDS.has(token.value)) nounPhrase.push(token);
  }
  return nounPhrase;
}

function getLocalComplement(
  tokens: CustomerCopyToken[],
  startIndex: number
): CustomerCopyToken[] {
  const result: CustomerCopyToken[] = [];
  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (
      token.kind === "newline" ||
      (token.kind === "punctuation" &&
        LOCAL_CLAUSE_BOUNDARIES.has(token.value)) ||
      (token.kind === "word" && COORDINATING_CLAUSE_WORDS.has(token.value))
    ) {
      break;
    }
    result.push(token);
  }
  return result;
}

function hasAdjacentAnaphoricRatingBinding(
  tokens: CustomerCopyToken[],
  span: NumericalSpan
): boolean {
  let boundaryIndex = -1;
  for (let index = span.endIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (
      token.kind === "newline" ||
      (token.kind === "punctuation" && LOCAL_CLAUSE_BOUNDARIES.has(token.value))
    ) {
      boundaryIndex = index;
      break;
    }
  }
  if (boundaryIndex < 0) return false;

  const words: string[] = [];
  for (let index = boundaryIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (
      token.kind === "newline" ||
      (token.kind === "punctuation" && LOCAL_CLAUSE_BOUNDARIES.has(token.value))
    ) {
      if (words.length === 0) continue;
      break;
    }
    if (token.kind === "word") words.push(token.value);
  }

  const asIndex = words.indexOf("as");
  if (asIndex <= 0) return false;
  const referenceWords = words.slice(0, asIndex);
  const hasAnaphoricReference =
    referenceWords.some((word) => ["it", "them", "those"].includes(word)) ||
    referenceWords.some(
      (word, index) =>
        ["that", "this"].includes(word) &&
        referenceWords[index + 1] !== undefined
    );
  if (!hasAnaphoricReference) return false;

  return words
    .slice(asIndex + 1, asIndex + 4)
    .some((word) => RATING_LABELS.has(word));
}

function isStructuralQuantity(
  tokens: CustomerCopyToken[],
  span: NumericalSpan
): boolean {
  const previous = tokens[span.startIndex - 1];
  if (previous?.kind === "punctuation" && CURRENCY_MARKS.has(previous.value)) {
    return true;
  }

  const first = tokens[span.endIndex + 1];
  if (first?.value === "%") return true;

  if (
    first?.kind === "punctuation" &&
    COMPOUND_HYPHENS.has(first.value) &&
    first.start === tokens[span.endIndex]!.end
  ) {
    const compoundHead = tokens[span.endIndex + 2];
    return (
      compoundHead?.kind === "word" &&
      compoundHead.start === first.end &&
      compoundHead.value !== "ish"
    );
  }

  if (first?.kind !== "word") return false;
  const second = tokens[span.endIndex + 2];
  if (
    first.value === "next" &&
    second?.kind === "word" &&
    second.value === "time"
  ) {
    return false;
  }
  return (
    getNounPhraseWords(
      getLocalComplement(tokens, span.endIndex + 1).filter(
        (token) => token.kind === "word"
      )
    ).length > 0
  );
}

function requireNoNumericalRating(
  narrative: Pick<
    EvidenceLimitedFeedbackResult,
    "strengths" | "improvements" | "summary"
  >
): void {
  const customerCopy = [
    narrative.summary,
    ...narrative.strengths.flatMap((finding) => [
      finding.observation,
      finding.nextStep,
    ]),
    ...narrative.improvements.flatMap((finding) => [
      finding.observation,
      finding.nextStep,
    ]),
  ];
  if (customerCopy.some((value) => containsNumericalRating(value))) {
    throw new FeedbackV2ParseError(
      "score_invalid",
      "evidence-limited feedback must withhold numerical ratings"
    );
  }
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
