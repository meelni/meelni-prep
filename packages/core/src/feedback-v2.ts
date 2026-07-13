import { calculateOverallScore, type FeedbackDimension } from "./evaluation";
import {
  normalizeEvidenceQuoteToSource,
  type FeedbackTranscriptTurn,
} from "./feedback-transcript";

export type { FeedbackTranscriptTurn } from "./feedback-transcript";

export const FEEDBACK_SCHEMA_VERSION = "feedback.v2" as const;
export const FEEDBACK_PROMPT_VERSION = "feedback.prompt.v2" as const;
export const FEEDBACK_RUBRIC_VERSION = "pm-feedback-rubric.v2" as const;
export const FEEDBACK_V2_REJECTION_TAXONOMY_VERSION =
  "feedback-v2-rejection.v1" as const;

export const FEEDBACK_V2_REJECTION_CODES = [
  "response_not_object",
  "response_unknown_field",
  "schema_version_mismatch",
  "prompt_version_mismatch",
  "rubric_version_mismatch",
  "evaluation_state_mismatch",
  "model_version_invalid",
  "canonical_transcript_empty",
  "canonical_transcript_turn_invalid",
  "canonical_transcript_duplicate_event_id",
  "scores_not_object",
  "scores_unknown_field",
  "score_invalid",
  "findings_count_invalid",
  "finding_not_object",
  "finding_unknown_field",
  "finding_dimension_invalid",
  "finding_rubric_version_mismatch",
  "finding_text_invalid",
  "transcript_refs_invalid",
  "transcript_refs_duplicate",
  "evidence_count_invalid",
  "evidence_not_object",
  "evidence_unknown_field",
  "evidence_turn_ref_invalid",
  "evidence_turn_ref_duplicate",
  "evidence_turn_ref_not_found",
  "evidence_turn_ref_wrong_speaker",
  "evidence_quote_invalid",
  "evidence_quote_not_grounded",
  "evidence_reference_set_mismatch",
  "evidence_reused_across_findings",
  "confidence_invalid",
  "drills_invalid",
  "summary_invalid",
  "parser_internal_failure",
] as const;

export type FeedbackV2RejectionCode =
  (typeof FEEDBACK_V2_REJECTION_CODES)[number];

const FEEDBACK_V2_REJECTION_CODE_SET = new Set<string>(
  FEEDBACK_V2_REJECTION_CODES
);

export function isFeedbackV2RejectionCode(
  value: unknown
): value is FeedbackV2RejectionCode {
  return typeof value === "string" && FEEDBACK_V2_REJECTION_CODE_SET.has(value);
}

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
  return (
    typeof item.dimension === "string" &&
    DIMENSIONS.has(item.dimension as FeedbackDimension) &&
    typeof item.observation === "string" &&
    Array.isArray(item.transcriptRefs) &&
    Array.isArray(item.evidence) &&
    typeof item.nextStep === "string" &&
    item.rubricVersion === FEEDBACK_RUBRIC_VERSION &&
    typeof item.confidence === "number"
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
  constructor(
    readonly code: FeedbackV2RejectionCode,
    message: string
  ) {
    super(`Invalid feedback v2: ${message}`);
    this.name = "FeedbackV2ParseError";
  }
}

