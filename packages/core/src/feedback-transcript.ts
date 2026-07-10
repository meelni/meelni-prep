export interface FeedbackTranscriptTurn {
  eventId: string;
  speaker: "user" | "interviewer";
  text: string;
}

export interface FeedbackTranscriptTurnInput {
  eventId: string | null;
  speaker: string;
  text: string | null;
  contractVersion?: number | null;
}

export type FeedbackTranscriptIssueCode =
  | "malformed_event"
  | "missing_user_speech"
  | "prompt_injection"
  | "repeated_turn";

export interface FeedbackTranscriptIssue {
  code: FeedbackTranscriptIssueCode;
  eventId: string | null;
  fatal: boolean;
}

export interface PreparedFeedbackTranscript {
  transcript: FeedbackTranscriptTurn[];
  issues: FeedbackTranscriptIssue[];
  eligible: boolean;
  reasons: string[];
  duplicateTurnsRemoved: number;
}

export interface PrepareFeedbackTranscriptOptions {
  requireContractV2?: boolean;
}

const INJECTION_PATTERNS = [
  /(?:^|[.!?]\s+)(?:please\s+)?(?:ignore|disregard|override|forget)\b[\s\S]{0,100}\b(?:scor(?:e|es|ing)|evidence|rubric|evaluation)\b/i,
  /(?:^|[.!?]\s+)(?:please\s+)?(?:ignore|disregard|override|forget)\b[\s\S]{0,100}\b(?:previous|prior|system|developer|instructions?|prompt)\b(?=[\s\S]{0,120}\b(?:award|developer|output|print|rate|return|reveal|score|system)\b)/i,
  /(?:^|[.!?]\s+)(?:please\s+)?(?:reveal|print|repeat|return|output)\b[\s\S]{0,80}\b(?:system|developer)\s+(?:message|prompt|instructions?)\b/i,
  /(?:^|[.!?]\s+)(?:please\s+)?(?:award|give|set|assign)\s+(?:me|my|every|all|each|the)\b[\s\S]{0,80}\b(?:dimensions?|ratings?|scores?|strengths?|ten|10)\b/i,
  /(?:^|[.!?]\s+)(?:please\s+)?(?:rate|score)\s+(?:me|my|this|the\s+answer)\b[\s\S]{0,80}\b(?:ten|10|high|maximum|perfect)\b/i,
  /(?:^|\s)(?:\[|<|###\s*)(?:system|developer|assistant)(?:\]|>|\s*:)/i,
  /\[TURN_ID\s*=/i,
] as const;

/**
 * Establish the canonical, untrusted-data boundary used before evaluation.
 * Malformed events and instruction-shaped transcript content fail closed;
 * deterministic replays are removed so they cannot inflate eligibility.
 */
export function prepareFeedbackTranscript(
  turns: readonly FeedbackTranscriptTurnInput[],
  options: PrepareFeedbackTranscriptOptions = {}
): PreparedFeedbackTranscript {
  const transcript: FeedbackTranscriptTurn[] = [];
  const issues: FeedbackTranscriptIssue[] = [];
  const eventIds = new Set<string>();
  const semanticTurns: Array<{
    speaker: FeedbackTranscriptTurn["speaker"];
    text: string;
  }> = [];

  for (const turn of turns) {
    const eventId = typeof turn.eventId === "string" ? turn.eventId.trim() : "";
    const text = typeof turn.text === "string" ? turn.text.trim() : "";
    const speaker = turn.speaker;
    const malformed =
      !eventId ||
      eventId.length > 256 ||
      !text ||
      isCorruptedTranscriptText(text) ||
      (speaker !== "user" && speaker !== "interviewer") ||
      (options.requireContractV2 && turn.contractVersion !== 2) ||
      eventIds.has(eventId);

    if (malformed) {
      issues.push({
        code: "malformed_event",
        eventId: eventId || null,
        fatal: true,
      });
      continue;
    }
    eventIds.add(eventId);

    if (isPromptInjectionShaped(text)) {
      issues.push({ code: "prompt_injection", eventId, fatal: true });
      continue;
    }

    const semanticText = normalizeSemanticText(text);
    if (
      semanticTurns.some(
        (prior) =>
          prior.speaker === speaker &&
          isSemanticReplay(prior.text, semanticText)
      )
    ) {
      issues.push({ code: "repeated_turn", eventId, fatal: false });
      continue;
    }
    semanticTurns.push({
      speaker: speaker as FeedbackTranscriptTurn["speaker"],
      text: semanticText,
    });
    transcript.push({
      eventId,
      speaker: speaker as FeedbackTranscriptTurn["speaker"],
      text,
    });
  }

  if (!transcript.some((turn) => turn.speaker === "user")) {
    issues.push({ code: "missing_user_speech", eventId: null, fatal: true });
  }

  const fatalCodes = new Set(
    issues.filter((issue) => issue.fatal).map((issue) => issue.code)
  );
  const reasons: string[] = [];
  if (fatalCodes.has("malformed_event")) {
    reasons.push("Transcript data is incomplete or corrupted");
  }
  if (fatalCodes.has("prompt_injection")) {
    reasons.push(
      "Transcript contains instructions that cannot be evaluated safely"
    );
  }
  if (fatalCodes.has("missing_user_speech")) {
    reasons.push("No usable user speech was recorded");
  }

  return {
    transcript,
    issues,
    eligible: reasons.length === 0,
    reasons,
    duplicateTurnsRemoved: issues.filter(
      (issue) => issue.code === "repeated_turn"
    ).length,
  };
}

export function isPromptInjectionShaped(text: string): boolean {
  return (
    INJECTION_PATTERNS.some((pattern) => pattern.test(text)) ||
    isDirectEvaluationManipulation(text)
  );
}

const EVALUATION_OUTCOME_TERMS =
  /\b(?:dimensions?|excellent|flawless|improvements?|maximum|perfect|ratings?|scores?|strengths?|ten|10|weaknesses?)\b/i;
const COERCIVE_EVALUATION_OUTCOME =
  /\b(?:excellent|flawless|maximum|perfect|ratings?|scores?|ten|10)\b|\b(?:all|every)\s+dimensions?\b|\bonly\s+strengths?\b|\bno\s+(?:improvements?|weaknesses?)\b|\bdo\s+not\s+(?:identify|list|mention)\s+(?:improvements?|weaknesses?)\b/i;
const EVALUATOR_ADDRESS =
  /^(?:assistant|evaluator|judge|model|reviewer)\s*[,;:\-]/i;
const SELF_EVALUATION_IMPERATIVE =
  /^(?:please\s+)?(?:assess|classify|describe|evaluate|frame|judge|label|mark|present|rate|score|treat)\s+(?:all\s+dimensions|every\s+dimension|me\b|my\b)/i;
const RESPONSE_EVALUATION_IMPERATIVE =
  /^(?:please\s+)?(?:assess|classify|describe|evaluate|frame|judge|label|mark|present|rate|score|treat)\s+(?:the\s+answer\b|this\s+(?:answer|response)\b)/i;

function isDirectEvaluationManipulation(text: string): boolean {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .some((sentence) => {
      const coercive = COERCIVE_EVALUATION_OUTCOME.test(sentence);
      return (
        EVALUATOR_ADDRESS.test(sentence) ||
        (SELF_EVALUATION_IMPERATIVE.test(sentence) &&
          EVALUATION_OUTCOME_TERMS.test(sentence)) ||
        (RESPONSE_EVALUATION_IMPERATIVE.test(sentence) && coercive)
      );
    });
}

/**
 * Resolve harmless whitespace and typographic punctuation differences back to
 * the exact source substring. The returned value is always byte-for-byte text
 * from `source`; null means the proposed quote is not grounded.
 */
export function normalizeEvidenceQuoteToSource(
  source: string,
  proposedQuote: string
): string | null {
  const candidate = proposedQuote.trim();
  if (!candidate) return null;
  if (source.includes(candidate)) return candidate;

  const sourceProjection = projectComparableText(source);
  const quoteProjection = projectComparableText(candidate, true);
  if (!quoteProjection.text) return null;
  const offset = sourceProjection.text.indexOf(quoteProjection.text);
  if (offset < 0) return null;

  const first = sourceProjection.map[offset];
  const last = sourceProjection.map[offset + quoteProjection.text.length - 1];
  if (!first || !last) return null;
  const exact = source.slice(first.start, last.end);
  return exact.trim() ? exact : null;
}

function normalizeSemanticText(text: string): string {
  return projectComparableText(text, true)
    .text.toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSemanticReplay(left: string, right: string): boolean {
  if (left === right) return true;
  const leftTokens = left.split(" ").filter(Boolean);
  const rightTokens = right.split(" ").filter(Boolean);
  if (leftTokens.length < 2 || rightTokens.length < 2) return false;
  const leftBigrams = tokenBigrams(leftTokens);
  const rightBigrams = tokenBigrams(rightTokens);
  const intersection = [...leftBigrams].filter((bigram) =>
    rightBigrams.has(bigram)
  ).length;
  const union = new Set([...leftBigrams, ...rightBigrams]).size;
  const lengthRatio =
    Math.min(leftTokens.length, rightTokens.length) /
    Math.max(leftTokens.length, rightTokens.length);
  return lengthRatio >= 0.85 && intersection / union >= 0.9;
}

function tokenBigrams(tokens: string[]): Set<string> {
  const bigrams = new Set<string>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    bigrams.add(`${tokens[index]}\u0000${tokens[index + 1]}`);
  }
  return bigrams;
}

function isCorruptedTranscriptText(text: string): boolean {
  return (
    text.length > 20_000 ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/u.test(text)
  );
}

interface ComparableCharacter {
  start: number;
  end: number;
}

function projectComparableText(value: string, trim = false) {
  let text = "";
  const map: ComparableCharacter[] = [];

  for (let index = 0; index < value.length; ) {
    const point = value.codePointAt(index);
    if (point === undefined) break;
    const sourceCharacter = String.fromCodePoint(point);
    const end = index + sourceCharacter.length;
    const normalized = normalizeComparableCharacter(sourceCharacter);

    for (const character of normalized) {
      if (/\s/u.test(character)) {
        if (text.endsWith(" ")) {
          map[map.length - 1] = { start: map[map.length - 1].start, end };
        } else {
          text += " ";
          map.push({ start: index, end });
        }
      } else {
        text += character;
        map.push({ start: index, end });
      }
    }
    index = end;
  }

  if (!trim) return { text, map };
  const leading = text.length - text.trimStart().length;
  const trailing = text.length - text.trimEnd().length;
  return {
    text: text.slice(leading, text.length - trailing),
    map: map.slice(leading, map.length - trailing),
  };
}

function normalizeComparableCharacter(character: string): string {
  return character
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-");
}
