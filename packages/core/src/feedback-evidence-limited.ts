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

const RATING_NUMBER = String.raw`(?:\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten)`;
const RATING_SCALE = String.raw`(?:5|10|100|five|ten|hundred)`;
const NUMERICAL_RATING_PATTERN = new RegExp(
  String.raw`\b(?:score|rating|grade)(?:d)?\s*(?:of|is|was|at|:)?\s*(?:a|an)?\s*${RATING_NUMBER}\b|\b${RATING_NUMBER}\s*(?:\/|out\s+of)\s*${RATING_SCALE}\b`,
  "iu"
);

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
  if (customerCopy.some((value) => NUMERICAL_RATING_PATTERN.test(value))) {
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
