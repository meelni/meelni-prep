import { calculateOverallScore, type FeedbackDimension } from "./evaluation";
import { isMinimallySubstantiveEvidenceQuote } from "./feedback-language-policy";
import {
  normalizeEvidenceQuoteToSource,
  type FeedbackTranscriptTurn,
} from "./feedback-transcript";

export type { FeedbackTranscriptTurn } from "./feedback-transcript";
export {
  hasRecognizedCandidateEvidenceSignal,
  hasSubstantiveCandidateResponseSignal,
} from "./feedback-language-policy";

export const FEEDBACK_SCHEMA_VERSION = "feedback.v2" as const;
export const FEEDBACK_PROMPT_VERSION = "feedback.prompt.v2" as const;
export const FEEDBACK_RUBRIC_VERSION = "pm-feedback-rubric.v2" as const;

export const FEEDBACK_EVALUATION_STATES = ["full", "partial"] as const;
export type FeedbackEvaluationState =
  (typeof FEEDBACK_EVALUATION_STATES)[number];

export interface FeedbackEvidence {
  turnRef: string;
  quote: string;
}

export interface FeedbackV2Item {
  dimension: FeedbackDimension;
  observation: string;
  transcriptRefs: string[];
  evidence: FeedbackEvidence[];
  nextStep: string;
  rubricVersion: typeof FEEDBACK_RUBRIC_VERSION;
  confidence: number;
}

export interface FeedbackV2Scores {
  structure: number;
  clarity: number;
  insight: number;
  communication: number;
  leadership: number;
}

export interface FeedbackV2Result {
  schemaVersion: typeof FEEDBACK_SCHEMA_VERSION;
  promptVersion: typeof FEEDBACK_PROMPT_VERSION;
  modelVersion: string;
  rubricVersion: typeof FEEDBACK_RUBRIC_VERSION;
  evaluationState: FeedbackEvaluationState;
  scores: FeedbackV2Scores;
  overallScore: number;
  strengths: FeedbackV2Item[];
  improvements: FeedbackV2Item[];
  drills: string[];
  summary: string;
}

export interface ParseFeedbackV2Options {
  transcript: FeedbackTranscriptTurn[];
  evaluationState: FeedbackEvaluationState;
  modelVersion: string;
}

export type ReadableFeedbackItem = FeedbackV2Item | FeedbackItemV1 | string;

export interface FeedbackItemV1 {
  dimension: FeedbackDimension;
  text: string;
  evidence_quote?: string;
  example?: string;
}

/** Safe compatibility projection for UI/read paths; never used to validate writes. */
export function projectFeedbackItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return entry.trim() ? [entry] : [];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.observation === "string" && record.observation.trim()) {
      const nextStep =
        typeof record.nextStep === "string" && record.nextStep.trim()
          ? ` Next step: ${record.nextStep}`
          : "";
      return [`${record.observation}${nextStep}`];
    }
    return typeof record.text === "string" && record.text.trim()
      ? [record.text]
      : [];
  });
}

export function isFeedbackV2Item(value: unknown): value is FeedbackV2Item {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<FeedbackV2Item>;
  const transcriptRefs = item.transcriptRefs;
  const evidence = item.evidence;
  if (
    !Array.isArray(transcriptRefs) ||
    transcriptRefs.length < 1 ||
    transcriptRefs.length > 5 ||
    !transcriptRefs.every(
      (reference) =>
        typeof reference === "string" && reference.trim().length > 0
    ) ||
    new Set(transcriptRefs).size !== transcriptRefs.length
  ) {
    return false;
  }
  if (
    !Array.isArray(evidence) ||
    evidence.length < 1 ||
    evidence.length > 5 ||
    !evidence.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        typeof entry.turnRef === "string" &&
        entry.turnRef.trim().length > 0 &&
        typeof entry.quote === "string" &&
        entry.quote.trim().length > 0
    )
  ) {
    return false;
  }
  const evidenceRefs = evidence.map((entry) => entry.turnRef);
  return (
    typeof item.dimension === "string" &&
    DIMENSIONS.has(item.dimension as FeedbackDimension) &&
    typeof item.observation === "string" &&
    item.observation.trim().length > 0 &&
    new Set(evidenceRefs).size === evidenceRefs.length &&
    evidenceRefs.length === transcriptRefs.length &&
    transcriptRefs.every((reference) => evidenceRefs.includes(reference)) &&
    typeof item.nextStep === "string" &&
    item.nextStep.trim().length > 0 &&
    item.rubricVersion === FEEDBACK_RUBRIC_VERSION &&
    typeof item.confidence === "number" &&
    Number.isFinite(item.confidence) &&
    item.confidence >= 0 &&
    item.confidence <= 1
  );
}

const DIMENSIONS = new Set<FeedbackDimension>([
  "structure",
  "clarity",
  "insight",
  "communication",
  "leadership",
]);

export class FeedbackV2ParseError extends Error {
  constructor(message: string) {
    super(`Invalid feedback v2: ${message}`);
    this.name = "FeedbackV2ParseError";
  }
}

export function parseFeedbackV2(
  value: unknown,
  options: ParseFeedbackV2Options
): FeedbackV2Result {
  const root = requireRecord(value, "response");
  requireExactKeys(root, "response", [
    "schemaVersion",
    "promptVersion",
    "rubricVersion",
    "evaluationState",
    "scores",
    "strengths",
    "improvements",
    "drills",
    "summary",
  ]);
  requireExact(root.schemaVersion, FEEDBACK_SCHEMA_VERSION, "schemaVersion");
  requireExact(root.promptVersion, FEEDBACK_PROMPT_VERSION, "promptVersion");
  requireExact(root.rubricVersion, FEEDBACK_RUBRIC_VERSION, "rubricVersion");
  requireExact(
    root.evaluationState,
    options.evaluationState,
    "evaluationState"
  );

  const modelVersion = requireNonEmpty(options.modelVersion, "modelVersion");
  const transcriptById = buildTranscriptIndex(options.transcript);
  const scoresRecord = requireRecord(root.scores, "scores");
  requireExactKeys(scoresRecord, "scores", [
    "structure",
    "clarity",
    "insight",
    "communication",
    "leadership",
  ]);
  const scores: FeedbackV2Scores = {
    structure: requireScore(scoresRecord.structure, "scores.structure"),
    clarity: requireScore(scoresRecord.clarity, "scores.clarity"),
    insight: requireScore(scoresRecord.insight, "scores.insight"),
    communication: requireScore(
      scoresRecord.communication,
      "scores.communication"
    ),
    leadership: requireScore(scoresRecord.leadership, "scores.leadership"),
  };

  const strengths = parseItems(root.strengths, "strengths", transcriptById);
  const improvements = parseItems(
    root.improvements,
    "improvements",
    transcriptById
  );
  requireUniqueEvidence([...strengths, ...improvements], transcriptById);
  for (const [index, finding] of strengths.entries()) {
    requireObservableFindingSupport({
      path: `strengths[${index}]`,
      observation: finding.observation,
      evidence: finding.evidence,
      confidence: finding.confidence,
      transcriptById,
    });
  }
  for (const [index, finding] of improvements.entries()) {
    requireObservableFindingSupport({
      path: `improvements[${index}]`,
      observation: finding.observation,
      evidence: finding.evidence,
      confidence: finding.confidence,
      transcriptById,
    });
  }
  requireScorePrecision(scores, strengths, improvements);
  const summary = requireNonEmpty(root.summary, "summary");
  requireEvidenceLimitedSummary(summary, [...strengths, ...improvements]);

  return {
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    modelVersion,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: options.evaluationState,
    scores,
    overallScore: calculateOverallScore(scores),
    strengths,
    improvements,
    drills: parseStringArray(root.drills, "drills", 1, 3),
    summary,
  };
}

function buildTranscriptIndex(
  transcript: FeedbackTranscriptTurn[]
): Map<string, FeedbackTranscriptTurn> {
  if (transcript.length === 0) {
    throw new FeedbackV2ParseError("canonical transcript is empty");
  }
  const index = new Map<string, FeedbackTranscriptTurn>();
  for (const [position, turn] of transcript.entries()) {
    const eventId = requireNonEmpty(
      turn.eventId,
      `transcript[${position}].eventId`
    );
    const text = requireNonEmpty(turn.text, `transcript[${position}].text`);
    if (turn.speaker !== "user" && turn.speaker !== "interviewer") {
      throw new FeedbackV2ParseError(
        `transcript[${position}].speaker must be user or interviewer`
      );
    }
    if (index.has(eventId)) {
      throw new FeedbackV2ParseError(`duplicate transcript eventId ${eventId}`);
    }
    index.set(eventId, { eventId, text, speaker: turn.speaker });
  }
  return index;
}

function parseItems(
  value: unknown,
  path: string,
  transcriptById: Map<string, FeedbackTranscriptTurn>
): FeedbackV2Item[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    throw new FeedbackV2ParseError(`${path} must contain 1 to 5 items`);
  }
  return value.map((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = requireRecord(entry, itemPath);
    requireExactKeys(item, itemPath, [
      "dimension",
      "observation",
      "transcriptRefs",
      "evidence",
      "nextStep",
      "rubricVersion",
      "confidence",
    ]);
    const dimension = item.dimension;
    if (
      typeof dimension !== "string" ||
      !DIMENSIONS.has(dimension as FeedbackDimension)
    ) {
      throw new FeedbackV2ParseError(`${itemPath}.dimension is invalid`);
    }
    requireExact(
      item.rubricVersion,
      FEEDBACK_RUBRIC_VERSION,
      `${itemPath}.rubricVersion`
    );
    const transcriptRefs = parseStringArray(
      item.transcriptRefs,
      `${itemPath}.transcriptRefs`,
      1,
      5
    );
    if (new Set(transcriptRefs).size !== transcriptRefs.length) {
      throw new FeedbackV2ParseError(
        `${itemPath}.transcriptRefs contains duplicates`
      );
    }
    const evidence = parseEvidence(
      item.evidence,
      `${itemPath}.evidence`,
      transcriptById
    );
    const evidenceRefs = new Set(evidence.map((entry) => entry.turnRef));
    if (
      evidenceRefs.size !== transcriptRefs.length ||
      transcriptRefs.some((reference) => !evidenceRefs.has(reference))
    ) {
      throw new FeedbackV2ParseError(
        `${itemPath} transcriptRefs and evidence references must match`
      );
    }
    const observation = requireNonEmpty(
      item.observation,
      `${itemPath}.observation`
    );
    const confidence = requireConfidence(
      item.confidence,
      `${itemPath}.confidence`
    );
    return {
      dimension: dimension as FeedbackDimension,
      observation,
      transcriptRefs,
      evidence,
      nextStep: requireNonEmpty(item.nextStep, `${itemPath}.nextStep`),
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      confidence,
    };
  });
}

const OBSERVATION_SUPPORT_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "answer",
  "are",
  "be",
  "been",
  "being",
  "candidate",
  "cited",
  "clear",
  "clearly",
  "describes",
  "did",
  "do",
  "does",
  "explicit",
  "finding",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "of",
  "opportunity",
  "response",
  "shows",
  "specific",
  "that",
  "the",
  "their",
  "this",
  "to",
  "turn",
  "was",
  "were",
  "with",
]);

const SUPPORT_CONCEPT_GROUPS = [
  ["audience", "caregiver", "customer", "parent", "segment", "user"],
  [
    "choice",
    "choose",
    "decision",
    "identify",
    "prioritize",
    "recommend",
    "select",
    "success",
  ],
  ["experiment", "pilot", "test", "trial", "validate"],
  ["define", "name", "specify", "state"],
  [
    "activation",
    "arr",
    "churn",
    "conversion",
    "kpi",
    "measure",
    "metric",
    "mrr",
    "outcome",
    "retain",
    "retained",
    "retention",
    "revenue",
  ],
  ["launch", "release", "ship"],
  ["pain", "problem", "risk"],
  ["compare", "tradeoff", "versus"],
] as const;

const SUPPORT_CONCEPT_BY_STEM = new Map<string, string>(
  SUPPORT_CONCEPT_GROUPS.flatMap((group, index) =>
    group.map((member) => [getSupportStem(member), `concept:${index}`] as const)
  )
);

const NUMBER_WORDS = new Map<string, string>([
  ["zero", "0"],
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["eleven", "11"],
  ["twelve", "12"],
  ["thirteen", "13"],
  ["fourteen", "14"],
  ["fifteen", "15"],
  ["sixteen", "16"],
  ["seventeen", "17"],
  ["eighteen", "18"],
  ["nineteen", "19"],
  ["twenty", "20"],
  ["thirty", "30"],
  ["forty", "40"],
  ["fifty", "50"],
  ["sixty", "60"],
  ["seventy", "70"],
  ["eighty", "80"],
  ["ninety", "90"],
  ["dozen", "12"],
  ["dozens", "dozens"],
  ["hundred", "100"],
  ["hundreds", "hundreds"],
  ["thousand", "1000"],
  ["thousands", "thousands"],
  ["million", "1000000"],
  ["millions", "millions"],
]);

const COMPOUND_NUMBER_TENS = new Map<string, number>([
  ["twenty", 20],
  ["thirty", 30],
  ["forty", 40],
  ["fifty", 50],
  ["sixty", 60],
  ["seventy", 70],
  ["eighty", 80],
  ["ninety", 90],
]);
const COMPOUND_NUMBER_ONES = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
]);
const QUANTITY_UNIT_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);
const MULTIPLIER_TARGET_SKIP_WORDS = new Set([
  ...QUANTITY_UNIT_STOP_WORDS,
  "annual",
  "average",
  "change",
  "customer",
  "daily",
  "decrease",
  "decline",
  "gain",
  "greater",
  "growth",
  "her",
  "higher",
  "his",
  "improvement",
  "increase",
  "increased",
  "its",
  "lift",
  "lower",
  "many",
  "monthly",
  "more",
  "much",
  "my",
  "our",
  "overall",
  "product",
  "quarterly",
  "rate",
  "reduction",
  "their",
  "total",
  "user",
  "weekly",
  "yearly",
  "your",
]);
const MULTIPLIER_TARGET_PREFERRED_STEMS = new Set(
  SUPPORT_CONCEPT_GROUPS[4].map(getSupportStem)
);

