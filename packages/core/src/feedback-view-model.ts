import { calculateOverallScore, type FeedbackDimension } from "./evaluation";
import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackEvaluationState,
  type FeedbackEvidence,
  type FeedbackV2Item,
  type FeedbackV2Scores,
} from "./feedback-v2";
import { prepareFeedbackTranscript } from "./feedback-transcript";

export const LEGACY_FEEDBACK_RUBRIC_VERSION = "1.0.0" as const;

export interface PersistedCompletedFeedback {
  id: unknown;
  sessionId: unknown;
  structureScore: unknown;
  clarityScore: unknown;
  insightScore: unknown;
  communicationScore: unknown;
  leadershipScore: unknown;
  overallScore: unknown;
  strengths: unknown;
  improvements: unknown;
  drills: unknown;
  summary: unknown;
  rubricVersion: unknown;
  schemaVersion: unknown;
  promptVersion: unknown;
  modelVersion: unknown;
  evaluationState: unknown;
  createdAt: unknown;
}

export interface PersistedFeedbackEvidenceTurn {
  eventId: unknown;
  speaker: unknown;
  text: unknown;
  contractVersion: unknown;
}

export interface PresentCompletedFeedbackOptions {
  evidenceTurns: readonly PersistedFeedbackEvidenceTurn[];
}

export interface FeedbackScoreView {
  structure: number;
  clarity: number;
  insight: number;
  communication: number;
  leadership: number;
  overall: number;
}

/** SAV-201 may populate this seam. SAV-200 never ranks recommendations. */
export interface FeedbackNextPracticeRecommendation {
  version: string;
  dimension: FeedbackDimension;
  title: string;
  rationale: string;
  actionId: string;
}

interface CompletedFeedbackBase {
  id: string;
  sessionId: string;
  scores: FeedbackScoreView;
  summary: string;
  createdAt: string;
  nextPracticeRecommendation: FeedbackNextPracticeRecommendation | null;
}

export interface FeedbackV2View extends CompletedFeedbackBase {
  kind: "v2";
  evaluationState: FeedbackEvaluationState;
  schemaVersion: typeof FEEDBACK_SCHEMA_VERSION;
  promptVersion: typeof FEEDBACK_PROMPT_VERSION;
  modelVersion: string;
  rubricVersion: typeof FEEDBACK_RUBRIC_VERSION;
  strengths: FeedbackV2Item[];
  improvements: FeedbackV2Item[];
}

export interface FeedbackLegacyView extends CompletedFeedbackBase {
  kind: "legacy";
  rubricVersion: typeof LEGACY_FEEDBACK_RUBRIC_VERSION;
  strengths: string[];
  improvements: string[];
}

export interface FeedbackInvalidView {
  kind: "invalid";
  reason: "incompatible_or_corrupt";
}

export type CompletedFeedbackView =
  | FeedbackV2View
  | FeedbackLegacyView
  | FeedbackInvalidView;

export interface SkippedFeedbackDetails {
  tier: "insufficient" | "abandoned";
  reasons: string[];
  recommendations: string[];
  stats?: {
    totalTurns: number;
    userTurns: number;
    totalWords: number;
    durationSeconds: number;
    substantiveResponses: number;
  };
}

export type FeedbackLifecycleResponse =
  | { status: "missing"; retryable: true; message?: string }
  | {
      status: "session_not_ended";
      retryable: false;
      message?: string;
    }
  | {
      status: "pending";
      retryable: boolean;
      estimatedTimeRemaining?: number;
    }
  | {
      status: "processing";
      retryable: boolean;
      estimatedTimeRemaining?: number;
    }
  | {
      status: "completed";
      retryable: false;
      feedback: CompletedFeedbackView;
    }
  | {
      status: "failed";
      retryable: boolean;
      message: string;
    }
  | {
      status: "skipped";
      retryable: false;
      details: SkippedFeedbackDetails;
    };

export type FeedbackViewState =
  | { kind: "missing"; retryable: true; message?: string }
  | { kind: "session-active"; message?: string }
  | { kind: "pending"; retryable: boolean }
  | { kind: "processing"; retryable: boolean }
  | { kind: "completed-full"; feedback: FeedbackV2View }
  | { kind: "completed-partial"; feedback: FeedbackV2View }
  | { kind: "completed-legacy"; feedback: FeedbackLegacyView }
  | { kind: "completed-invalid" }
  | { kind: "failed-retryable"; message: string }
  | { kind: "failed-terminal"; message: string }
  | { kind: "skipped-insufficient"; details: SkippedFeedbackDetails }
  | { kind: "skipped-abandoned"; details: SkippedFeedbackDetails };

