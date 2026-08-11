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
const IMPLICIT_RATING_NUMBER = String.raw`(?:10(?:\.0+)?|[0-9](?:\.\d+)?|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)(?:[\s-]+point[\s-]+(?:zero|one|two|three|four|five|six|seven|eight|nine))?)`;
const RATING_SCALE = String.raw`(?:5|10|100|five|ten|hundred)`;
const QUANTITATIVE_UNIT = String.raw`(?:%|percent(?:age)?|basis[\s-]+points?|bps|milliseconds?|ms|seconds?|minutes?|hours?|days?|weeks?|months?|years?|users?|customers?|people|participants?|respondents?|interviews?|questions?|features?|ideas?|metrics?|markets?|segments?|experiments?|responses?|stages?|steps?|options?|examples?|findings?|teams?|companies|products?|dollars?|million|billion|revenue|market[\s-]+share)`;
const QUANTITATIVE_COMPOUND_HEAD = String.raw`(?:stage|point|part|step|phase|factor|dimension|week|month|year|day|hour|minute|second|user|customer|participant|respondent|interview|question|feature|idea|metric|market|segment|experiment|response|option|example|finding|team|company|product|cohort|country|region|channel|dollar)`;
const NON_RATING_QUANTITY_FOLLOWER = String.raw`(?:[\s-]+${QUANTITATIVE_UNIT}\b|\s*%|-${QUANTITATIVE_COMPOUND_HEAD}\b)`;
const NUMERICAL_RATING_PATTERNS = [
  new RegExp(
    String.raw`\b(?:score(?:d)?|rating|rate(?:d)?|grade(?:d)?)\s*(?:of|is|was|at|:)?\s*(?:a|an)?\s*${RATING_NUMBER}\b(?!${NON_RATING_QUANTITY_FOLLOWER})`,
    "iu"
  ),
  new RegExp(
    String.raw`\b${RATING_NUMBER}\s*(?:\/|out[\s-]+of)\s*${RATING_SCALE}\b`,
    "iu"
  ),
  new RegExp(
    String.raw`\b(?:a|an)?\s*${IMPLICIT_RATING_NUMBER}[\s-]+overall\b`,
    "iu"
  ),
  new RegExp(
    String.raw`\b(?:(?:a|an)[\s-]+)?overall[\s-]+${IMPLICIT_RATING_NUMBER}\b(?!${NON_RATING_QUANTITY_FOLLOWER})`,
    "iu"
  ),
  new RegExp(
    String.raw`\boverall\b[\s,;:-]*(?:(?:the|this)[\s-]+)?(?:candidate|answer|response|performance|assessment|attempt|it|this)\s+(?:is|was|lands?|landed|comes?|came|sits?|stood|rates?|rated|scores?|scored|merits?|earned?)\s*(?:at|as)?\s*(?:a|an)?\s*${IMPLICIT_RATING_NUMBER}\b`,
    "iu"
  ),
  new RegExp(
    String.raw`\boverall\s*[:=-]\s*(?:a|an)?\s*${IMPLICIT_RATING_NUMBER}\b`,
    "iu"
  ),
  new RegExp(
    String.raw`\b(?:(?:aim|shoot|strive|work)\s+(?:for|toward|towards)|aim\s+to\s+(?:reach|get|become)|target|reach)\s+(?:(?:a|an)\s+)?${IMPLICIT_RATING_NUMBER}\b(?!${NON_RATING_QUANTITY_FOLLOWER})`,
    "iu"
  ),
  new RegExp(
    String.raw`\b(?:call|consider|judge|place|put|rank)\s+(?:(?:the|this)\s+)?(?:candidate|answer|response|performance|attempt|it|this)\s*(?:at|as)?\s*(?:(?:a|an)\s+)?${IMPLICIT_RATING_NUMBER}\b(?!${NON_RATING_QUANTITY_FOLLOWER})`,
    "iu"
  ),
  new RegExp(
    String.raw`\b(?:(?:the|this)\s+)?(?:candidate|answer|response|performance|attempt|it|this)\s+(?:is|was|lands?|landed|comes?|came|sits?|stood|rates?|rated|scores?|scored|merits?|earns?|earned)\s*(?:at|as)?\s*(?:(?:a|an)\s+)?${IMPLICIT_RATING_NUMBER}\b(?!${NON_RATING_QUANTITY_FOLLOWER})`,
    "iu"
  ),
  new RegExp(
    String.raw`\b(?:give|award|assign)\s+(?:(?:the|this)\s+)?(?:candidate|answer|response|performance|attempt|it|this)\s+(?:(?:a|an)\s+)?${IMPLICIT_RATING_NUMBER}\b(?!${NON_RATING_QUANTITY_FOLLOWER})`,
    "iu"
  ),
  new RegExp(
    String.raw`\b(?:rate|score|grade|assess|evaluate|mark)\s+(?:(?:the|this)\s+)?(?:candidate|answer|response|performance|assessment|attempt|it|this)\s*(?:at|as)?\s*(?:(?:a|an)\s+)?${IMPLICIT_RATING_NUMBER}\b(?!${NON_RATING_QUANTITY_FOLLOWER})`,
    "iu"
  ),
] as const;

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
  if (
    customerCopy.some((value) =>
      NUMERICAL_RATING_PATTERNS.some((pattern) => pattern.test(value))
    )
  ) {
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