const QUANTITATIVE_PHRASE_PATTERNS = [
  {
    anchor: "quantity:statistically-significant",
    pattern: /\bstatistically\s+significant\b/iu,
  },
  {
    anchor: "quantity:2x",
    pattern:
      /\b(?:doubled|doubles|doubling|twofold)\b|\bdouble(?!-)\s+(?:(?:an?|my|our|that|the|their|this)\s+)?\p{L}+\b|\btwice\s+(?:as\s+(?:many|much)|the)\b|(?:^|[^\p{L}\p{N}_])2\s*[x×](?=$|[^\p{L}\p{N}_])/iu,
  },
  {
    anchor: "quantity:3x",
    pattern:
      /\b(?:thrice|threefold|triple(?:d|s)?|tripling)\b|(?:^|[^\p{L}\p{N}_])3\s*[x×](?=$|[^\p{L}\p{N}_])/iu,
  },
  {
    anchor: "quantity:half",
    pattern:
      /\bhalv(?:ed|es|ing)\b|\bhalf(?!-)\s+(?:(?:of\s+)?(?:an?|my|our|that|the|their|this)\s+)?\p{L}+\b/iu,
  },
] as const;

const LEXICAL_MULTIPLIER_FAMILIES = [
  {
    anchor: "quantity:2x",
    pattern: /\b(?:double(?!-)|doubled|doubles|doubling|twice)\b/gu,
  },
  {
    anchor: "quantity:3x",
    pattern: /\b(?:thrice|triple|tripled|triples|tripling)\b/gu,
  },
  {
    anchor: "quantity:4x",
    pattern: /\b(?:quadruple|quadrupled|quadruples|quadrupling)\b/gu,
  },
  {
    anchor: "quantity:half",
    pattern: /\b(?:half(?!-)|halved|halves|halving)\b/gu,
  },
] as const;

const ABSOLUTE_CLAIM_WORDS = new Set([
  "all",
  "always",
  "completely",
  "entirely",
  "every",
  "never",
  "no",
  "none",
  "only",
]);

const NEGATIVE_CLAIM_PATTERN =
  /\b(?:did\s+not|does\s+not|do\s+not|didn['’]t|doesn['’]t|don['’]t|isn['’]t|wasn['’]t|weren['’]t|hasn['’]t|haven['’]t|hadn['’]t|can['’]t|cannot|couldn['’]t|wouldn['’]t|shouldn['’]t|won['’]t|failed\s+to|fails?\s+to|lack(?:ed|ing|s)?|miss(?:ed|es|ing)?|never|no|not|omit(?:ted|s|ting)?|without)\b/giu;
const NEGATIVE_MATERIAL_POLARITY_PATTERN =
  /\b(?:insecure(?:ly)?|insecurity|non[\s_-]*secur(?:e|ed|ely|ity)|un[\s_-]*secur(?:e|ed|ely)|un[\s_-]*encrypt(?:ed|ing))\b/iu;
const ABSENCE_CLAIM_PATTERN =
  /\b(?:absent|indeterminate|pending|tbd|to\s+be\s+determined|unaddressed|undecided|undefined|undetermined|unidentified|unmeasured|unprioriti[sz]ed|unknown|unresolved|unspecified|unset|unvalidated)\b/iu;
const ADVERSE_LIMITING_ADVERB_PATTERN = /\b(?:barely|hardly|scarcely)\b/iu;
const ADVERSE_DEVOID_PATTERN =
  /\bdevoid\s+of\s+(?:(?:an?|the)\s+)?(?:analysis|criteria|criterion|decision\s+thresholds?|details?|evidence|explanations?|frameworks?|metrics?|reasoning|specifics?|structures?|success\s+thresholds?)\b/iu;
const ABSENCE_CLAIM_GLOBAL_PATTERN =
  /\b(?:absent|indeterminate|pending|tbd|to\s+be\s+determined|unaddressed|undecided|undefined|undetermined|unidentified|unmeasured|unprioriti[sz]ed|unknown|unresolved|unspecified|unset|unvalidated)\b/giu;
const COMPACT_EVIDENCE_GRAPHEME_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const MATERIAL_CLAIM_FAMILIES = [
  {
    anchor: "material:safety:negative",
    pattern: /^unsafe(?:ly|ty)?$/u,
  },
  {
    anchor: "material:safety",
    pattern: /^(?:safe(?:ly|ty)?|safeguard(?:ed|ing|s)?)$/u,
  },
  {
    anchor: "material:security:negative",
    pattern:
      /^(?:insecure(?:ly)?|insecurity|nonsecure(?:ly)?|unsecure(?:d|ly)?)$/u,
  },
  {
    anchor: "material:security",
    pattern: /^(?:secur(?:e|ed|es|ing|ity|ely))$/u,
  },
  {
    anchor: "material:legal:negative",
    pattern: /^(?:illegal(?:ity|ly)?|unlawful(?:ly)?)$/u,
  },
  {
    anchor: "material:legal",
    pattern: /^(?:legal(?:ity|ly)?|lawful(?:ly)?)$/u,
  },
  {
    anchor: "material:privacy",
    pattern: /^(?:privacy|private(?:ly)?)$/u,
  },
  {
    anchor: "material:compliance:negative",
    pattern: /^(?:noncompliance|noncompliant(?:ly)?)$/u,
  },
  {
    anchor: "material:compliance",
    pattern:
      /^(?:compliance|compliant(?:ly)?|comply|complies|complied|complying)$/u,
  },
  {
    anchor: "material:biometric",
    pattern: /^biometric(?:s|ally)?$/u,
  },
  {
    anchor: "material:consent",
    pattern: /^consent(?:ed|ing|s)?$/u,
  },
  {
    anchor: "material:discrimination",
    pattern: /^discriminat(?:e|ed|es|ing|ion|ory)$/u,
  },
  {
    anchor: "material:encryption:negative",
    pattern: /^unencrypt(?:ed|ing)?$/u,
  },
  {
    anchor: "material:encryption",
    pattern: /^encrypt(?:ed|ing|ion|s)?$/u,
  },
  {
    anchor: "material:fairness",
    pattern: /^fairness$/u,
  },
  {
    anchor: "material:regulation",
    pattern: /^regulat(?:e|ed|es|ing|ion|ions|ory)$/u,
  },
  {
    anchor: "material:surveillance",
    pattern: /^surveillance$/u,
  },
  {
    anchor: "material:growth",
    pattern: /^growth$/u,
  },
  {
    anchor: "material:demand",
    pattern: /^demand(?:ed|ing|s)?$/u,
  },
  {
    anchor: "material:profit",
    pattern: /^profit(?:able|ability|ed|ing|s)?$/u,
  },
  {
    anchor: "material:delight",
    pattern: /^delight(?:ed|ful|ing|s)?$/u,
  },
] as const;

const DIRECTIONAL_CLAIM_FAMILIES = [
  {
    polarity: "positive",
    pattern:
      /\b(?:accelerat(?:e|ed|es|ing)|gain(?:ed|ing|s)?|grew|grow(?:ing|n|s)?|higher|improv(?:e|ed|ement|ements|es|ing)|increas(?:e|ed|es|ing)|lift(?:ed|ing|s)?|rapid|ris(?:e|en|es|ing)|rose|strong(?:er|est)?|surge(?:d|s|ing)?)\b/iu,
  },
  {
    polarity: "negative",
    pattern:
      /\b(?:deceler(?:ate|ated|ates|ating)|decreas(?:e|ed|es|ing)|declin(?:e|ed|es|ing)|deteriorat(?:e|ed|es|ing)|drop(?:ped|ping|s)?|fell|fall(?:en|ing|s)?|lower|loss(?:es)?|reduc(?:e|ed|es|ing|tion)|shrank|shrink(?:ing|s)?|slower|weak(?:er|est)?)\b/iu,
  },
] as const;

const DIRECTIONAL_TARGET_FAMILIES = [
  { anchor: "activation", pattern: /\bactivat(?:e|ed|es|ing|ion)\b/iu },
  { anchor: "churn", pattern: /\bchurn(?:ed|ing|s)?\b/iu },
  {
    anchor: "conversion",
    pattern: /\bconvert(?:ed|ing|s)?\b|\bconversion\b/iu,
  },
  { anchor: "delight", pattern: /\bdelight(?:ed|ful|ing|s)?\b/iu },
  { anchor: "demand", pattern: /\bdemand(?:ed|ing|s)?\b/iu },
  { anchor: "growth", pattern: /\bgrowth\b/iu },
  {
    anchor: "profit",
    pattern: /\bprofit(?:able|ability|ed|ing|s)?\b/iu,
  },
  { anchor: "retention", pattern: /\bretain(?:ed|ing|s)?\b|\bretention\b/iu },
  { anchor: "revenue", pattern: /\brevenue\b/iu },
] as const;

const GENERIC_DIRECTIONAL_METRIC_HEADS = new Set([
  "accuracy",
  "adoption",
  "arpa",
  "arpu",
  "availability",
  "cac",
  "cost",
  "costs",
  "dau",
  "downtime",
  "efficiency",
  "engagement",
  "frequency",
  "latency",
  "ltv",
  "margin",
  "mau",
  "nps",
  "precision",
  "productivity",
  "recall",
  "reliability",
  "roi",
  "satisfaction",
  "spend",
  "throughput",
  "traffic",
  "uptime",
  "usage",
  "velocity",
  "volume",
  "wau",
]);
const GENERIC_DIRECTIONAL_METRIC_SUFFIXES = new Set([
  "count",
  "counts",
  "duration",
  "durations",
  "percentage",
  "percentages",
  "percentile",
  "percentiles",
  "rate",
  "rates",
  "ratio",
  "ratios",
  "score",
  "scores",
  "time",
  "times",
]);
const GENERIC_DIRECTIONAL_METRIC_PREFIX_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "its",
  "my",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "this",
  "to",
  "with",
]);

interface ObservableFindingSupportInput {
  path: string;
  observation: string;
  evidence: FeedbackEvidence[];
  confidence: number;
  transcriptById: Map<string, FeedbackTranscriptTurn>;
}

/**
 * Reject deterministic evidence-policy violations without claiming semantic
 * entailment. This guard proves only observable lexical/concept support,
 * quantitative and absolute anchors, direct negative contradictions, and
 * enough quoted context for very-high-confidence findings.
 */
function requireObservableFindingSupport({
  path,
  observation,
  evidence,
  confidence,
  transcriptById,
}: ObservableFindingSupportInput): void {
  const evidenceText = evidence.map((entry) => entry.quote).join(" ");
  const sourceText = evidence
    .map((entry) => transcriptById.get(entry.turnRef)?.text ?? "")
    .join(" ");
  const compactObservation = isPredominantlyCompactLanguage(observation);
  const observationSignals = getObservableSupportAnchors(observation);
  const evidenceSignals = getObservableSupportAnchors(evidenceText);
  const sourceSignals = getObservableSupportAnchors(sourceText);
  const hasCompactObservationAnchor = getWordTokens(observation).some(
    (token) =>
      compactObservation &&
      !/^[a-z]+$/iu.test(token) &&
      [...token].length >= 2 &&
      sourceText.normalize("NFKC").includes(token.normalize("NFKC"))
  );
  const hasCompactEvidenceAnchor = getWordTokens(observation).some(
    (token) =>
      compactObservation &&
      isPredominantlyCompactLanguage(evidenceText) &&
      !/^[a-z]+$/iu.test(token) &&
      [...token].length >= 2 &&
      evidenceText.normalize("NFKC").includes(token.normalize("NFKC"))
  );
  const sourceSupportCount = countIntersection(
    observationSignals,
    sourceSignals
  );
  const exactEvidenceSupportCount = countIntersection(
    observationSignals,
    evidenceSignals
  );
  const exactCitationClaims = getBoundedExactCitationClaims(observation);
  const groundedExactCitationClaims = exactCitationClaims.filter((claim) =>
    evidence.some((entry) =>
      entry.quote.normalize("NFKC").toLocaleLowerCase("en-US").includes(claim)
    )
  );
  const isExactCitation =
    exactCitationClaims.length > 0 &&
    groundedExactCitationClaims.length === exactCitationClaims.length;
  if (exactCitationClaims.length > 0 && !isExactCitation) {
    throw new FeedbackV2ParseError(
      `${path}.observation claims an exact citation that is absent from every individual evidence quote`
    );
  }
  const hasExactEvidenceSupport =
    exactEvidenceSupportCount > 0 ||
    hasCompactEvidenceAnchor ||
    isExactCitation;
  const claimedQuantities = getQuantitativeAnchors(observation);
  const evidencedQuantities = getQuantitativeAnchors(evidenceText);
  if (
    ![...claimedQuantities].every((anchor) => evidencedQuantities.has(anchor))
  ) {
    throw new FeedbackV2ParseError(
      `${path}.observation contains a quantitative claim absent from its exact evidence quotes`
    );
  }

  const claimedAbsolutes = getAbsoluteClaimAnchors(observation);
  const evidencedAbsolutes = getAbsoluteClaimAnchors(evidenceText);
  if (
    ![...claimedAbsolutes].every((anchor) => evidencedAbsolutes.has(anchor))
  ) {
    throw new FeedbackV2ParseError(
      `${path}.observation contains an absolute claim absent from its exact evidence quotes`
    );
  }

  const negativeTargets = new Set([
    ...getNegativeClaimTargetSignals(observation),
    ...getAbsenceClaimTargetSignals(observation),
  ]);
  if (
    negativeTargets.size > 0 &&
    hasPositiveTargetClause(sourceText, negativeTargets)
  ) {
    throw new FeedbackV2ParseError(
      `${path}.observation makes a negative claim contradicted by its cited candidate turns`
    );
  }

  const criticalClaims = getCriticalClaimAnchors(observation);
  const criticalEvidence = getCriticalClaimAnchors(evidenceText);
  if (![...criticalClaims].every((anchor) => criticalEvidence.has(anchor))) {
    throw new FeedbackV2ParseError(
      `${path}.observation contains a material claim absent from its exact evidence quotes`
    );
  }
  const directionalClaims = getDirectionalClaimAnchors(observation);
  const groundedDirectionalClaims = getGroundedDirectionalClaimAnchors(
    evidence,
    transcriptById
  );
  if (
    ![...directionalClaims].every((anchor) =>
      groundedDirectionalClaims.has(anchor)
    )
  ) {
    throw new FeedbackV2ParseError(
      `${path}.observation contains a directional claim absent from an individual exact evidence quote and its cited candidate turn`
    );
  }

  if (
    observationSignals.size === 0 &&
    !hasCompactObservationAnchor &&
    !isExactCitation
  ) {
    throw new FeedbackV2ParseError(
      `${path}.observation has no observable claim anchors`
    );
  }
  if (!hasExactEvidenceSupport) {
    throw new FeedbackV2ParseError(
      `${path}.observation has no observable support in its exact evidence quotes`
    );
  }
  if (
    !isExactCitation &&
    !hasCompactEvidenceAnchor &&
    (sourceSupportCount < 2 || exactEvidenceSupportCount < 2)
  ) {
    throw new FeedbackV2ParseError(
      `${path}.observation requires at least two independent observable supports in its exact evidence quotes and cited candidate turns`
    );
  }
  if (
    sourceSupportCount === 0 &&
    !hasCompactObservationAnchor &&
    !isExactCitation
  ) {
    throw new FeedbackV2ParseError(
      `${path}.observation has no observable support in its cited candidate turns`
    );
  }

  if (confidence > 0.9) {
    const evidenceUnits = countEvidenceLexicalUnits(evidenceText);
    const evidenceLetters = (evidenceText.match(/\p{L}/gu) ?? []).length;
    if (evidenceUnits < 6 || evidenceLetters < 24) {
      throw new FeedbackV2ParseError(
        `${path}.confidence above 0.9 requires at least 6 quoted lexical units and 24 letters of exact evidence`
      );
    }
  }
}