const DIMENSIONS = new Set<FeedbackDimension>([
  "structure",
  "clarity",
  "insight",
  "communication",
  "leadership",
]);

const FEEDBACK_READ_LIMITS = {
  identifier: 256,
  modelVersion: 256,
  summary: 4_000,
  findingText: 2_000,
  evidenceQuote: 4_000,
  legacyNote: 4_000,
  storedPracticeSuggestion: 2_000,
  numericString: 32,
} as const;
const MAX_PERSISTED_EVIDENCE_TURNS = 1_000;

export function presentCompletedFeedback(
  input: PersistedCompletedFeedback,
  options: PresentCompletedFeedbackOptions
): CompletedFeedbackView {
  try {
    return hasLegacyVersionTuple(input)
      ? parseLegacyFeedback(input)
      : parseV2Feedback(input, options.evidenceTurns);
  } catch {
    return { kind: "invalid", reason: "incompatible_or_corrupt" };
  }
}

export function toFeedbackViewState(
  response: FeedbackLifecycleResponse
): FeedbackViewState {
  switch (response.status) {
    case "missing":
      return {
        kind: "missing",
        retryable: true,
        ...(response.message ? { message: response.message } : {}),
      };
    case "session_not_ended":
      return {
        kind: "session-active",
        ...(response.message ? { message: response.message } : {}),
      };
    case "pending":
      return { kind: "pending", retryable: response.retryable };
    case "processing":
      return { kind: "processing", retryable: response.retryable };
    case "failed":
      return response.retryable
        ? { kind: "failed-retryable", message: response.message }
        : { kind: "failed-terminal", message: response.message };
    case "skipped":
      return response.details.tier === "abandoned"
        ? { kind: "skipped-abandoned", details: response.details }
        : { kind: "skipped-insufficient", details: response.details };
    case "completed":
      if (response.feedback.kind === "invalid") {
        return { kind: "completed-invalid" };
      }
      if (response.feedback.kind === "legacy") {
        return { kind: "completed-legacy", feedback: response.feedback };
      }
      return response.feedback.evaluationState === "partial"
        ? { kind: "completed-partial", feedback: response.feedback }
        : { kind: "completed-full", feedback: response.feedback };
  }
}

export function getFeedbackConfidenceLabel(
  confidence: number
): "Strong evidence" | "Moderate evidence" | "Limited evidence" {
  if (confidence >= 0.8) return "Strong evidence";
  if (confidence >= 0.6) return "Moderate evidence";
  return "Limited evidence";
}

function parseV2Feedback(
  input: PersistedCompletedFeedback,
  evidenceTurns: readonly PersistedFeedbackEvidenceTurn[]
): FeedbackV2View {
  requireExact(input.schemaVersion, FEEDBACK_SCHEMA_VERSION);
  requireExact(input.promptVersion, FEEDBACK_PROMPT_VERSION);
  requireExact(input.rubricVersion, FEEDBACK_RUBRIC_VERSION);
  const evaluationState = requireEvaluationState(input.evaluationState);
  const scores = parseScores(input);
  const evidenceByTurn = parseCanonicalEvidenceTurns(evidenceTurns);
  const strengths = parseV2Items(input.strengths, "strengths", evidenceByTurn);
  const improvements = parseV2Items(
    input.improvements,
    "improvements",
    evidenceByTurn
  );
  requireUniqueEvidence([...strengths, ...improvements]);
  // Stored model-authored suggestions remain untrusted and are validated, but
  // are intentionally excluded from the customer read model until SAV-201.
  parseStringArray(
    input.drills,
    1,
    3,
    FEEDBACK_READ_LIMITS.storedPracticeSuggestion
  );

  return {
    kind: "v2",
    id: requireBoundedString(input.id, FEEDBACK_READ_LIMITS.identifier),
    sessionId: requireBoundedString(
      input.sessionId,
      FEEDBACK_READ_LIMITS.identifier
    ),
    scores,
    strengths,
    improvements,
    summary: requireBoundedString(input.summary, FEEDBACK_READ_LIMITS.summary),
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    modelVersion: requireBoundedString(
      input.modelVersion,
      FEEDBACK_READ_LIMITS.modelVersion
    ),
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState,
    createdAt: requireDateString(input.createdAt),
    nextPracticeRecommendation: null,
  };
}