export function parseFeedbackV2(
  value: unknown,
  options: ParseFeedbackV2Options
): FeedbackV2Result {
  const root = requireRecord(value, "response", "response_not_object");
  requireExactKeys(
    root,
    "response",
    [
      "schemaVersion",
      "promptVersion",
      "rubricVersion",
      "evaluationState",
      "scores",
      "strengths",
      "improvements",
      "drills",
      "summary",
    ],
    "response_unknown_field"
  );
  requireExact(
    root.schemaVersion,
    FEEDBACK_SCHEMA_VERSION,
    "schemaVersion",
    "schema_version_mismatch"
  );
  requireExact(
    root.promptVersion,
    FEEDBACK_PROMPT_VERSION,
    "promptVersion",
    "prompt_version_mismatch"
  );
  requireExact(
    root.rubricVersion,
    FEEDBACK_RUBRIC_VERSION,
    "rubricVersion",
    "rubric_version_mismatch"
  );
  requireExact(
    root.evaluationState,
    options.evaluationState,
    "evaluationState",
    "evaluation_state_mismatch"
  );

  const modelVersion = requireNonEmpty(
    options.modelVersion,
    "modelVersion",
    "model_version_invalid"
  );
  const transcriptById = buildTranscriptIndex(options.transcript);
  const scoresRecord = requireRecord(
    root.scores,
    "scores",
    "scores_not_object"
  );
  requireExactKeys(
    scoresRecord,
    "scores",
    ["structure", "clarity", "insight", "communication", "leadership"],
    "scores_unknown_field"
  );
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
  requireUniqueEvidence([...strengths, ...improvements]);

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
    drills: parseStringArray(root.drills, "drills", 1, 3, "drills_invalid"),
    summary: requireNonEmpty(root.summary, "summary", "summary_invalid"),
  };
}