function requireScorePrecision(
  scores: FeedbackV2Scores,
  strengths: readonly FeedbackV2Item[],
  improvements: readonly FeedbackV2Item[]
): void {
  const strengthDimensions = new Set(
    strengths
      .filter((strength) => !containsAdverseClaim(strength.observation))
      .map((strength) => strength.dimension)
  );
  for (const dimension of DIMENSIONS) {
    const score = scores[dimension];
    if (score >= 9 && !strengthDimensions.has(dimension)) {
      throw new FeedbackV2ParseError(
        `exceptional ${dimension} score requires a same-dimension grounded strength`
      );
    }
  }

  const overallScore = calculateOverallScore(scores);
  if (overallScore < 9) return;

  const findings = [...strengths, ...improvements];
  const evidence = findings.flatMap((finding) => finding.evidence);
  const distinctTurns = new Set(evidence.map((entry) => entry.turnRef)).size;
  const quotedUnits = countEvidenceLexicalUnits(
    evidence.map((entry) => entry.quote).join(" ")
  );
  if (distinctTurns < 3 || quotedUnits < 18) {
    throw new FeedbackV2ParseError(
      "exceptional scores with an overall score of 9 or higher require exact evidence from at least 3 candidate turns and 18 quoted lexical units"
    );
  }
}

function getCriticalClaimAnchors(text: string): Set<string> {
  const normalized = text.normalize("NFKC");
  const anchors = new Set<string>();
  let materialProjection = normalizeMaterialNegationContractions(normalized);
  materialProjection = materialProjection.replace(
    /\bnot\s+without(?:\s+any)?\s+(?:(?:apparent|critical|dangerous|known|major|material|meaningful|notable|obvious|serious|severe|significant|substantial|unresolved)\s+){0,2}(security|privacy|compliance)\s+(?:(?:apparent|critical|dangerous|known|major|material|meaningful|notable|obvious|serious|severe|significant|substantial|unresolved)\s+){0,2}(?:concerns?|defects?|deficienc(?:y|ies)|exposures?|failures?|flaws?|gaps?|hazards?|holes?|issues?|liabilit(?:y|ies)|problems?|risks?|shortcomings?|threats?|vulnerabilit(?:y|ies)|weakness(?:es)?)\b/giu,
    (_match, material: string) => {
      anchors.add(`material:${material.toLocaleLowerCase("en-US")}:negative`);
      return " ";
    }
  );
  for (const family of DOUBLE_NEGATED_MATERIAL_CLAIM_FAMILIES) {
    materialProjection = materialProjection.replace(
      family.pattern,
      (...args) => {
        const match = args[0] as string;
        const offset = args.at(-2) as number;
        const source = args.at(-1) as string;
        if (isFollowedByAdverseMaterialHead(source, offset + match.length)) {
          return match;
        }
        anchors.add(family.anchor);
        return " ";
      }
    );
  }
  for (const family of NEGATED_MATERIAL_CLAIM_FAMILIES) {
    materialProjection = materialProjection.replace(family.pattern, () => {
      anchors.add(family.anchor);
      return " ";
    });
  }
  materialProjection = materialProjection
    .replace(/\bnot\s+secur(?:e|ed)\b/giu, () => {
      anchors.add("material:security:negative");
      return " ";
    })
    .replace(
      /\b(?:not\s+encrypt(?:ed|ing)|without\s+(?:any\s+)?(?:encrypt(?:ed|ing)|encryption))\b/giu,
      () => {
        anchors.add("material:encryption:negative");
        return " ";
      }
    )
    .replace(
      /\b(?:insecure(?:ly)?|insecurity|non[\s_-]*secur(?:e|ed|ely|ity)|un[\s_-]*secur(?:e|ed|ely))\b/giu,
      () => {
        anchors.add("material:security:negative");
        return " ";
      }
    )
    .replace(/\bun[\s_-]*encrypt(?:ed|ing)\b/giu, () => {
      anchors.add("material:encryption:negative");
      return " ";
    })
    .replace(/\bnon[\s_-]*compli(?:ance|ant(?:ly)?)\b/giu, () => {
      anchors.add("material:compliance:negative");
      return " ";
    });
  const materialTokens = getWordTokens(materialProjection)
    .flatMap((token) => token.split(/[-_]/u))
    .map((token) => token.toLocaleLowerCase("en-US"));
  for (const token of materialTokens) {
    for (const family of MATERIAL_CLAIM_FAMILIES) {
      if (family.pattern.test(token)) anchors.add(family.anchor);
    }
  }
  addMaterialActionAssertionAnchors(anchors, materialProjection);
  if (
    /\bproduct[\s\p{Pd}/\u2044\u2212\u2215]+market\s+fit\b/iu.test(
      materialProjection
    )
  ) {
    anchors.add("material:product-market-fit");
  }
  for (const directionalAnchor of getDirectionalClaimAnchors(normalized)) {
    anchors.add(directionalAnchor);
  }
  return anchors;
}

function getDirectionalClaimAnchors(text: string): Set<string> {
  const anchors = new Set<string>();
  const clauses = text.split(
    /[.!?;:\n\u2026\u3002\uFF01\uFF1F]+|\b(?:although|but|however|while|yet)\b/iu
  );
  for (const clause of clauses) {
    const directions = [
      ...DIRECTIONAL_CLAIM_FAMILIES.flatMap((family) =>
        getDirectionalMentions(clause, family.pattern).map((mention) => {
          const assertionMode = getLocalAssertionMode(clause, mention.start);
          const polarity: DirectionalPolarity =
            assertionMode === "asserted"
              ? family.polarity
              : `${assertionMode}-${family.polarity}`;
          return { ...mention, polarity };
        })
      ),
      ...getDefinitionDirectionalMentions(clause),
    ].sort((left, right) => left.start - right.start || left.end - right.end);
    const targets = getMetricTargetMentions(clause);

    for (const direction of directions) {
      const leftTarget = targets.findLast(
        (target) =>
          target.end <= direction.start &&
          isLocalDirectionalTarget(clause, target, direction)
      );
      const rightTarget = targets.find(
        (target) =>
          target.start >= direction.end &&
          isLocalDirectionalTarget(clause, target, direction)
      );
      const leftDistance = leftTarget
        ? direction.start - leftTarget.end
        : Number.POSITIVE_INFINITY;
      const rightDistance = rightTarget
        ? rightTarget.start - direction.end
        : Number.POSITIVE_INFINITY;
      const primaryTarget =
        leftDistance <= rightDistance ? leftTarget : rightTarget;
      if (!primaryTarget) continue;

      const boundTargets = [primaryTarget];
      const primaryIndex = targets.indexOf(primaryTarget);
      const expansionStep = primaryTarget.end <= direction.start ? -1 : 1;
      let currentTarget = primaryTarget;
      for (
        let targetIndex = primaryIndex + expansionStep;
        targetIndex >= 0 && targetIndex < targets.length;
        targetIndex += expansionStep
      ) {
        const adjacentTarget = targets[targetIndex];
        const gap =
          expansionStep < 0
            ? clause.slice(adjacentTarget.end, currentTarget.start)
            : clause.slice(currentTarget.end, adjacentTarget.start);
        if (!isCoordinatedDirectionalTargetGap(gap)) break;
        boundTargets.push(adjacentTarget);
        currentTarget = adjacentTarget;
      }

      for (const target of boundTargets) {
        anchors.add(`direction:${target.anchor}:${direction.polarity}`);
      }
    }
  }
  return anchors;
}

interface DirectionalMention {
  start: number;
  end: number;
}

type DirectionalPolarity =
  | "positive"
  | "negative"
  | "negated-positive"
  | "negated-negative"
  | "hypothetical-positive"
  | "hypothetical-negative";

interface PolarizedDirectionalMention extends DirectionalMention {
  polarity: DirectionalPolarity;
}

function getDefinitionDirectionalMentions(
  text: string
): PolarizedDirectionalMention[] {
  const normalized = normalizeAssertionContractions(text);
  const mentions: PolarizedDirectionalMention[] = [];
  const claimedSpans: DirectionalMention[] = [];
  const addMentions = (
    pattern: RegExp,
    polarity: DirectionalPolarity,
    skipClaimed = false
  ) => {
    for (const mention of getDirectionalMentions(normalized, pattern)) {
      if (
        skipClaimed &&
        claimedSpans.some(
          (claimed) =>
            mention.start < claimed.end && mention.end > claimed.start
        )
      ) {
        continue;
      }
      mentions.push({ ...mention, polarity });
      claimedSpans.push(mention);
    }
  };

  addMentions(/\bnot\s+undefined\b/iu, "positive");
  addMentions(/\bundefined\b/iu, "negative", true);

  for (const mention of getDirectionalMentions(
    normalized,
    /\bdefin(?:e|ed|es|ing)\b/iu
  )) {
    if (
      claimedSpans.some(
        (claimed) => mention.start < claimed.end && mention.end > claimed.start
      )
    ) {
      continue;
    }
    const assertionMode = getLocalAssertionMode(normalized, mention.start);
    mentions.push({
      ...mention,
      polarity:
        assertionMode === "asserted"
          ? "positive"
          : assertionMode === "negated"
            ? "negative"
            : "hypothetical-positive",
    });
  }

  return mentions;
}

interface DirectionalTargetMention extends DirectionalMention {
  anchor: string;
  generic?: boolean;
}

interface DirectionalToken extends DirectionalMention {
  value: string;
}

function getDirectionalMentions(
  text: string,
  pattern: RegExp
): DirectionalMention[] {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function getMetricTargetMentions(text: string): DirectionalTargetMention[] {
  const canonicalTargets = DIRECTIONAL_TARGET_FAMILIES.flatMap((family) =>
    getDirectionalMentions(text, family.pattern).map((mention) => ({
      ...mention,
      anchor: family.anchor,
    }))
  );
  return [
    ...canonicalTargets,
    ...getGenericDirectionalMetricMentions(text, canonicalTargets),
  ].sort((left, right) => left.start - right.start || left.end - right.end);
}

function getGenericDirectionalMetricMentions(
  clause: string,
  canonicalTargets: readonly DirectionalTargetMention[]
): DirectionalTargetMention[] {
  const tokens: DirectionalToken[] = [
    ...clause.matchAll(/[\p{L}\p{N}]+/gu),
  ].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    value: match[0].toLocaleLowerCase("en-US"),
  }));
  const targets: DirectionalTargetMention[] = [];

  for (const [index, token] of tokens.entries()) {
    let targetStart = token.start;
    let targetParts: string[] | null = null;
    if (GENERIC_DIRECTIONAL_METRIC_HEADS.has(token.value)) {
      targetParts = [token.value];
    } else if (GENERIC_DIRECTIONAL_METRIC_SUFFIXES.has(token.value)) {
      const prefix = tokens[index - 1];
      const prefixGap = prefix ? clause.slice(prefix.end, token.start) : "";
      const hasUsablePrefix =
        prefix !== undefined &&
        /^[\s/_-]*$/u.test(prefixGap) &&
        !GENERIC_DIRECTIONAL_METRIC_PREFIX_STOP_WORDS.has(prefix.value) &&
        !isDirectionalClaimWord(prefix.value);
      if (hasUsablePrefix) {
        targetStart = prefix.start;
        targetParts = [prefix.value, token.value];
      } else {
        targetParts = [token.value];
      }
    }
    if (!targetParts) continue;

    const target = {
      start: targetStart,
      end: token.end,
      anchor: `metric:${targetParts.map(getSupportStem).join("-")}`,
      generic: true,
    } satisfies DirectionalTargetMention;
    if (
      canonicalTargets.some(
        (canonical) =>
          target.start < canonical.end && target.end > canonical.start
      )
    ) {
      continue;
    }
    targets.push(target);
  }

  return targets;
}

function isLocalDirectionalTarget(
  clause: string,
  target: DirectionalTargetMention,
  direction: DirectionalMention
): boolean {
  const gap =
    target.end <= direction.start
      ? clause.slice(target.end, direction.start)
      : clause.slice(direction.end, target.start);
  if (gap.length > 32) return false;
  return (
    gap.trim().length === 0 ||
    /^(?:\s+|\b(?:a|an|annual|been|customer|daily|dramatically|enterprise|had|has|have|is|market|materially|meaningfully|monthly|overall|product|quarterly|rapidly|segment|sharply|significantly|slightly|steadily|substantially|the|user|was|weekly|were|yearly)\b)+$/iu.test(
      gap
    )
  );
}

function isDirectionalClaimWord(token: string): boolean {
  return DIRECTIONAL_CLAIM_FAMILIES.some((family) => {
    const flags = family.pattern.flags.replace("g", "");
    return new RegExp(`^(?:${family.pattern.source})$`, flags).test(token);
  });
}

function isCoordinatedDirectionalTargetGap(gap: string): boolean {
  const normalized = gap.normalize("NFKC").toLocaleLowerCase("en-US");
  if (!/(?:,|&|\/|\b(?:and|or|plus)\b)/u.test(normalized)) return false;
  const remainder = normalized
    .replace(/\b(?:and|or|plus)\b/gu, " ")
    .replace(/[\s,&/+]+/gu, " ")
    .trim();
  if (!remainder) return true;
  const modifiers = getWordTokens(remainder).map((token) =>
    token.toLocaleLowerCase("en-US")
  );
  return (
    modifiers.length <= 2 &&
    modifiers.every((modifier) =>
      ["a", "an", "calculated", "segmented", "the"].includes(modifier)
    )
  );
}

function getGroundedDirectionalClaimAnchors(
  evidence: readonly FeedbackEvidence[],
  transcriptById: ReadonlyMap<string, FeedbackTranscriptTurn>
): Set<string> {
  const grounded = new Set<string>();
  for (const entry of evidence) {
    const quoteAnchors = getDirectionalClaimAnchors(entry.quote);
    const sourceAnchors = getDirectionalClaimAnchors(
      transcriptById.get(entry.turnRef)?.text ?? ""
    );
    for (const anchor of quoteAnchors) {
      if (sourceAnchors.has(anchor)) grounded.add(anchor);
    }
  }
  return grounded;
}

