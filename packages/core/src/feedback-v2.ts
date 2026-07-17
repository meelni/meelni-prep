import { calculateOverallScore, type FeedbackDimension } from "./evaluation";

export const FEEDBACK_SCHEMA_VERSION = "feedback.v2" as const;
export const FEEDBACK_PROMPT_VERSION = "feedback.prompt.v2" as const;
export const FEEDBACK_RUBRIC_VERSION = "pm-feedback-rubric.v2" as const;

export const FEEDBACK_EVALUATION_STATES = ["full", "partial"] as const;
export type FeedbackEvaluationState =
  (typeof FEEDBACK_EVALUATION_STATES)[number];

export interface FeedbackTranscriptTurn {
  eventId: string;
  speaker: "user" | "interviewer";
  text: string;
  deliveryState?: "delivered" | "partially_delivered";
}

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

  return {
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    modelVersion,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: options.evaluationState,
    scores,
    overallScore: calculateOverallScore(scores),
    strengths: parseItems(root.strengths, "strengths", transcriptById),
    improvements: parseItems(root.improvements, "improvements", transcriptById),
    drills: parseStringArray(root.drills, "drills", 1, 3),
    summary: requireNonEmpty(root.summary, "summary"),
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
    return {
      dimension: dimension as FeedbackDimension,
      observation: requireNonEmpty(item.observation, `${itemPath}.observation`),
      transcriptRefs,
      evidence,
      nextStep: requireNonEmpty(item.nextStep, `${itemPath}.nextStep`),
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      confidence: requireConfidence(item.confidence, `${itemPath}.confidence`),
    };
  });
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
    if (!turn.text.includes(quote)) {
      throw new FeedbackV2ParseError(
        `${evidencePath}.quote is not exact evidence from ${turnRef}`
      );
    }
    return { turnRef, quote };
  });
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