function parseLegacyFeedback(
  input: PersistedCompletedFeedback
): FeedbackLegacyView {
  requireExact(input.rubricVersion, LEGACY_FEEDBACK_RUBRIC_VERSION);
  const scores = parseLegacyScores(input);
  // Historical suggestions are validated as persisted input but never cross
  // the customer read boundary.
  parseStringArray(
    input.drills,
    0,
    5,
    FEEDBACK_READ_LIMITS.storedPracticeSuggestion
  );
  return {
    kind: "legacy",
    id: requireBoundedString(input.id, FEEDBACK_READ_LIMITS.identifier),
    sessionId: requireBoundedString(
      input.sessionId,
      FEEDBACK_READ_LIMITS.identifier
    ),
    scores,
    strengths: parseLegacyItems(input.strengths, "strengths"),
    improvements: parseLegacyItems(input.improvements, "improvements"),
    summary: requireBoundedString(input.summary, FEEDBACK_READ_LIMITS.summary),
    rubricVersion: LEGACY_FEEDBACK_RUBRIC_VERSION,
    createdAt: requireDateString(input.createdAt),
    nextPracticeRecommendation: null,
  };
}

function parseLegacyScores(
  input: PersistedCompletedFeedback
): FeedbackScoreView {
  return {
    structure: requireScore(input.structureScore),
    clarity: requireScore(input.clarityScore),
    insight: requireScore(input.insightScore),
    communication: requireScore(input.communicationScore),
    leadership: requireScore(input.leadershipScore),
    // Historical writes stored a separately model-authored overall score.
    // Preserve it as historical data instead of applying the v2 weighting.
    overall: requireNumberInRange(input.overallScore),
  };
}

function parseScores(input: PersistedCompletedFeedback): FeedbackScoreView {
  const dimensionScores: FeedbackV2Scores = {
    structure: requireScore(input.structureScore),
    clarity: requireScore(input.clarityScore),
    insight: requireScore(input.insightScore),
    communication: requireScore(input.communicationScore),
    leadership: requireScore(input.leadershipScore),
  };
  const calculatedOverall = calculateOverallScore(dimensionScores);
  const storedOverall = requireNumberInRange(input.overallScore);
  if (storedOverall !== calculatedOverall) throw new Error("score mismatch");
  return { ...dimensionScores, overall: calculatedOverall };
}

function parseV2Items(
  value: unknown,
  path: string,
  evidenceByTurn: ReadonlyMap<string, string>
): FeedbackV2Item[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    throw new Error(`${path} is invalid`);
  }
  return value.map((entry) => {
    const item = requireRecord(entry);
    requireExactKeys(item, [
      "dimension",
      "observation",
      "transcriptRefs",
      "evidence",
      "nextStep",
      "rubricVersion",
      "confidence",
    ]);
    if (
      typeof item.dimension !== "string" ||
      !DIMENSIONS.has(item.dimension as FeedbackDimension)
    ) {
      throw new Error("dimension is invalid");
    }
    requireExact(item.rubricVersion, FEEDBACK_RUBRIC_VERSION);
    const transcriptRefs = parseStringArray(
      item.transcriptRefs,
      1,
      5,
      FEEDBACK_READ_LIMITS.identifier
    );
    if (new Set(transcriptRefs).size !== transcriptRefs.length) {
      throw new Error("duplicate transcript reference");
    }
    const evidence = parseEvidence(item.evidence, evidenceByTurn);
    const evidenceRefs = new Set(evidence.map((entry) => entry.turnRef));
    if (
      evidenceRefs.size !== transcriptRefs.length ||
      transcriptRefs.some((reference) => !evidenceRefs.has(reference))
    ) {
      throw new Error("evidence references do not match");
    }
    return {
      dimension: item.dimension as FeedbackDimension,
      observation: requireBoundedString(
        item.observation,
        FEEDBACK_READ_LIMITS.findingText
      ),
      transcriptRefs,
      evidence,
      nextStep: requireBoundedString(
        item.nextStep,
        FEEDBACK_READ_LIMITS.findingText
      ),
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      confidence: requireConfidence(item.confidence),
    };
  });
}

function parseEvidence(
  value: unknown,
  evidenceByTurn: ReadonlyMap<string, string>
): FeedbackEvidence[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    throw new Error("evidence is invalid");
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    const record = requireRecord(entry);
    requireExactKeys(record, ["turnRef", "quote"]);
    const turnRef = requireBoundedString(
      record.turnRef,
      FEEDBACK_READ_LIMITS.identifier
    );
    if (seen.has(turnRef)) throw new Error("duplicate evidence reference");
    seen.add(turnRef);
    const quote = requireBoundedString(
      record.quote,
      FEEDBACK_READ_LIMITS.evidenceQuote
    );
    const source = evidenceByTurn.get(turnRef);
    if (source === undefined || !source.includes(quote)) {
      throw new Error("evidence is not grounded in canonical user speech");
    }
    return { turnRef, quote };
  });
}