function getIndividualDirectionalClaimAnchors(
  evidence: readonly FeedbackEvidence[]
): Set<string> {
  return new Set(
    evidence.flatMap((entry) => [...getDirectionalClaimAnchors(entry.quote)])
  );
}

const NEGATED_MATERIAL_CLAIM_FAMILIES = [
  {
    anchor: "material:safety:negative",
    pattern:
      /\b(?:(?:not\s+|non[\s_-]*|un[\s_-]*)safe(?:ly)?|not\s+safeguard(?:ed|ing|s)?|(?:no|without(?:\s+any)?)\s+safety)\b/giu,
  },
  {
    anchor: "material:security:negative",
    pattern:
      /\b(?:(?:not\s+|non[\s_-]*|un[\s_-]*)secur(?:e|ed|ely|ity)|(?:no|without(?:\s+any)?)\s+security|(?:(?:(?:do|does|did|can|could|would|should|will)\s+)?not|never|fail(?:ed|s)?\s+to)\s+(?:\p{L}+ly\s+){0,2}secur(?:e|ed|es|ing)\s+(?:(?:customer|personal|private|sensitive|user)\s+){0,2}(?:data|information|records?))\b/giu,
  },
  {
    anchor: "material:legal:negative",
    pattern:
      /\b(?:(?:not\s+|non[\s_-]*)legal(?:ly|ity)?|not\s+lawful(?:ly)?|(?:no|without(?:\s+any)?)\s+(?:legal(?:ity)?|lawful(?:ness)?))\b/giu,
  },
  {
    anchor: "material:privacy:negative",
    pattern:
      /\b(?:(?:not\s+|non[\s_-]*)private(?:ly)?|(?:no|without(?:\s+any)?)\s+privacy|(?:(?:(?:do|does|did|can|could|would|should|will)\s+)?not|never|fail(?:ed|s)?\s+to)\s+(?:\p{L}+ly\s+){0,2}(?:preserv(?:e|ed|es|ing)|protect(?:ed|ing|s)?|safeguard(?:ed|ing|s)?)\s+(?:\p{L}[\p{L}-]*\s+){0,2}privacy)\b/giu,
  },
  {
    anchor: "material:compliance:negative",
    pattern:
      /\b(?:(?:not\s+|non[\s_-]*)compliant(?:ly)?|(?:does\s+not|did\s+not|do\s+not|not)\s+compl(?:y|ies|ied|ying)|(?:no|without(?:\s+any)?)\s+compliance)\b/giu,
  },
  {
    anchor: "material:biometric:negative",
    pattern:
      /\b(?:(?:not\s+|non[\s_-]*)biometric(?:s|ally)?|(?:no|without(?:\s+any)?)\s+biometrics?)\b/giu,
  },
  {
    anchor: "material:consent:negative",
    pattern:
      /\b(?:(?:does\s+not|did\s+not|do\s+not|not)\s+(?:(?:capture|collect|obtain|request|require)\s+)?consent(?:ed|ing|s)?|(?:no|without(?:\s+any)?)\s+consent)\b/giu,
  },
  {
    anchor: "material:discrimination:negative",
    pattern:
      /\b(?:(?:does\s+not|did\s+not|do\s+not|not)\s+discriminat(?:e|ed|es|ing|ion)|(?:no|without(?:\s+any)?)\s+discrimination)\b/giu,
  },
  {
    anchor: "material:encryption:negative",
    pattern:
      /\b(?:(?:not\s+|un[\s_-]*)encrypt(?:ed|ing)?|(?:no|without(?:\s+any)?)\s+encryption)\b/giu,
  },
  {
    anchor: "material:fairness:negative",
    pattern: /\b(?:not\s+fair|(?:no|without(?:\s+any)?)\s+fairness)\b/giu,
  },
  {
    anchor: "material:regulation:negative",
    pattern:
      /\b(?:(?:not\s+|un[\s_-]*)regulat(?:ed|ory)|(?:no|without(?:\s+any)?)\s+regulation)\b/giu,
  },
  {
    anchor: "material:surveillance:negative",
    pattern:
      /\b(?:not\s+(?:(?:conduct|perform|use)\s+)?surveill(?:ed|ing|ance)|(?:no|without(?:\s+any)?)\s+surveillance)\b/giu,
  },
  {
    anchor: "material:growth:negative",
    pattern:
      /\b(?:not\s+(?:grow(?:ing|n|s)?|growth)|(?:no|without(?:\s+any)?)\s+growth)\b/giu,
  },
  {
    anchor: "material:demand:negative",
    pattern:
      /\b(?:(?:not\s+|un[\s_-]*)demand(?:ed|ing)?|(?:no|without(?:\s+any)?)\s+demand)\b/giu,
  },
  {
    anchor: "material:profit:negative",
    pattern:
      /\b(?:(?:not\s+|un[\s_-]*)profitable|(?:no|without(?:\s+any)?)\s+profit(?:ability|s)?)\b/giu,
  },
  {
    anchor: "material:delight:negative",
    pattern:
      /\b(?:(?:not\s+|un[\s_-]*)delight(?:ed|ful|ing)|(?:no|without(?:\s+any)?)\s+delight)\b/giu,
  },
  {
    anchor: "material:product-market-fit:negative",
    pattern:
      /\b(?:no|not|without(?:\s+any)?)\s+product[\s\p{Pd}/\u2044\u2212\u2215]+market\s+fit\b/giu,
  },
] as const;

const DOUBLE_NEGATED_MATERIAL_CLAIM_FAMILIES = [
  {
    anchor: "material:safety",
    pattern:
      /\bnot\s+(?:unsafe(?:ly)?|without(?:\s+any)?\s+(?:safety|safeguards?))\b/giu,
  },
  {
    anchor: "material:security",
    pattern:
      /\bnot\s+(?:insecure(?:ly)?|non[\s_-]*secur(?:e|ed|ely)|un[\s_-]*secur(?:e|ed|ely)|without(?:\s+any)?\s+security)\b/giu,
  },
  {
    anchor: "material:legal",
    pattern:
      /\bnot\s+(?:illegal(?:ly)?|unlawful(?:ly)?|without(?:\s+any)?\s+(?:legal(?:ity)?|lawful(?:ness)?))\b/giu,
  },
  {
    anchor: "material:privacy",
    pattern:
      /\bnot\s+(?:non[\s_-]*private(?:ly)?|without(?:\s+any)?\s+privacy)\b/giu,
  },
  {
    anchor: "material:compliance",
    pattern:
      /\bnot\s+(?:non[\s_-]*compliant(?:ly)?|without(?:\s+any)?\s+compliance)\b/giu,
  },
  {
    anchor: "material:biometric",
    pattern:
      /\bnot\s+(?:non[\s_-]*biometric(?:s|ally)?|without(?:\s+any)?\s+biometrics?)\b/giu,
  },
  {
    anchor: "material:consent",
    pattern: /\bnot\s+without(?:\s+any)?\s+consent\b/giu,
  },
  {
    anchor: "material:discrimination",
    pattern: /\bnot\s+without(?:\s+any)?\s+discrimination\b/giu,
  },
  {
    anchor: "material:encryption",
    pattern:
      /\bnot\s+(?:un[\s_-]*encrypt(?:ed|ing)|without(?:\s+any)?\s+encryption)\b/giu,
  },
  {
    anchor: "material:fairness",
    pattern: /\bnot\s+(?:unfair(?:ly)?|without(?:\s+any)?\s+fairness)\b/giu,
  },
  {
    anchor: "material:regulation",
    pattern:
      /\bnot\s+(?:un[\s_-]*regulat(?:ed|ory)|without(?:\s+any)?\s+regulation)\b/giu,
  },
  {
    anchor: "material:surveillance",
    pattern: /\bnot\s+without(?:\s+any)?\s+surveillance\b/giu,
  },
  {
    anchor: "material:growth",
    pattern: /\bnot\s+without(?:\s+any)?\s+growth\b/giu,
  },
  {
    anchor: "material:demand",
    pattern:
      /\bnot\s+(?:un[\s_-]*demand(?:ed|ing)?|without(?:\s+any)?\s+demand)\b/giu,
  },
  {
    anchor: "material:profit",
    pattern:
      /\bnot\s+(?:un[\s_-]*profitable|without(?:\s+any)?\s+profit(?:ability|s)?)\b/giu,
  },
  {
    anchor: "material:delight",
    pattern:
      /\bnot\s+(?:un[\s_-]*delight(?:ed|ful|ing)|without(?:\s+any)?\s+delight)\b/giu,
  },
  {
    anchor: "material:product-market-fit",
    pattern:
      /\bnot\s+without(?:\s+any)?\s+product[\s\p{Pd}/\u2044\u2212\u2215]+market\s+fit\b/giu,
  },
] as const;

const MATERIAL_ACTION_ASSERTION_FAMILIES = [
  {
    anchor: "material:security",
    pattern:
      /\bsecur(?:e|ed|es|ing)\s+(?:(?:customer|personal|private|sensitive|user)\s+){0,2}(?:data|information|records?)\b/giu,
  },
  {
    anchor: "material:encryption",
    pattern:
      /\bencrypt(?:ed|ing|s)?\s+(?:(?:customer|personal|private|sensitive|user)\s+){0,2}(?:data|information|records?)\b/giu,
  },
  {
    anchor: "material:compliance",
    pattern: /\bcompl(?:y|ied|ies|ying)\s+(?:to|with)\b/giu,
  },
  {
    anchor: "material:privacy",
    pattern:
      /\b(?:preserv(?:e|ed|es|ing)|protect(?:ed|ing|s)?|safeguard(?:ed|ing|s)?)\s+(?:\p{L}[\p{L}-]*\s+){0,2}privacy\b/giu,
  },
] as const;

const MATERIAL_ACTION_NON_SUBJECT_HEAD_PATTERN =
  /^(?:address(?:ed|es|ing)?|allow(?:ed|s|ing)?|am|are|articulat(?:ed|es|ing)?|ask(?:ed|s|ing)?|be|been|being|can|caus(?:e|ed|es|ing)?|cho(?:ose|oses|osing|se)|compar(?:ed|es|ing)?|could|defin(?:e|ed|es|ing)?|did|discuss(?:ed|es|ing)?|do|does|enabl(?:e|ed|es|ing)?|establish(?:ed|es|ing)?|explain(?:ed|s|ing)?|had|has|have|help(?:ed|s|ing)?|identif(?:ied|ies|y|ying)|implement(?:ed|s|ing)?|includ(?:e|ed|es|ing)?|is|let(?:s|ting)?|mak(?:e|es|ing)|may|measur(?:e|ed|es|ing)?|mention(?:ed|s|ing)?|might|must|nam(?:e|ed|es|ing)?|outlin(?:e|ed|es|ing)?|present(?:ed|s|ing)?|prioriti[sz](?:e|ed|es|ing)?|prompt(?:ed|s|ing)?|provid(?:e|ed|es|ing)?|recommend(?:ed|s|ing)?|requir(?:e|ed|es|ing)?|select(?:ed|s|ing)?|set(?:s|ting)?|should|specif(?:ied|ies|y|ying)|stat(?:e|ed|es|ing)?|tell(?:ing|s|told)|test(?:ed|s|ing)?|track(?:ed|s|ing)?|us(?:e|ed|es|ing)|validat(?:e|ed|es|ing)?|was|were|will|would)$/iu;
const MATERIAL_ACTION_NON_SUBJECT_BOUNDARY_PATTERN =
  /^(?:a|an|and|as|at|by|for|from|he|her|hers|him|his|i|in|into|it|its|me|mine|my|of|on|or|our|ours|she|that|the|their|theirs|them|they|this|to|us|we|which|who|whose|with|you|your|yours)$/iu;
const MATERIAL_ACTION_COMMON_SUBJECT_HEAD_PATTERN =
  /^(?:app|application|business|candidate|company|engineering|group|launch|model|organization|organisation|pipeline|platform|product|program|service|system|team|workflow)$/iu;

const MATERIAL_PASSIVE_ACTION_ASSERTION_FAMILIES = [
  {
    anchor: "material:security",
    pattern:
      /\b(?:(?:customer|personal|private|sensitive|user)\s+){0,2}(?:data|information|records?)\s+(?:(?:can|could|may|might|must|should|will|would)\s+(?:be|have\s+been)|(?:am|are|is|was|were)\s+(?:being\s+)?|(?:had|has|have)\s+been\s+)secur(?:e|ed)\b/giu,
    actionPattern: /\bsecur(?:e|ed)\b/iu,
  },
  {
    anchor: "material:encryption",
    pattern:
      /\b(?:(?:customer|personal|private|sensitive|user)\s+){0,2}(?:data|information|records?)\s+(?:(?:can|could|may|might|must|should|will|would)\s+(?:be|have\s+been)|(?:am|are|is|was|were)\s+(?:being\s+)?|(?:had|has|have)\s+been\s+)encrypted\b/giu,
    actionPattern: /\bencrypted\b/iu,
  },
  {
    anchor: "material:compliance",
    pattern:
      /\b(?:privacy\s+)?regulation\s+(?:(?:can|could|may|might|must|should|will|would)\s+(?:be|have\s+been)|(?:am|are|is|was|were)\s+(?:being\s+)?|(?:had|has|have)\s+been\s+)complied\s+with\b/giu,
    actionPattern: /\bcomplied\b/iu,
  },
  {
    anchor: "material:privacy",
    pattern:
      /\b(?:\p{L}[\p{L}-]*\s+){0,2}privacy\s+(?:(?:can|could|may|might|must|should|will|would)\s+(?:be|have\s+been)|(?:am|are|is|was|were)\s+(?:being\s+)?|(?:had|has|have)\s+been\s+)(?:preserved|protected|safeguarded)\b/giu,
    actionPattern: /\b(?:preserved|protected|safeguarded)\b/iu,
  },
] as const;

