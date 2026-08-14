import { isValidRoundType, type RoundType } from "./interview";

export const SAVED_INTERVIEW_WORKSPACE_VERSION =
  "saved-interview.workspace.v1" as const;

export type FrozenFeedbackTranscriptAvailability =
  | "pending"
  | "ready"
  | "unavailable";

export type FrozenFeedbackTranscriptReadiness =
  | "ready"
  | "not_ready"
  | "unavailable";

export interface SavedInterviewWorkspace {
  version: typeof SAVED_INTERVIEW_WORKSPACE_VERSION;
  saved: true;
  roundType: RoundType;
  question: {
    text: string;
    company: string | null;
  } | null;
  frozenTranscript: FrozenFeedbackTranscriptAvailability;
}

const WORKSPACE_KEYS = new Set([
  "version",
  "saved",
  "roundType",
  "question",
  "frozenTranscript",
]);
const QUESTION_KEYS = new Set(["text", "company"]);
const MAX_QUESTION_TEXT_LENGTH = 2_000;
const MAX_COMPANY_LENGTH = 256;

/** Classify whether a transcript may cross the frozen display boundary. */
export function classifyFrozenFeedbackTranscriptReadiness(input: {
  lifecycleState: unknown;
  transcriptEvidenceVersion: unknown;
  transcriptEvidenceState: unknown;
  transcriptCutoffAt: unknown;
  transcriptEvidenceFrozenAt: unknown;
}): FrozenFeedbackTranscriptReadiness {
  if (
    input.lifecycleState !== "completed" &&
    input.lifecycleState !== "abandoned" &&
    input.lifecycleState !== "failed"
  ) {
    return "not_ready";
  }
  if (input.transcriptEvidenceVersion === null) return "ready";
  if (
    input.transcriptEvidenceVersion === 1 &&
    (input.transcriptEvidenceState === "complete" ||
      input.transcriptEvidenceState === "partial") &&
    isFiniteDate(input.transcriptCutoffAt) &&
    isFiniteDate(input.transcriptEvidenceFrozenAt) &&
    input.transcriptEvidenceFrozenAt.getTime() >=
      input.transcriptCutoffAt.getTime()
  ) {
    return "ready";
  }
  return "unavailable";
}

/** Decode the content-minimal saved-interview projection at the API boundary. */
export function decodeSavedInterviewWorkspace(
  value: unknown
): SavedInterviewWorkspace | null {
  if (!isRecord(value) || hasUnexpectedKeys(value, WORKSPACE_KEYS)) return null;
  if (
    value.version !== SAVED_INTERVIEW_WORKSPACE_VERSION ||
    value.saved !== true ||
    typeof value.roundType !== "string" ||
    !isValidRoundType(value.roundType) ||
    !isFrozenTranscriptAvailability(value.frozenTranscript)
  ) {
    return null;
  }

  const question = decodeQuestion(value.question);
  if (question === undefined) return null;
  return {
    version: SAVED_INTERVIEW_WORKSPACE_VERSION,
    saved: true,
    roundType: value.roundType,
    question,
    frozenTranscript: value.frozenTranscript,
  };
}

function decodeQuestion(
  value: unknown
): SavedInterviewWorkspace["question"] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || hasUnexpectedKeys(value, QUESTION_KEYS)) {
    return undefined;
  }
  if (!isBoundedString(value.text, MAX_QUESTION_TEXT_LENGTH)) return undefined;
  if (
    value.company !== null &&
    !isBoundedString(value.company, MAX_COMPANY_LENGTH)
  ) {
    return undefined;
  }
  return { text: value.text, company: value.company };
}

function isFrozenTranscriptAvailability(
  value: unknown
): value is FrozenFeedbackTranscriptAvailability {
  return value === "pending" || value === "ready" || value === "unavailable";
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum
  );
}

function hasUnexpectedKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>
): boolean {
  return Object.keys(value).some((key) => !allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}