function parseCanonicalEvidenceTurns(
  turns: readonly PersistedFeedbackEvidenceTurn[]
): ReadonlyMap<string, string> {
  if (turns.length === 0 || turns.length > MAX_PERSISTED_EVIDENCE_TURNS) {
    throw new Error("canonical evidence transcript is invalid");
  }
  const prepared = prepareFeedbackTranscript(
    turns.map((turn) => ({
      eventId: typeof turn.eventId === "string" ? turn.eventId : null,
      speaker: typeof turn.speaker === "string" ? turn.speaker : "",
      text: typeof turn.text === "string" ? turn.text : null,
      contractVersion:
        typeof turn.contractVersion === "number" ? turn.contractVersion : null,
    })),
    { requireContractV2: true }
  );
  if (!prepared.eligible) {
    throw new Error("canonical evidence transcript is invalid");
  }
  const evidenceByTurn = new Map<string, string>();
  for (const turn of prepared.transcript) {
    if (turn.speaker !== "user") {
      throw new Error("evidence transcript contains non-user speech");
    }
    evidenceByTurn.set(turn.eventId, turn.text);
  }
  return evidenceByTurn;
}

function requireUniqueEvidence(items: FeedbackV2Item[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    for (const evidence of item.evidence) {
      const identity = `${evidence.turnRef}\u0000${evidence.quote}`;
      if (seen.has(identity)) throw new Error("duplicate evidence");
      seen.add(identity);
    }
  }
}

function parseLegacyItems(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new Error(`${path} is invalid`);
  }
  return value.map((entry) => {
    if (typeof entry === "string") {
      return requireBoundedString(entry, FEEDBACK_READ_LIMITS.legacyNote);
    }
    const record = requireRecord(entry);
    requireExactKeys(record, [
      "dimension",
      "text",
      "evidence_quote",
      "example",
    ]);
    if (
      record.dimension !== undefined &&
      (typeof record.dimension !== "string" ||
        !DIMENSIONS.has(record.dimension as FeedbackDimension))
    ) {
      throw new Error("legacy dimension is invalid");
    }
    for (const optionalText of [record.evidence_quote, record.example]) {
      if (optionalText !== undefined) {
        requireBoundedString(optionalText, FEEDBACK_READ_LIMITS.legacyNote);
      }
    }
    return requireBoundedString(record.text, FEEDBACK_READ_LIMITS.legacyNote);
  });
}

function hasLegacyVersionTuple(input: PersistedCompletedFeedback): boolean {
  return (
    input.schemaVersion === null &&
    input.promptVersion === null &&
    input.modelVersion === null &&
    input.evaluationState === null
  );
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("record is invalid");
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): void {
  const expected = new Set(keys);
  if (Object.keys(value).some((key) => !expected.has(key))) {
    throw new Error("unknown field");
  }
}

function requireExact(value: unknown, expected: string): void {
  if (value !== expected) throw new Error("version mismatch");
}

function requireBoundedString(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximumLength
  ) {
    throw new Error("string is invalid");
  }
  return value;
}

function parseStringArray(
  value: unknown,
  minimum: number,
  maximum: number,
  maximumStringLength: number
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new Error("string array is invalid");
  }
  return value.map((entry) => requireBoundedString(entry, maximumStringLength));
}

function requireScore(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 10
  ) {
    throw new Error("score is invalid");
  }
  return value;
}

function requireNumberInRange(value: unknown): number {
  if (typeof value === "string") {
    if (
      value.length > FEEDBACK_READ_LIMITS.numericString ||
      !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
    ) {
      throw new Error("number string is invalid");
    }
    value = Number(value);
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 10
  ) {
    throw new Error("number is invalid");
  }
  return value;
}

function requireConfidence(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error("confidence is invalid");
  }
  return value;
}

function requireEvaluationState(value: unknown): FeedbackEvaluationState {
  if (value !== "full" && value !== "partial") {
    throw new Error("evaluation state is invalid");
  }
  return value;
}

function requireDateString(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("date is invalid");
    return value.toISOString();
  }
  const source = requireBoundedString(value, 32);
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) throw new Error("date is invalid");
  const canonical = date.toISOString();
  if (source !== canonical) {
    throw new Error("date must be canonical UTC ISO");
  }
  return canonical;
}