function hasBoundedMaterialActionSubject(
  text: string,
  assertionStart: number
): boolean {
  const clausePrefix = text
    .slice(0, assertionStart)
    .split(/[.!?;,:()\n\u2026\u2013\u2014]+/u)
    .at(-1)
    ?.trim();
  if (!clausePrefix) return false;

  const subjectTokens = [...clausePrefix.matchAll(/[\p{L}\p{N}_-]+/gu)].map(
    (match) => ({ raw: match[0], normalized: match[0].toLowerCase() })
  );
  while (
    subjectTokens.length > 0 &&
    /ly$/u.test(subjectTokens.at(-1)?.normalized ?? "")
  ) {
    subjectTokens.pop();
  }
  if (subjectTokens.length === 0) return false;

  if (
    subjectTokens.length === 1 &&
    /^(?:he|i|it|she|they|we|you)$/u.test(subjectTokens[0].normalized)
  ) {
    return true;
  }

  const startsWithDeterminer = /^(?:a|an|my|our|that|the|their|this)$/u.test(
    subjectTokens[0].normalized
  );
  const subjectHead = subjectTokens.at(-1);
  if (
    !subjectHead ||
    MATERIAL_ACTION_NON_SUBJECT_HEAD_PATTERN.test(subjectHead.normalized) ||
    MATERIAL_ACTION_NON_SUBJECT_BOUNDARY_PATTERN.test(subjectHead.normalized)
  ) {
    return false;
  }

  const hasNounLikeHead =
    /^\p{Lu}/u.test(subjectHead.raw) ||
    /s$/u.test(subjectHead.normalized) ||
    MATERIAL_ACTION_COMMON_SUBJECT_HEAD_PATTERN.test(subjectHead.normalized);
  if (startsWithDeterminer) {
    return subjectTokens.length >= 2 && hasNounLikeHead;
  }

  const hasCoordinator = subjectTokens.some((token) =>
    /^(?:and|or)$/u.test(token.normalized)
  );
  const startsWithProperNoun = /^\p{Lu}/u.test(subjectTokens[0].raw);
  return (
    hasNounLikeHead &&
    (subjectTokens.length === 1 || hasCoordinator || startsWithProperNoun)
  );
}

function addMaterialActionAssertionAnchors(
  anchors: Set<string>,
  text: string
): void {
  for (const family of MATERIAL_ACTION_ASSERTION_FAMILIES) {
    for (const match of text.matchAll(family.pattern)) {
      const assertionStart = match.index ?? 0;
      const assertionMode = getLocalAssertionMode(text, assertionStart);
      if (
        assertionMode === "asserted" &&
        !hasBoundedMaterialActionSubject(text, assertionStart)
      ) {
        continue;
      }
      anchors.add(`${family.anchor}:action-${assertionMode}`);
    }
  }
  for (const family of MATERIAL_PASSIVE_ACTION_ASSERTION_FAMILIES) {
    for (const match of text.matchAll(family.pattern)) {
      const actionOffset = match[0].search(family.actionPattern);
      if (actionOffset < 0) continue;
      const assertionStart = (match.index ?? 0) + actionOffset;
      const assertionMode = getLocalAssertionMode(text, assertionStart);
      anchors.add(`${family.anchor}:action-${assertionMode}`);
    }
  }
}

function normalizeMaterialNegationContractions(text: string): string {
  return text.replace(
    /\b(?:(?:aren|couldn|didn|doesn|don|hadn|hasn|haven|isn|shouldn|wasn|weren|won|wouldn)['’]?t|can['’]?t|cannot)\b/giu,
    "not"
  );
}

function normalizeAssertionContractions(text: string): string {
  return text.replace(
    /\b(?:(?:aren|couldn|didn|doesn|don|hadn|hasn|haven|isn|shouldn|wasn|weren|won|wouldn)['’]?t|can['’]?t|cannot)\b/giu,
    (contraction) => "not".padEnd(contraction.length)
  );
}

type AssertionMode = "asserted" | "negated" | "hypothetical";

function getLocalAssertionMode(
  text: string,
  assertionStart: number
): AssertionMode {
  const prefix = normalizeAssertionContractions(
    text.slice(Math.max(0, assertionStart - 80), assertionStart)
  ).toLocaleLowerCase("en-US");
  const modePrefix = prefix.replace(/\bnot\s+only\s*$/u, "");
  if (
    /\b(?:(?:decid(?:e|ed|es|ing)|intend(?:ed|s|ing)?)(?:\s+[\p{L}\p{N}_-]+){0,4}\s+not\s+to|(?:am|are|is|was|were)\s+unable\s+to|(?:do|does|did)\s+not\s+(?:get\s+to|manage\s+to|cause(?:\s+[\p{L}\p{N}_-]+){0,4}\s+to)|never|fail(?:ed|s)?\s+to|refus(?:e|ed|es|ing)\s+to|avoid(?:ed|s|ing)?|(?:(?:do|does|did|is|are|was|were|has|have|had|can|could|would|should|will)\s+)?not(?:\s+(?:be|have(?:\s+been)?))?)\s+(?:\p{L}+ly\s+){0,2}$/u.test(
      modePrefix
    )
  ) {
    return "negated";
  }
  if (
    /\b(?:(?:can|will|would|could|should|might|may|must)(?:\s+(?:be|have(?:\s+been)?))?|(?:am|are|is|was|were)\s+(?:going|scheduled|supposed)\s+to|consider(?:ed|s|ing)?|(?:aim(?:ed|s|ing)?|attempt(?:ed|s|ing)?|decid(?:e|ed|es|ing)|expect(?:ed|s|ing)?|hop(?:e|ed|es|ing)|intend(?:ed|s|ing)?|plan(?:ned|s|ning)?|propos(?:e|ed|es|ing)|seek(?:ing|s)?|sought|tr(?:ied|ies|y|ying)|want(?:ed|s|ing)?)(?:\s+[\p{L}\p{N}_-]+){0,4}\s+to)\s+(?:\p{L}+ly\s+){0,2}$/u.test(
      modePrefix
    )
  ) {
    return "hypothetical";
  }
  return "asserted";
}

function removePositiveNonAdverseNegations(text: string): string {
  return normalizeAssertionContractions(text)
    .replace(/\bnot\s+only\b/giu, " ")
    .replace(/\bnot\s+undefined\b/giu, " ");
}

function removePositiveMaterialDoubleNegations(text: string): string {
  let projection = normalizeMaterialNegationContractions(
    text.normalize("NFKC")
  );
  for (const family of DOUBLE_NEGATED_MATERIAL_CLAIM_FAMILIES) {
    projection = projection.replace(family.pattern, (...args) => {
      const match = args[0] as string;
      const offset = args.at(-2) as number;
      const source = args.at(-1) as string;
      return isFollowedByAdverseMaterialHead(source, offset + match.length)
        ? match
        : " ";
    });
  }
  return projection;
}

function isFollowedByAdverseMaterialHead(
  text: string,
  offset: number
): boolean {
  return /^(?:\s+(?:apparent|critical|dangerous|known|major|material|meaningful|notable|obvious|serious|severe|significant|substantial|unresolved)){0,2}\s+(?:concerns?|defects?|deficienc(?:y|ies)|exposures?|failures?|flaws?|gaps?|hazards?|holes?|issues?|liabilit(?:y|ies)|problems?|risks?|shortcomings?|threats?|vulnerabilit(?:y|ies)|weakness(?:es)?)\b/iu.test(
    text.slice(offset, offset + 64)
  );
}

function isPredominantlyCompactLanguage(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  const compactLetters = letters.filter((letter) =>
    COMPACT_EVIDENCE_GRAPHEME_PATTERN.test(letter)
  ).length;
  return compactLetters >= 4 && compactLetters / letters.length >= 0.6;
}

const POSITIVE_TARGET_PREDICATE_SOURCE = String.raw`(?:address(?:ed|es|ing)|articulat(?:ed|es|ing)|cho(?:oses|osing|se)|compar(?:ed|es|ing)|defin(?:ed|es|ing)|discuss(?:ed|es|ing)|establish(?:ed|es|ing)|explain(?:ed|s|ing)|identif(?:ied|ies|ying)|implement(?:ed|s|ing)|includ(?:ed|es|ing)|measur(?:ed|es|ing)|mention(?:ed|s|ing)|nam(?:ed|es|ing)|outlin(?:ed|es|ing)|prioriti[sz](?:ed|es|ing)|provid(?:ed|es|ing)|select(?:ed|s|ing)|set(?:s|ting)?|specif(?:ied|ies|ying)|stat(?:ed|es|ing)|test(?:ed|s|ing)|track(?:ed|s|ing)|us(?:e|ed|es|ing)|validat(?:ed|es|ing))`;
const POSITIVE_TARGET_GERUND_SOURCE = String.raw`(?:addressing|choosing|comparing|defining|discussing|identifying|including|measuring|mentioning|naming|prioritizing|prioritising|providing|specifying|stating|testing|validating)`;
const GENERIC_COORDINATED_POSITIVE_PREDICATE_SOURCE = String.raw`(?:\p{L}{3,}(?:ed|en)|built|found|made|ran|wrote)\s+(?:(?:(?:her|him|me|them|us|you)|\p{L}{3,})\s+with\s+)?(?:a|an|my|our|the|their|this|that)`;
const GENERIC_COORDINATED_EXPLICIT_FINITE_PREDICATE_SOURCE = String.raw`(?:(?:i|they|we|you)\s+(?:build|calculate|run)|(?:he|it|she)\s+(?:builds|calculates|runs))\s+(?:a|an|my|our|the|their|this|that)`;
const TARGET_CLAUSE_BOUNDARY = new RegExp(
  String.raw`[.!?;,:()\n\u2026]+|[\u2013\u2014]+|\s+-\s+|(?:\/\s+|\s+\/)|\b(?:although|but|however|while|yet)\b|\b(?:and|or)(?:\s+then)?\s+(?=(?:(?:he|i|it|she|they|we|you)\s+)?${POSITIVE_TARGET_PREDICATE_SOURCE}\b)|\b(?:and|or)(?:\s+then)?\s+(?=(?:(?:he|i|it|she|they|we|you)\s+)?${GENERIC_COORDINATED_POSITIVE_PREDICATE_SOURCE}\b)|\b(?:and|or)(?:\s+then)?\s+(?=${GENERIC_COORDINATED_EXPLICIT_FINITE_PREDICATE_SOURCE}\b)|\b(?:after|before)\s+(?=${POSITIVE_TARGET_GERUND_SOURCE}\b)|\b(?:later|subsequently|then)\s+(?=(?:(?:he|i|it|she|they|we|you)\s+)?${POSITIVE_TARGET_PREDICATE_SOURCE}\b)`,
  "iu"
);

function hasPositiveTargetClause(
  sourceText: string,
  negativeTargets: ReadonlySet<string>
): boolean {
  const clauses = sourceText.split(TARGET_CLAUSE_BOUNDARY);
  return clauses.some((clause) => {
    if (
      containsAdverseClaim(clause) ||
      NEGATIVE_MATERIAL_POLARITY_PATTERN.test(clause)
    ) {
      return false;
    }
    return setsIntersect(negativeTargets, getObservableSupportAnchors(clause));
  });
}