function buildTranscriptIndex(
  transcript: FeedbackTranscriptTurn[]
): Map<string, FeedbackTranscriptTurn> {
  if (transcript.length === 0) {
    throw new FeedbackV2ParseError(
      "canonical_transcript_empty",
      "canonical transcript is empty"
    );
  }
  const index = new Map<string, FeedbackTranscriptTurn>();
  for (const [position, turn] of transcript.entries()) {
    const eventId = requireNonEmpty(
      turn.eventId,
      `transcript[${position}].eventId`,
      "canonical_transcript_turn_invalid"
    );
    const text = requireNonEmpty(
      turn.text,
      `transcript[${position}].text`,
      "canonical_transcript_turn_invalid"
    );
    if (turn.speaker !== "user" && turn.speaker !== "interviewer") {
      throw new FeedbackV2ParseError(
        "canonical_transcript_turn_invalid",
        `transcript[${position}].speaker must be user or interviewer`
      );
    }
    if (index.has(eventId)) {
      throw new FeedbackV2ParseError(
        "canonical_transcript_duplicate_event_id",
        `duplicate transcript eventId ${eventId}`
      );
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
    throw new FeedbackV2ParseError(
      "findings_count_invalid",
      `${path} must contain 1 to 5 items`
    );
  }
  return value.map((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = requireRecord(entry, itemPath, "finding_not_object");
    requireExactKeys(
      item,
      itemPath,
      [
        "dimension",
        "observation",
        "transcriptRefs",
        "evidence",
        "nextStep",
        "rubricVersion",
        "confidence",
      ],
      "finding_unknown_field"
    );
    const dimension = item.dimension;
    if (
      typeof dimension !== "string" ||
      !DIMENSIONS.has(dimension as FeedbackDimension)
    ) {
      throw new FeedbackV2ParseError(
        "finding_dimension_invalid",
        `${itemPath}.dimension is invalid`
      );
    }
    requireExact(
      item.rubricVersion,
      FEEDBACK_RUBRIC_VERSION,
      `${itemPath}.rubricVersion`,
      "finding_rubric_version_mismatch"
    );
    const transcriptRefs = parseStringArray(
      item.transcriptRefs,
      `${itemPath}.transcriptRefs`,
      1,
      5,
      "transcript_refs_invalid"
    );
    if (new Set(transcriptRefs).size !== transcriptRefs.length) {
      throw new FeedbackV2ParseError(
        "transcript_refs_duplicate",
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
        "evidence_reference_set_mismatch",
        `${itemPath} transcriptRefs and evidence references must match`
      );
    }
    return {
      dimension: dimension as FeedbackDimension,
      observation: requireNonEmpty(
        item.observation,
        `${itemPath}.observation`,
        "finding_text_invalid"
      ),
      transcriptRefs,
      evidence,
      nextStep: requireNonEmpty(
        item.nextStep,
        `${itemPath}.nextStep`,
        "finding_text_invalid"
      ),
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
    throw new FeedbackV2ParseError(
      "evidence_count_invalid",
      `${path} must contain 1 to 5 entries`
    );
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const evidencePath = `${path}[${index}]`;
    const record = requireRecord(entry, evidencePath, "evidence_not_object");
    requireExactKeys(
      record,
      evidencePath,
      ["turnRef", "quote"],
      "evidence_unknown_field"
    );
    const turnRef = requireNonEmpty(
      record.turnRef,
      `${evidencePath}.turnRef`,
      "evidence_turn_ref_invalid"
    );
    const quote = requireNonEmpty(
      record.quote,
      `${evidencePath}.quote`,
      "evidence_quote_invalid"
    );
    if (seen.has(turnRef)) {
      throw new FeedbackV2ParseError(
        "evidence_turn_ref_duplicate",
        `${path} contains duplicate turnRef ${turnRef}`
      );
    }
    seen.add(turnRef);
    const turn = transcriptById.get(turnRef);
    if (!turn) {
      throw new FeedbackV2ParseError(
        "evidence_turn_ref_not_found",
        `${evidencePath}.turnRef does not exist in the canonical transcript`
      );
    }
    if (turn.speaker !== "user") {
      throw new FeedbackV2ParseError(
        "evidence_turn_ref_wrong_speaker",
        `${evidencePath}.turnRef must reference user speech`
      );
    }
    const normalizedQuote = normalizeEvidenceQuoteToSource(turn.text, quote);
    if (!normalizedQuote) {
      throw new FeedbackV2ParseError(
        "evidence_quote_not_grounded",
        `${evidencePath}.quote is not exact evidence from ${turnRef}`
      );
    }
    return { turnRef, quote: normalizedQuote };
  });
}

function requireUniqueEvidence(items: FeedbackV2Item[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    for (const evidence of item.evidence) {
      const identity = `${evidence.turnRef}\u0000${evidence.quote}`;
      if (seen.has(identity)) {
        throw new FeedbackV2ParseError(
          "evidence_reused_across_findings",
          `evidence ${evidence.turnRef} is repeated across findings`
        );
      }
      seen.add(identity);
    }
  }
}

function parseStringArray(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  rejectionCode: FeedbackV2RejectionCode
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new FeedbackV2ParseError(
      rejectionCode,
      `${path} must contain ${minimum} to ${maximum} items`
    );
  }
  return value.map((entry, index) =>
    requireNonEmpty(entry, `${path}[${index}]`, rejectionCode)
  );
}

function requireRecord(
  value: unknown,
  path: string,
  rejectionCode: FeedbackV2RejectionCode
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FeedbackV2ParseError(rejectionCode, `${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  path: string,
  expectedKeys: readonly string[],
  rejectionCode: FeedbackV2RejectionCode
): void {
  const expected = new Set(expectedKeys);
  const unknownKeys = Object.keys(record).filter((key) => !expected.has(key));
  if (unknownKeys.length > 0) {
    throw new FeedbackV2ParseError(
      rejectionCode,
      `${path} contains unknown field${unknownKeys.length === 1 ? "" : "s"}: ${unknownKeys.join(", ")}`
    );
  }
}

function requireNonEmpty(
  value: unknown,
  path: string,
  rejectionCode: FeedbackV2RejectionCode
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FeedbackV2ParseError(
      rejectionCode,
      `${path} must be a non-empty string`
    );
  }
  return value;
}

function requireExact(
  value: unknown,
  expected: string,
  path: string,
  rejectionCode: FeedbackV2RejectionCode
): void {
  if (value !== expected) {
    throw new FeedbackV2ParseError(
      rejectionCode,
      `${path} must equal ${expected}`
    );
  }
}

function requireScore(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 10
  ) {
    throw new FeedbackV2ParseError(
      "score_invalid",
      `${path} must be an integer from 0 to 10`
    );
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
    throw new FeedbackV2ParseError(
      "confidence_invalid",
      `${path} must be a number from 0 to 1`
    );
  }
  return value;
}