const SUMMARY_OUTCOME_PATTERNS = [
  /\b(?:(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:should|must|would|will)\s+)?(?:be\s+)?hired|hire\s+(?:the|this)\s+(?:applicant|candidate)|recommend(?:s|ed|ing)?\s+(?:that\s+)?(?:hire|hiring)|(?:strong|definite|clear|leaning)\s+(?:hire|no[-\s]?hire))\b/iu,
  /\b(?:(?:applicant|candidate|interviewee|they|he|she)\s+(?:deserv(?:e|es|ed|ing)|merit(?:s|ed|ing)?|warrant(?:s|ed|ing)?)\s+(?:an?\s+)?offer(?!\s+(?:design|experiment|package|pricing|structure|test)\b)|recommend(?:s|ed|ing)?\s+(?:an?\s+)?offer(?=\s*(?:[.!?]|$)))\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:must|should|will|would)\s+|ought\s+to\s+)?(?:earn(?:ed|ing|s)?|receiv(?:e|ed|es|ing))\s+(?:an?\s+)?offer(?!\s+(?:design|experiment|package|pricing|structure|test)\b)/iu,
  /\b(?:an?\s+)?offer\s+(?:(?:is|was)|(?:must|should|will|would)\s+be)\s+(?:appropriate|recommended|warranted)\s+for\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\b/iu,
  /\b(?:extend(?:ed|ing|s)?|support(?:ed|ing|s)?\s+extend(?:ing)?)\s+(?:an?\s+)?offer\s+to\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\b/iu,
  /\b(?:(?:applicant|candidate|interviewee|they|he|she)\s+(?:is|was|appears?|seems?|looks?)\s+(?:interview[-\s]?)?ready|(?:applicant|candidate|answer|response|performance)\s+(?:demonstrates?|shows?)\s+(?:interview[-\s]?)?readiness|ready\s+(?:for|to)\s+(?:the\s+)?(?:interview|role|job|advance|move))\b/iu,
  /\b(?:(?:candidate|answer|response|performance|they|he|she)\s+(?:has\s+)?(?:passes|passed|fails|failed)\b|(?:candidate|they|he|she)\s+(?:should|must|would|will)\s+(?:pass|fail)\b|(?:pass|fail)(?:ed|ing)?\s+(?:the\s+)?(?:candidate|interview|assessment|evaluation)\b)/iu,
  /\b(?:meet|meets|met|clear|clears|cleared|exceed|exceeds|exceeded)\s+(?:the\s+)?(?:hiring|interview)\s+bar\b/iu,
  /\b(?:(?:applicant|candidate|interviewee|they|he|she)\s+(?:should|must|would|will)\s+(?:(?:advance|move\s+forward|proceed)\s+(?:to|in|into|through)\s+(?:the\s+)?(?:next\s+(?:round|stage)|interview\s+process|another\s+round))|recommend(?:s|ed|ing)?\s+(?:that\s+)?(?:mov(?:e|ing)|advanc(?:e|ing))\s+(?:the|this)\s+(?:applicant|candidate)\s+forward|(?:definite|clear|strong)\s+(?:yes|no)\s+for\s+(?:the|this)\s+(?:applicant|candidate))\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:must|should|will|would)\s+|ought\s+to\s+)?(?:advanc(?:e|ed|es|ing)|go(?:es|ing)?|move(?:d|s|ing)?\s+forward|proceed(?:ed|ing|s)?|went)\s+(?:in|into|through|to)\s+(?:the\s+)?(?:another\s+round|interview\s+process|next\s+(?:round|stage))\b/iu,
  /\b(?:mov(?:e|ed|es|ing)|send|sending|sends|sent)\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\s+(?:in|into|through|to)\s+(?:the\s+)?(?:another\s+round|interview\s+process|next\s+(?:round|stage))\b/iu,
  /\brecommend(?:s|ed|ing)?\s+(?:that\s+)?(?:advanc(?:e|ing)|mov(?:e|ing)|send(?:ing)?)\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)(?:\s+forward)?\b/iu,
  /\b(?:(?:(?:i|we|they|he|she)\s+(?:(?:should|must|would|will)\s+)?)?(?:give|gave|giving)\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\s+(?:an?\s+)?offer)\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:must|should|will|would)\s+|ought\s+to\s+)?(?:get|gets|getting|got)\s+(?:an?\s+)?offer(?!\s+(?:design|experiment|package|pricing|structure|test)\b)/iu,
  /\b(?:(?:(?:i|we|they|he|she)\s+(?:(?:should|must|would|will)\s+)?)?(?:make|makes|making|made)\s+(?:an?\s+)?offer\s+to\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee))\b/iu,
  /\b(?:applicant|candidate|interviewee)\s+(?:(?:is|was|appears?|seems?)\s+)?hireable\b|\b(?:applicant|candidate|interviewee)\s+hireability\b/iu,
  /\b(?:bring|bringing|brings|brought)\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\s+on[\s-]?site\b/iu,
  /\binvit(?:e|ed|es|ing)\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\s+(?:back\s+)?on[\s-]?site\b/iu,
  /\b(?:applicant|candidate|interviewee)\s+(?:deserv(?:e|es|ed|ing)|merit(?:s|ed|ing)?|warrant(?:s|ed|ing)?)\s+(?:mov(?:e|ing)|advanc(?:e|ing)|proceed(?:ing)?)\s+on\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:deserv(?:e|es|ed|ing)|merit(?:s|ed|ing)?|warrant(?:s|ed|ing)?)\s+(?:(?:an?|the|this)\s+)?(?:job|position|role)\b/iu,
  /\bgreen[\s-]?light(?:ed|ing|s)?\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\b/iu,
  /\b(?:(?:mak(?:e|es|ing)|render(?:ed|ing|s)?)\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\s+employable|(?:applicant|candidate|interviewee)\s+(?:becomes?|is|was)\s+employable)\b/iu,
  /\b(?:advance|move)\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)(?:\s+forward)?(?=\s*(?:[.!?;]|$))/iu,
  /\b(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\s+(?:belongs?\s+(?:in|on|to|with)\s+|(?:is|appears?|looks?|seems?)\s+(?:(?:like\s+)?(?:(?:an?|the)\s+)?(?:(?:clear|excellent|good|great|natural|strong)\s+)?fit\s+(?:for|in|on|to|with)\s+|suitable\s+(?:for|to)\s+)|fits?\s+(?:(?:well\s+)?(?:in|on|to|with)\s+)?)(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\b/iu,
  /\b(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee|they|he|she|you|we|i)\s+(?:(?:(?:has|had)\s+been|(?:am|are|is|was|were|will\s+be|would\s+be|should\s+be|must\s+be)|got)\s+)?(?:selected|chosen)\s+for\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\b/iu,
  /\b(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee|they|he|she|you|we|i)\s+(?:(?:(?:am|appear(?:ed|s)?|are|as|be|became|becomes|been|being|confirm(?:ed|s)?|got|had|has|have|having|is|must|never|not|report(?:ed|s)?|should|to|was|were|will|would)|(?:\p{L}+ly))\s+){1,10}(?:selected|chosen)\s+for\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\b/iu,
  /\b(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\s+(?:(?:(?:did|does|has|had|is|was)\s+)?(?:not\s+|never\s+)?(?:appear(?:ed|s)?|confirm(?:ed|s)?|report(?:ed|s)?)\s+(?:not\s+|never\s+)?(?:(?:as|reportedly)\s+|to\s+(?:(?:have\s+been|be)\s+)?)?)(?:selected|chosen)\s+for\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\b/iu,
  /\b(?:choose|chooses|choosing|chose|chosen|select|selects|selecting|selected)\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee|them|him|her|you|us|me)\s+for\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\b/iu,
  /\b(?:selected|chosen)\s+for\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\s*[,;:\u2013\u2014-]\s*(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee|they|he|she|you|we|i)\b/iu,
  /\b(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\s+(?:(?:is|was|were)\s+among\s+those|(?:end(?:ed|s)?\s+up)|(?:emerg(?:e|ed|es)\s+as\s+(?:(?:the|that)\s+)?one)|(?:rank(?:ed|s)?\s+among\s+those)|(?:join(?:ed|s)?\s+(?:(?:the|those)\s+)?(?:group|people)))\s+(?:selected|chosen)\s+for\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\b/iu,
  /\b(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)(?:['’]s|s)?\s+(?:\p{L}+\s+){0,2}(?:choice|selection)\s+for\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\b/iu,
  /\b(?:choice|selection)\s+of\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\s+for\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\b/iu,
  /\b(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\s+selection\s+(?:fell|falls?|landed|lands?|went)\s+on\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\b/iu,
  /\b(?:choice|selection)\s+for\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\s+(?:(?:(?:did|does|has|had|is|was)\s+)?(?:not\s+|never\s+)?(?:(?:confirm(?:ed|s)?|report(?:ed|s)?)\s+(?:not\s+|never\s+)?(?:as\s+|to\s+(?:have\s+)?))?)(?:(?:\p{L}+ly)\s+){0,2}(?:fall|falls|fell|go|goes|gone|land|landed|lands|went)\s+(?:on|to)\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\b/iu,
  /\b(?:choice|selection)\s+for\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\s+(?:(?:is|was)\s+)?(?:not\s+|never\s+)?(?:confirmed|reported)\s+(?:as|to\s+be)\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee)\b/iu,
  /\b(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:has|had)\s+)?(?:got|gets?|getting)\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role)\b/iu,
  /\b(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee|they|he|she)\s+(?:has\s+|had\s+)?(?:land(?:ed|s|ing)?|secur(?:e|ed|es|ing))\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role)\b/iu,
  /\b(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee|they|he|she)\s+(?:has\s+|had\s+)?land(?:ed|s|ing)?\s+(?:an?|the)\s+offer\b/iu,
  /\b(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee|they|he|she)\s+(?:has\s+|had\s+)?accept(?:ed|ing|s)?\s+(?!(?:(?:a|an|our|that|the|their|this)\s+)?(?:(?:design|discount(?:ed)?|experiment|package|pricing|product|segment|structure|test)\s+){1,2}offer\b)(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,2}offer\b/iu,
  /\b(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee|they|he|she|you|we|i)\s+(?:(?:(?:has|had)\s+been|(?:am|are|is|was|were|will\s+be|would\s+be|should\s+be|must\s+be)|got)\s+)?pick(?:ed|s|ing)?\s+for\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role|team)\b/iu,
  /\b(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role)\s+(?:ended\s+up|fell|landed|went)\s+(?:on|to|with)\s+(?:(?:the|this)\s+)?(?:applicant|candidate|interviewee|them|him|her|you|us|me)\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:got|gets?|getting)\s+hired\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:has|had)\s+been|(?:is|was|were))\s+offered\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role)\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:clinch(?:ed|es|ing)|win(?:s|ning)?|won)\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role)\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:sign(?:ed|ing|s)?|take|takes|taking|took)\s+(?!(?:(?:a|an|our|that|the|their|this)\s+)?(?:(?:design|discount(?:ed)?|experiment|package|pricing|product|segment|structure|test)\s+){1,2}offer\b)(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,2}offer\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:join(?:ed|ing|s)?|start(?:ed|ing|s)?(?:\s+(?:(?:next|this)\s+(?:month|quarter|week|year)|on\s+\p{L}+))?)\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,2}(?:company|employer|organization|organisation)\s+as\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:manager|pm|position|role)\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+start(?:ed|ing|s)?\s+(?:(?:(?:next|this)\s+(?:month|quarter|week|year)|on\s+\p{L}+)\s+)?as\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:manager|pm|position|role)\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:has|had|is|was|were)\s+)?(?:advanc(?:e|ed|es|ing)|mov(?:e|ed|es|ing))\s+(?:in|into|through|to)\s+(?:the\s+)?(?:another\s+round|interview\s+process|next\s+(?:interview\s+)?(?:round|stage))\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:has|had)\s+|(?:is|was|were)\s+)?(?:made|make|makes|making)\s+it\s+(?:in|into|through|to)\s+(?:the\s+)?(?:another\s+round|interview\s+process|next\s+(?:interview\s+)?(?:round|stage))\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:is|was|were)\s+)?through\s+to\s+(?:the\s+)?(?:another\s+round|next\s+(?:interview\s+)?(?:round|stage))\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:became|(?:is|was)\s+now)\s+(?:(?:a|an|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:manager|pm)\s+(?:at|with)\s+(?:(?:a|an|the)\s+)?[\p{L}\p{N}&.'-]+\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:has\s+|had\s+)?receiv(?:e|ed|es|ing)\s+(?:(?:a|an|the)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:job|position|role)(?:\s+(?:at|from|with)\s+(?:[\p{L}\p{N}&.'-]+\s*){1,4})?(?=\s*(?:[.!?;]|$))/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:has\s+|had\s+)?receiv(?:e|ed|es|ing)\s+(?:(?:a|an|the)\s+)?(?:(?:employment|job|pm|product\s+manager)\s+)?offer(?:\s+(?:at|from|with)\s+(?:[\p{L}\p{N}&.'-]+\s*){1,4})?(?=\s*(?:[.!?;]|$))/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:will|would|should|must|may|might|can|could)\s+|(?:is|are|was|were)\s+)?join(?:ed|ing|s)?\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,2}(?:company|employer|organization|organisation)\s+as\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:manager|pm|position|role)\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:has|had|is|was|were)\s+)?(?:mov(?:e|ed|es|ing)\s+on|progress(?:ed|es|ing)?)\s+to\s+(?:the\s+)?(?:final|next)\s+(?:interview\s+)?(?:round|stage)\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:has\s+|had\s+)?clear(?:ed|ing|s)?\s+(?:the\s+)?final\s+interview\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:will|would|should|must|may|might|can|could)\s+|(?:is|are|was|were)\s+)?join(?:ed|ing|s)?\s+(?:[\p{L}\p{N}&.'-]+\s+){1,4}as\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:manager|pm|position|role)\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:will|would|should|must|may|might|can|could)\s+)?start(?:ed|ing|s)?\s+(?:(?:(?:next|this)\s+(?:month|quarter|week|year)|on\s+\p{L}+)\s+)?as\s+(?:(?:a|an|our|that|the|their|this)\s+)?(?:[\p{L}\p{N}&.'-]+\s+){0,3}(?:manager|pm|position|role)\b/iu,
  /\b(?:applicant|candidate|interviewee|they|he|she)\s+(?:(?:has|had|is|was|were)\s+)?(?:advanc(?:e|ed|es|ing)|progress(?:ed|es|ing)?|reach(?:ed|es|ing)?|qualif(?:ied|ies|ying)|mov(?:e|ed|es|ing)\s+on)\s+(?:(?:in|into|through|to|for)\s+)?(?:the\s+)?(?:final|next)\s+(?:interview\s+)?(?:round|stage)\b/iu,
] as const;

const SUMMARY_UNSUPPORTED_ABSOLUTE_PATTERNS = [
  /\b(?:flawless|flawlessly|perfect|perfectly)\b/iu,
  /\b(?:no|zero|without\s+any)\s+(?:(?:meaningful|material|notable|apparent|significant)\s+)?(?:weakness(?:es)?|gaps?|shortcomings?|areas?\s+(?:for|of)\s+improvement)\b/iu,
  /\bonly\s+(?:(?:shows?|showed|has|had|demonstrates?|demonstrated)\s+)?strengths?\b|\bstrengths?\s+only\b/iu,
  /\b(?:all|every)\s+(?:dimension|area)\b/iu,
] as const;

const SUMMARY_META_SIGNAL_STEMS = new Set(
  [
    "available",
    "advance",
    "analysis",
    "by",
    "conclusion",
    "conclusions",
    "clearer",
    "evidence",
    "feedback",
    "fixture",
    "finding",
    "findings",
    "forward",
    "grounded",
    "limited",
    "overall",
    "portion",
    "proceed",
    "reasoned",
    "reasoning",
    "recorded",
    "summary",
    "should",
    "move",
    "next",
    "above",
  ].map((token) => {
    const stem = getSupportStem(token);
    return SUPPORT_CONCEPT_BY_STEM.get(stem) ?? stem;
  })
);

function requireEvidenceLimitedSummary(
  summary: string,
  findings: readonly FeedbackV2Item[]
): void {
  const normalized = summary
    .normalize("NFKC")
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "");
  if (SUMMARY_OUTCOME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new FeedbackV2ParseError(
      "summary must not make hiring, readiness, pass/fail, or hiring-bar claims"
    );
  }
  if (
    SUMMARY_UNSUPPORTED_ABSOLUTE_PATTERNS.some((pattern) =>
      pattern.test(normalized)
    )
  ) {
    throw new FeedbackV2ParseError(
      "summary must not make unsupported evaluative absolute claims"
    );
  }

  const evidenceText = findings
    .flatMap((finding) => finding.evidence.map((entry) => entry.quote))
    .join(" ");
  const groundedFindingText = findings
    .flatMap((finding) => [
      finding.observation,
      ...finding.evidence.map((entry) => entry.quote),
    ])
    .join(" ");
  const coachingText = findings.map((finding) => finding.nextStep).join(" ");
  const claimedQuantities = getQuantitativeAnchors(normalized);
  const groundedQuantities = getQuantitativeAnchors(evidenceText);
  if (
    ![...claimedQuantities].every((anchor) => groundedQuantities.has(anchor))
  ) {
    throw new FeedbackV2ParseError(
      "summary contains a quantitative claim absent from grounded findings"
    );
  }

  const criticalClaims = getCriticalClaimAnchors(normalized);
  const criticalEvidence = getCriticalClaimAnchors(evidenceText);
  if (![...criticalClaims].every((anchor) => criticalEvidence.has(anchor))) {
    throw new FeedbackV2ParseError(
      "summary contains a material claim absent from grounded findings"
    );
  }
  const directionalClaims = getDirectionalClaimAnchors(normalized);
  const groundedDirectionalClaims = getIndividualDirectionalClaimAnchors(
    findings.flatMap((finding) => finding.evidence)
  );
  if (
    ![...directionalClaims].every((anchor) =>
      groundedDirectionalClaims.has(anchor)
    )
  ) {
    throw new FeedbackV2ParseError(
      "summary contains a directional claim absent from an individual exact evidence quote"
    );
  }

  const groundedFindingSignals =
    getObservableSupportAnchors(groundedFindingText);
  const coachingSignals = new Set([
    ...groundedFindingSignals,
    ...getObservableSupportAnchors(coachingText),
  ]);
  const summarySignals = getEvidenceLimitedSummarySignals(normalized);
  const summaryStatements = splitSummaryFactualUnits(normalized);
  for (const statement of summaryStatements) {
    const statementSignals = getEvidenceLimitedSummarySignals(statement);
    if (statementSignals.size === 0) continue;
    const findingSignals = isSummaryCoachingStatement(statement)
      ? coachingSignals
      : groundedFindingSignals;
    const supportedStatementSignals = countIntersection(
      statementSignals,
      findingSignals
    );
    if (
      supportedStatementSignals < 2 ||
      supportedStatementSignals / statementSignals.size < 0.5
    ) {
      throw new FeedbackV2ParseError(
        "each factual summary statement requires at least two observable supports from grounded findings"
      );
    }
  }

  const supportedSummarySignals = countIntersection(
    summarySignals,
    summaryStatements.some(isSummaryCoachingStatement)
      ? coachingSignals
      : groundedFindingSignals
  );
  if (
    summarySignals.size > 0 &&
    (supportedSummarySignals < 2 ||
      supportedSummarySignals / summarySignals.size < 0.5)
  ) {
    throw new FeedbackV2ParseError(
      "summary requires at least two observable supports from grounded findings"
    );
  }
}

function isSummaryCoachingStatement(text: string): boolean {
  return (
    /\b(?:candidate|he|interviewee|she|they)\s+(?:can|could|should|would)\b/iu.test(
      text
    ) || /\b(?:focused\s+practice|next\s+step|to\s+improve)\b/iu.test(text)
  );
}

function splitSummaryFactualUnits(text: string): string[] {
  const abbreviationPeriod = "\u{10fffd}";
  const protectedText = text.replace(/\b(?:\p{L}\.){2,}/gu, (abbreviation) =>
    abbreviation.replaceAll(".", abbreviationPeriod)
  );
  return protectedText
    .split(
      /(?:[;!?\u0589\u061F\u06D4\u0964\u1362\u2025\u2026\u3002\uFF01\uFF1F]+[ \t]*|(?:(?<!\p{N})\.|\.(?!\p{N}))[ \t]*|[\r\n\u2028\u2029]+)/u
    )
    .map((unit) => unit.replaceAll(abbreviationPeriod, "."));
}

function getEvidenceLimitedSummarySignals(text: string): Set<string> {
  return new Set(
    [...getObservableSupportAnchors(text)].filter(
      (signal) => !SUMMARY_META_SIGNAL_STEMS.has(signal)
    )
  );
}

function countEvidenceLexicalUnits(text: string): number {
  const words = getWordTokens(text);
  const nonCompactWords = words.filter(
    (word) => !COMPACT_EVIDENCE_GRAPHEME_PATTERN.test(word)
  ).length;
  const compactGraphemes = [...text].filter((character) =>
    COMPACT_EVIDENCE_GRAPHEME_PATTERN.test(character)
  ).length;
  return nonCompactWords + Math.ceil(compactGraphemes / 2);
}

function getSupportSignals(text: string): Set<string> {
  const tokens = getWordTokens(text).map((token) =>
    token.toLocaleLowerCase("en-US")
  );
  const stems = new Set<string>();
  for (const token of tokens) {
    if (
      !(/^[a-z]+$/u.test(token)
        ? token.length >= 3
        : [...token].length >= 2 && /\p{L}/u.test(token)) ||
      OBSERVATION_SUPPORT_STOP_WORDS.has(token)
    ) {
      continue;
    }
    const stem = getSupportStem(token);
    stems.add(SUPPORT_CONCEPT_BY_STEM.get(stem) ?? stem);
  }
  return stems;
}

function getObservableSupportAnchors(text: string): Set<string> {
  return new Set([
    ...getSupportSignals(text),
    ...getQuantitativeAnchors(text),
    ...[...getAbsoluteClaimAnchors(text)].map((word) => `absolute:${word}`),
  ]);
}

function containsNegativeClaim(text: string): boolean {
  const matches = NEGATIVE_CLAIM_PATTERN.test(text);
  NEGATIVE_CLAIM_PATTERN.lastIndex = 0;
  return matches;
}

function containsAdverseClaim(text: string): boolean {
  const negativeProjection = removePositiveNonAdverseNegations(
    removePositiveMaterialDoubleNegations(text)
  );
  return (
    containsNegativeClaim(negativeProjection) ||
    ABSENCE_CLAIM_PATTERN.test(negativeProjection) ||
    ADVERSE_LIMITING_ADVERB_PATTERN.test(text) ||
    ADVERSE_DEVOID_PATTERN.test(text) ||
    [...getCriticalClaimAnchors(text)].some(
      (anchor) =>
        anchor.endsWith(":negative") || anchor.endsWith(":negative-polarity")
    ) ||
    [...getDirectionalClaimAnchors(text)].some(
      (anchor) =>
        anchor.endsWith(":negative") ||
        anchor.includes(":negated-") ||
        anchor.includes(":hypothetical-")
    )
  );
}

function normalizeExactCitationClaim(value: string): string | null {
  const normalized = value
    .replace(/^["'“‘]|["'”’]$/gu, "")
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  return normalized || null;
}

function getBoundedExactCitationClaims(observation: string): string[] {
  const claims = new Set<string>();
  const addClaim = (value: string | undefined) => {
    if (!value) return;
    const claim = normalizeExactCitationClaim(value);
    if (claim) claims.add(claim);
  };

  const existingMatch = observation.match(
    /^\s*(?:the\s+)?(?:answer|candidate|response|turn)\s+(?:explicitly\s+)?(?:cites?|mentions?|states?)\s+(.+?)[.!?]?\s*$/iu
  );
  addClaim(existingMatch?.[1]);

  for (const pattern of [
    /^\s*(?:the\s+)?(?:answer|candidate|response|turn)\s+(?:explicitly\s+)?said\s+(.+?)\s+was\s+(?:(?:the|a)\s+)?(?:named|quoted|stated)\b[\s\S]*?[.!?]?\s*$/iu,
    /^\s*(?:the\s+)?(?:answer|candidate|response|turn)\s+(?:explicitly\s+)?quoted\s+(.+?)\s+as\b[\s\S]*?[.!?]?\s*$/iu,
    /^\s*according\s+to\s+(?:the\s+)?(?:answer|candidate|response|turn)\s*,?\s*(.+?)\s+(?:as|was)\s+(?:(?:the|a)\s+)?(?:named|quoted|stated)\b[\s\S]*?[.!?]?\s*$/iu,
  ] as const) {
    addClaim(observation.match(pattern)?.[1]);
  }

  for (const match of observation.matchAll(
    /["“]([^"”\r\n]+)["”]|['‘]([^'’\r\n]+)['’]/gu
  )) {
    const prefix = observation.slice(0, match.index ?? 0);
    if (
      /\b(?:according\s+to|cites?|mentions?|quoted?|said|states?)\b[\s\S]{0,80}$/iu.test(
        prefix
      )
    ) {
      addClaim(match[1] ?? match[2]);
    }
  }

  return [...claims];
}

function getNegativeClaimTargetSignals(text: string): Set<string> {
  const targets = new Set<string>();
  const negativeProjection = removePositiveNonAdverseNegations(
    removePositiveMaterialDoubleNegations(text)
  );
  for (const match of negativeProjection.matchAll(NEGATIVE_CLAIM_PATTERN)) {
    const start = (match.index ?? 0) + match[0].length;
    for (const signal of getSupportSignals(
      negativeProjection.slice(start, start + 120)
    )) {
      targets.add(signal);
    }
  }
  NEGATIVE_CLAIM_PATTERN.lastIndex = 0;
  if (targets.size > 1) {
    for (const genericPredicate of NEGATIVE_GENERIC_PREDICATE_SIGNALS) {
      targets.delete(genericPredicate);
    }
  }
  return targets;
}

function getAbsenceClaimTargetSignals(text: string): Set<string> {
  const targets = new Set<string>();
  const absenceProjection = removePositiveNonAdverseNegations(text);
  for (const match of absenceProjection.matchAll(
    ABSENCE_CLAIM_GLOBAL_PATTERN
  )) {
    const start = match.index ?? 0;
    const contextStart = Math.max(0, start - 120);
    for (const signal of getSupportSignals(
      absenceProjection.slice(contextStart, start)
    )) {
      targets.add(signal);
    }
    const end = start + match[0].length;
    for (const signal of getSupportSignals(
      absenceProjection.slice(end, end + 80)
    )) {
      targets.add(signal);
    }
  }
  ABSENCE_CLAIM_GLOBAL_PATTERN.lastIndex = 0;
  if (targets.size > 1) {
    for (const genericPredicate of NEGATIVE_GENERIC_PREDICATE_SIGNALS) {
      targets.delete(genericPredicate);
    }
  }
  return targets;
}

const NEGATIVE_GENERIC_PREDICATE_SIGNALS = new Set(
  [
    "address",
    "define",
    "discuss",
    "identify",
    "include",
    "mention",
    "name",
    "provide",
    "specify",
    "state",
  ].map((token) => {
    const stem = getSupportStem(token);
    return SUPPORT_CONCEPT_BY_STEM.get(stem) ?? stem;
  })
);

function getQuantitativeAnchors(text: string): Set<string> {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("en-US");
  const anchors = new Set<string>();
  const compoundSpans: Array<{ start: number; end: number }> = [];
  const multiplierSpans: Array<{ start: number; end: number }> = [];
  const ordinaryQuantities: OrdinaryQuantityMention[] = [];

  for (const match of normalized.matchAll(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/gu
  )) {
    const tens = COMPOUND_NUMBER_TENS.get(match[1] ?? "");
    const ones = COMPOUND_NUMBER_ONES.get(match[2] ?? "");
    if (tens === undefined || ones === undefined) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const number = String(tens + ones);
    compoundSpans.push({ start, end });
    ordinaryQuantities.push({ start, end, number });
    anchors.add(`number:${number}`);
  }

  for (const match of normalized.matchAll(
    /(?:^|[^\p{L}\p{N}_])(\d+(?:[.,]\d+)?)\s*[x×](?=$|[^\p{L}\p{N}_])/gu
  )) {
    const multiplier = `${(match[1] ?? "").replace(",", ".")}x`;
    const start = (match.index ?? 0) + match[0].indexOf(match[1] ?? "");
    multiplierSpans.push({ start, end: start + (match[1]?.length ?? 0) });
    anchors.add(`quantity:${multiplier}`);
    addBoundMultiplierTargetAnchor(
      anchors,
      multiplier,
      normalized,
      (match.index ?? 0) + match[0].length
    );
  }

  for (const match of normalized.matchAll(
    /\b(\d+(?:[.,]\d+)?)\s*(?:-|\s)\s*fold\b/gu
  )) {
    const multiplier = `${(match[1] ?? "").replace(",", ".")}x`;
    const start = match.index ?? 0;
    multiplierSpans.push({ start, end: start + (match[1]?.length ?? 0) });
    anchors.add(`quantity:${multiplier}`);
    addBoundMultiplierTargetAnchor(
      anchors,
      multiplier,
      normalized,
      (match.index ?? 0) + match[0].length
    );
  }

  for (const match of normalized.matchAll(/\b(\p{L}+)[-\s]?fold\b/gu)) {
    const number = NUMBER_WORDS.get(match[1] ?? "");
    if (!number || !/^\d+$/u.test(number)) continue;
    const multiplier = `${number}x`;
    anchors.add(`quantity:${multiplier}`);
    addBoundMultiplierTargetAnchor(
      anchors,
      multiplier,
      normalized,
      (match.index ?? 0) + match[0].length
    );
  }

  for (const family of LEXICAL_MULTIPLIER_FAMILIES) {
    for (const match of normalized.matchAll(family.pattern)) {
      anchors.add(family.anchor);
      addBoundMultiplierTargetAnchor(
        anchors,
        family.anchor.slice("quantity:".length),
        normalized,
        (match.index ?? 0) + match[0].length
      );
    }
  }

  for (const match of normalized.matchAll(/\b\d+(?:[.,]\d+)?\b(?!\s*[x×])/gu)) {
    const start = match.index ?? 0;
    if (
      multiplierSpans.some((span) => start >= span.start && start < span.end)
    ) {
      continue;
    }
    const number = match[0].replace(",", ".");
    anchors.add(`number:${number}`);
    ordinaryQuantities.push({
      start,
      end: start + match[0].length,
      number,
    });
  }

  for (const match of normalized.matchAll(/\p{L}+/gu)) {
    const start = match.index ?? 0;
    if (compoundSpans.some((span) => start >= span.start && start < span.end)) {
      continue;
    }
    const number = NUMBER_WORDS.get(match[0]);
    if (!number) continue;
    anchors.add(`number:${number}`);
    ordinaryQuantities.push({
      start,
      end: start + match[0].length,
      number,
    });
  }
  const metricTargets = getMetricTargetMentions(normalized);
  for (const quantity of ordinaryQuantities) {
    addBoundQuantityAnchors(
      anchors,
      quantity,
      ordinaryQuantities,
      metricTargets,
      normalized
    );
  }
  for (const phrase of QUANTITATIVE_PHRASE_PATTERNS) {
    if (phrase.pattern.test(normalized)) anchors.add(phrase.anchor);
  }
  return anchors;
}

interface OrdinaryQuantityMention extends DirectionalMention {
  number: string;
}

const QUANTITY_PREFIX_MODIFIER_SOURCE = String.raw`(?:(?:about|approximately|around|exactly|nearly|roughly|at\s+least|at\s+most|more\s+than|fewer\s+than|less\s+than|over|under|up\s+to|a\s+total\s+of)\s+)*`;
const RECOGNIZED_QUANTITY_PREDICATE_PATTERN = new RegExp(
  String.raw`\b(contact(?:ed|ing)?|interview(?:ed|ing)?|observ(?:ed|ing)?|recruit(?:ed|ing)?|retain(?:ed|ing)?|survey(?:ed|ing)?|test(?:ed|ing)?)\s+${QUANTITY_PREFIX_MODIFIER_SOURCE}$`,
  "u"
);
const GENERIC_COUNT_PREDICATE_PATTERN = new RegExp(
  String.raw`\b([\p{L}]{3,}(?:ed|ing)|bet|bid|built|bought|burst|cast|chose|cost|cut|drove|found|had|hit|hurt|lead|led|let|made|met|put|quit|ran|read|sent|set|shut|sold|spoke|split|spread|thrust|upset|wrote)\s+${QUANTITY_PREFIX_MODIFIER_SOURCE}$`,
  "u"
);
const ASSERTION_SCOPED_COUNT_PREDICATE_PATTERN = new RegExp(
  String.raw`\b([\p{L}]{3,})\s+${QUANTITY_PREFIX_MODIFIER_SOURCE}$`,
  "u"
);
const NON_COUNT_QUANTITY_UNITS = new Set([
  "basis",
  "bps",
  "cent",
  "cents",
  "day",
  "days",
  "dollar",
  "dollars",
  "euro",
  "euros",
  "hour",
  "hours",
  "millisecond",
  "milliseconds",
  "minute",
  "minutes",
  "ms",
  "percent",
  "percentage",
  "point",
  "points",
  "pound",
  "pounds",
  "second",
  "seconds",
]);

function addBoundQuantityAnchors(
  anchors: Set<string>,
  quantity: OrdinaryQuantityMention,
  quantities: readonly OrdinaryQuantityMention[],
  metricTargets: readonly DirectionalTargetMention[],
  text: string
): void {
  const unit = getBoundQuantityUnit(text, quantity.end);
  const quantityPrefix = text.slice(
    Math.max(0, quantity.start - 64),
    quantity.start
  );
  const recognizedPredicateMatch = quantityPrefix.match(
    RECOGNIZED_QUANTITY_PREDICATE_PATTERN
  );
  const genericPredicateMatch = quantityPrefix.match(
    GENERIC_COUNT_PREDICATE_PATTERN
  );
  const assertionScopedPredicateMatch = quantityPrefix.match(
    ASSERTION_SCOPED_COUNT_PREDICATE_PATTERN
  );
  const assertionScopedPredicate = assertionScopedPredicateMatch?.[1];
  const assertionScopedMode =
    assertionScopedPredicateMatch && assertionScopedPredicate
      ? getLocalAssertionMode(
          quantityPrefix,
          (assertionScopedPredicateMatch.index ?? 0) +
            assertionScopedPredicateMatch[0].indexOf(assertionScopedPredicate)
        )
      : undefined;
  const predicateMatch =
    recognizedPredicateMatch ??
    (unit && !NON_COUNT_QUANTITY_UNITS.has(unit)
      ? (genericPredicateMatch ??
        (assertionScopedMode && assertionScopedMode !== "asserted"
          ? assertionScopedPredicateMatch
          : null))
      : null);
  const predicate = predicateMatch?.[1];
  const predicateMode =
    predicateMatch && predicate
      ? getLocalAssertionMode(
          quantityPrefix,
          (predicateMatch.index ?? 0) + predicateMatch[0].indexOf(predicate)
        )
      : undefined;
  if (unit && !QUANTITY_UNIT_STOP_WORDS.has(unit)) {
    const unitStem = getSupportStem(unit);
    anchors.add(`quantity-unit:${quantity.number}:${unitStem}`);
    if (predicate) {
      anchors.add(
        `quantity-predicate-unit:${quantity.number}:${getSupportStem(predicate)}:${unitStem}`
      );
      anchors.add(
        `quantity-predicate-mode-unit:${quantity.number}:${getSupportStem(predicate)}:${predicateMode}:${unitStem}`
      );
    }
  }
  if (predicate) {
    anchors.add(
      `quantity-predicate:${quantity.number}:${getSupportStem(predicate)}`
    );
    anchors.add(
      `quantity-predicate-mode:${quantity.number}:${getSupportStem(predicate)}:${predicateMode}`
    );
  }

  const targets = metricTargets.filter((target) => {
    if (target.start < quantity.end && target.end > quantity.start) {
      return false;
    }
    const rangeStart = Math.min(target.end, quantity.end);
    const rangeEnd = Math.max(target.start, quantity.start);
    if (
      quantities.some(
        (other) =>
          other !== quantity &&
          other.start >= rangeStart &&
          other.end <= rangeEnd
      )
    ) {
      return false;
    }
    return true;
  });
  const localTargets = targets.filter((target) =>
    isLocalQuantityTarget(text, target, quantity)
  );
  const leftTarget = localTargets.findLast(
    (target) => target.end <= quantity.start
  );
  const rightTarget = localTargets.find(
    (target) => target.start >= quantity.end
  );
  const leftDistance = leftTarget
    ? quantity.start - leftTarget.end
    : Number.POSITIVE_INFINITY;
  const rightDistance = rightTarget
    ? rightTarget.start - quantity.end
    : Number.POSITIVE_INFINITY;
  const primaryTarget =
    leftDistance <= rightDistance ? leftTarget : rightTarget;
  if (!primaryTarget) return;

  const boundTargets = [primaryTarget];
  const primaryIndex = targets.indexOf(primaryTarget);
  const expansionStep = primaryTarget.end <= quantity.start ? -1 : 1;
  let currentTarget = primaryTarget;
  for (
    let targetIndex = primaryIndex + expansionStep;
    targetIndex >= 0 && targetIndex < targets.length;
    targetIndex += expansionStep
  ) {
    const adjacentTarget = targets[targetIndex];
    const gap =
      expansionStep < 0
        ? text.slice(adjacentTarget.end, currentTarget.start)
        : text.slice(currentTarget.end, adjacentTarget.start);
    if (!isCoordinatedDirectionalTargetGap(gap)) break;
    if (
      quantities.some(
        (other) =>
          other !== quantity &&
          isLocalQuantityTarget(text, adjacentTarget, other)
      )
    ) {
      break;
    }
    boundTargets.push(adjacentTarget);
    currentTarget = adjacentTarget;
  }

  for (const target of boundTargets) {
    anchors.add(`quantity-target:${quantity.number}:${target.anchor}`);
    if (unit && !QUANTITY_UNIT_STOP_WORDS.has(unit)) {
      anchors.add(
        `quantity-target-unit:${quantity.number}:${target.anchor}:${getSupportStem(unit)}`
      );
    }
  }
}

function getBoundQuantityUnit(
  text: string,
  quantityEnd: number
): string | undefined {
  const tail = text.slice(quantityEnd);
  const immediate = tail.match(/^\s+([\p{L}][\p{L}\p{N}_-]*)/u)?.[1];
  if (!immediate || NON_COUNT_QUANTITY_UNITS.has(immediate)) return immediate;

  const boundedPhrase = tail.match(
    /^\s+((?:[\p{L}][\p{L}\p{N}_-]*\s+){0,2}[\p{L}][\p{L}\p{N}_-]*)(?=\s+(?:after|and|at|before|but|during|for|from|in|into|of|on|or|to|with|within)\b|\s*[,.;:!?]|$)/u
  )?.[1];
  return boundedPhrase ? getWordTokens(boundedPhrase).at(-1) : immediate;
}

function isLocalQuantityTarget(
  text: string,
  target: DirectionalTargetMention,
  quantity: OrdinaryQuantityMention
): boolean {
  const targetBeforeQuantity = target.end <= quantity.start;
  const gap = targetBeforeQuantity
    ? text.slice(target.end, quantity.start)
    : text.slice(quantity.end, target.start);
  if (gap.length > 48 || /[.!?;\n\u2026\u3002\uFF01\uFF1F]/u.test(gap)) {
    return false;
  }
  const normalizedGap = gap.normalize("NFKC").toLocaleLowerCase("en-US");
  if (targetBeforeQuantity) {
    return (
      /^(?:[\s:=]|\b(?:about|approximately|around|at|became|becomes|being|each|equaled|equals|exactly|fell|grew|had|has|hit|hits|increased|is|measured|nearly|of|only|reached|recorded|reported|rose|roughly|stood|to|totaled|was|were)\b)*$/u.test(
        normalizedGap
      ) ||
      /^\s*(?:for|in|within)\s+(?:(?:a|an|our|the|their|this)\s+)?(?:(?!(?:and|but|or|then)\b)[\p{L}\p{N}_-]+\s+){1,4}(?:about|approximately|around|at|became|becomes|equaled|equals|exactly|fell|grew|hit|hits|increased|is|nearly|reached|recorded|reported|rose|roughly|stood|totaled|was|were)\s*$/u.test(
        normalizedGap
      )
    );
  }
  const quantityPrefix = text
    .slice(Math.max(0, quantity.start - 48), quantity.start)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  if (
    RECOGNIZED_QUANTITY_PREDICATE_PATTERN.test(quantityPrefix) ||
    GENERIC_COUNT_PREDICATE_PATTERN.test(quantityPrefix) ||
    /\bspoke\s+(?:to|with)\s*$/u.test(quantityPrefix)
  ) {
    return false;
  }
  return /^(?:[\s%/=]|\b(?:basis|bps|cent|cents|dollar|dollars|euro|euros|hour|hours|millisecond|milliseconds|minute|minutes|ms|of|percent|percentage|point|points|pound|pounds|second|seconds)\b)*$/u.test(
    normalizedGap
  );
}

function addBoundMultiplierTargetAnchor(
  anchors: Set<string>,
  multiplier: string,
  text: string,
  multiplierEnd: number
): void {
  const targetClause =
    text
      .slice(multiplierEnd, multiplierEnd + 120)
      .split(
        /[.!?;,:()\n]|\b(?:and|but|however|or|then|while|yet)\b/iu,
        1
      )[0] ?? "";
  const candidates = getWordTokens(targetClause)
    .map((token) => token.toLocaleLowerCase("en-US"))
    .filter((token) => !MULTIPLIER_TARGET_SKIP_WORDS.has(token));
  const target =
    candidates.find((token) =>
      MULTIPLIER_TARGET_PREFERRED_STEMS.has(getSupportStem(token))
    ) ?? candidates.at(-1);
  if (!target) return;
  anchors.add(`quantity-target:${multiplier}:${getSupportStem(target)}`);
}

function getAbsoluteClaimAnchors(text: string): Set<string> {
  return new Set(
    getWordTokens(text)
      .map((token) => token.toLocaleLowerCase("en-US"))
      .filter((token) => ABSOLUTE_CLAIM_WORDS.has(token))
  );
}

function getWordTokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) ?? [];
}

function getSupportStem(token: string): string {
  const irregular = new Map([
    ["chose", "choose"],
    ["chosen", "choose"],
    ["defined", "define"],
    ["defines", "define"],
    ["defining", "define"],
    ["identified", "identify"],
    ["identifies", "identify"],
    ["identifying", "identify"],
    ["led", "lead"],
    ["measurable", "measure"],
    ["measurement", "measure"],
    ["prioritization", "prioritize"],
    ["supplied", "supply"],
    ["supplies", "supply"],
    ["supplying", "supply"],
  ]);
  const mapped = irregular.get(token);
  if (mapped) return mapped;
  const stem = token.replace(
    /(?:abilities|ability|ations|ation|ments|ment|ingly|edly|ing|ed|es|s)$/u,
    ""
  );
  return stem.length >= 3 ? stem : token;
}

function setsIntersect(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return [...left].some((value) => right.has(value));
}

function countIntersection(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>
): number {
  return [...left].filter((value) => right.has(value)).length;
}

function parseEvidence(
  value: unknown,
  path: string,
  transcriptById: Map<string, FeedbackTranscriptTurn>
): FeedbackEvidence[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    throw new FeedbackV2ParseError(`${path} must contain 1 to 5 entries`);
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const evidencePath = `${path}[${index}]`;
    const record = requireRecord(entry, evidencePath);
    requireExactKeys(record, evidencePath, ["turnRef", "quote"]);
    const turnRef = requireNonEmpty(record.turnRef, `${evidencePath}.turnRef`);
    const quote = requireNonEmpty(record.quote, `${evidencePath}.quote`);
    if (seen.has(turnRef)) {
      throw new FeedbackV2ParseError(
        `${path} contains duplicate turnRef ${turnRef}`
      );
    }
    seen.add(turnRef);
    const turn = transcriptById.get(turnRef);
    if (!turn) {
      throw new FeedbackV2ParseError(
        `${evidencePath}.turnRef does not exist in the canonical transcript`
      );
    }
    if (turn.speaker !== "user") {
      throw new FeedbackV2ParseError(
        `${evidencePath}.turnRef must reference a candidate turn`
      );
    }
    const normalizedQuote = normalizeEvidenceQuoteToSource(turn.text, quote);
    if (!normalizedQuote) {
      throw new FeedbackV2ParseError(
        `${evidencePath}.quote is not exact evidence from ${turnRef}`
      );
    }
    if (!isMinimallySubstantiveEvidenceQuote(normalizedQuote, turn.text)) {
      throw new FeedbackV2ParseError(
        `${evidencePath}.quote must contain minimally substantive evidence`
      );
    }
    return { turnRef, quote: normalizedQuote };
  });
}

function requireUniqueEvidence(
  items: FeedbackV2Item[],
  transcriptById: Map<string, FeedbackTranscriptTurn>
): void {
  const seen = new Set<string>();
  const rangesByTurn = new Map<string, Array<{ start: number; end: number }>>();
  for (const item of items) {
    for (const evidence of item.evidence) {
      const identityQuote = evidence.quote
        .normalize("NFKC")
        .replace(/\p{Default_Ignorable_Code_Point}/gu, "");
      const identity = `${evidence.turnRef}\u0000${identityQuote}`;
      if (seen.has(identity)) {
        throw new FeedbackV2ParseError(
          `evidence ${evidence.turnRef} is repeated across findings`
        );
      }
      seen.add(identity);
      const source = transcriptById.get(evidence.turnRef)?.text;
      const start = source?.indexOf(evidence.quote) ?? -1;
      if (start < 0) {
        throw new FeedbackV2ParseError(
          `evidence ${evidence.turnRef} is not grounded in its canonical turn`
        );
      }
      const end = start + evidence.quote.length;
      const priorRanges = rangesByTurn.get(evidence.turnRef) ?? [];
      if (priorRanges.some((range) => start < range.end && end > range.start)) {
        throw new FeedbackV2ParseError(
          `evidence ${evidence.turnRef} overlaps evidence across findings`
        );
      }
      priorRanges.push({ start, end });
      rangesByTurn.set(evidence.turnRef, priorRanges);
    }
  }
}

function parseStringArray(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new FeedbackV2ParseError(
      `${path} must contain ${minimum} to ${maximum} items`
    );
  }
  return value.map((entry, index) =>
    requireNonEmpty(entry, `${path}[${index}]`)
  );
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FeedbackV2ParseError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  path: string,
  expectedKeys: readonly string[]
): void {
  const expected = new Set(expectedKeys);
  const unknownKeys = Object.keys(record).filter((key) => !expected.has(key));
  if (unknownKeys.length > 0) {
    throw new FeedbackV2ParseError(
      `${path} contains unknown field${unknownKeys.length === 1 ? "" : "s"}: ${unknownKeys.join(", ")}`
    );
  }
}

function requireNonEmpty(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FeedbackV2ParseError(`${path} must be a non-empty string`);
  }
  return value;
}

function requireExact(value: unknown, expected: string, path: string): void {
  if (value !== expected) {
    throw new FeedbackV2ParseError(`${path} must equal ${expected}`);
  }
}

function requireScore(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 10
  ) {
    throw new FeedbackV2ParseError(`${path} must be an integer from 0 to 10`);
  }
  return value;
}

function requireConfidence(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new FeedbackV2ParseError(`${path} must be a number from 0 to 1`);
  }
  return value;
}
