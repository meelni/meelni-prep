import {
  FEEDBACK_RUBRIC_VERSION,
  FeedbackV2ParseError,
  type FeedbackV2Item,
} from "./feedback-v2";
import {
  prepareFeedbackTranscript,
  type FeedbackTranscriptTurn,
} from "./feedback-transcript";

export const FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION =
  "feedback.evidence-limited.v2" as const;
export const FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION =
  "feedback.evidence-limited.selection.v1" as const;
export const FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION =
  "feedback.prompt.evidence-limited.v2" as const;

export const EVIDENCE_LIMITED_STRENGTH_SIGNAL_CODES = [
  "structured_reasoning",
  "clear_recommendation",
  "customer_problem_connection",
  "focused_communication",
  "tradeoff_ownership",
] as const;
export type EvidenceLimitedStrengthSignalCode =
  (typeof EVIDENCE_LIMITED_STRENGTH_SIGNAL_CODES)[number];

export const EVIDENCE_LIMITED_IMPROVEMENT_SIGNAL_CODES = [
  "structure_progression",
  "recommendation_directness",
  "customer_decision_connection",
  "main_point_focus",
  "tradeoff_decision",
] as const;
export type EvidenceLimitedImprovementSignalCode =
  (typeof EVIDENCE_LIMITED_IMPROVEMENT_SIGNAL_CODES)[number];

export const EVIDENCE_LIMITED_ACTION_CODES = [
  "outline_reasoning",
  "lead_with_recommendation",
  "connect_customer_to_decision",
  "state_point_then_support",
  "compare_tradeoffs_and_choose",
] as const;
export type EvidenceLimitedActionCode =
  (typeof EVIDENCE_LIMITED_ACTION_CODES)[number];

type FeedbackDimension = FeedbackV2Item["dimension"];

interface SignalDefinition {
  dimension: FeedbackDimension;
  evaluatorGuidance: string;
  observation: string;
}

interface ActionDefinition {
  dimension: FeedbackDimension;
  evaluatorGuidance: string;
  nextStep: string;
}

export const EVIDENCE_LIMITED_STRENGTH_SIGNALS: Readonly<
  Record<EvidenceLimitedStrengthSignalCode, SignalDefinition>
> = {
  structured_reasoning: {
    dimension: "structure",
    evaluatorGuidance:
      "The answer presents an organized reasoning path or coherent progression.",
    observation:
      "The recorded answer uses an organized line of reasoning that makes the approach easier to follow.",
  },
  clear_recommendation: {
    dimension: "clarity",
    evaluatorGuidance:
      "The answer communicates a clear recommendation or point of view.",
    observation:
      "The recorded answer communicates a clear recommendation or point of view.",
  },
  customer_problem_connection: {
    dimension: "insight",
    evaluatorGuidance:
      "The answer connects a product decision to a customer problem or need.",
    observation:
      "The recorded answer connects the product decision to a customer problem or need.",
  },
  focused_communication: {
    dimension: "communication",
    evaluatorGuidance:
      "The answer presents its main idea in a focused and understandable way.",
    observation:
      "The recorded answer presents the main idea in a focused and understandable way.",
  },
  tradeoff_ownership: {
    dimension: "leadership",
    evaluatorGuidance:
      "The answer takes ownership of a decision or product tradeoff.",
    observation:
      "The recorded answer takes ownership of a decision or product tradeoff.",
  },
} as const;

export const EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS: Readonly<
  Record<EvidenceLimitedImprovementSignalCode, SignalDefinition>
> = {
  structure_progression: {
    dimension: "structure",
    evaluatorGuidance:
      "The answer would benefit from a clearer progression from framing to recommendation.",
    observation:
      "The recorded answer would be stronger with a more explicit progression from framing to recommendation.",
  },
  recommendation_directness: {
    dimension: "clarity",
    evaluatorGuidance:
      "The recommendation or its rationale could be stated more directly.",
    observation:
      "The recorded answer would be stronger if the recommendation and rationale were stated more directly.",
  },
  customer_decision_connection: {
    dimension: "insight",
    evaluatorGuidance:
      "The customer evidence needs a clearer connection to the product decision.",
    observation:
      "The recorded answer would be stronger with a deeper connection between customer evidence and the product decision.",
  },
  main_point_focus: {
    dimension: "communication",
    evaluatorGuidance:
      "The main point and supporting detail need a clearer distinction.",
    observation:
      "The recorded answer would be stronger with a tighter distinction between the main point and supporting detail.",
  },
  tradeoff_decision: {
    dimension: "leadership",
    evaluatorGuidance:
      "The tradeoff needs a clearer decision and ownership of the choice.",
    observation:
      "The recorded answer would be stronger with a clearer tradeoff decision and ownership of the choice.",
  },
} as const;

export const EVIDENCE_LIMITED_ACTIONS: Readonly<
  Record<EvidenceLimitedActionCode, ActionDefinition>
> = {
  outline_reasoning: {
    dimension: "structure",
    evaluatorGuidance:
      "Practice an explicit path from framing through analysis to recommendation.",
    nextStep:
      "In focused practice, outline the framing, analysis, and recommendation before answering.",
  },
  lead_with_recommendation: {
    dimension: "clarity",
    evaluatorGuidance:
      "Practice stating the recommendation before explaining its rationale.",
    nextStep:
      "In focused practice, lead with the recommendation and connect each reason back to it.",
  },
  connect_customer_to_decision: {
    dimension: "insight",
    evaluatorGuidance:
      "Practice connecting the target customer and need to the product decision.",
    nextStep:
      "In focused practice, name the target customer, their need, and why it changes the product decision.",
  },
  state_point_then_support: {
    dimension: "communication",
    evaluatorGuidance:
      "Practice stating the main point before adding supporting detail.",
    nextStep:
      "In focused practice, state the main point first, then add only the support needed to explain it.",
  },
  compare_tradeoffs_and_choose: {
    dimension: "leadership",
    evaluatorGuidance:
      "Practice comparing tradeoffs, choosing a direction, and owning the next move.",
    nextStep:
      "In focused practice, compare the tradeoffs, choose a direction, and state what you would do next.",
  },
} as const;

export const EVIDENCE_LIMITED_SUMMARY =
  "This review highlights a grounded PM signal and a focused way to strengthen the next answer." as const;
export const EVIDENCE_LIMITED_CONFIDENCE = 0.65 as const;

export interface EvidenceLimitedFeedbackSelectionItem<
  TSignalCode extends string,
> {
  signalCode: TSignalCode;
  actionCode: EvidenceLimitedActionCode;
  transcriptRef: string;
}

export interface EvidenceLimitedFeedbackProviderSelection {
  schemaVersion: typeof FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION;
  promptVersion: typeof FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION;
  rubricVersion: typeof FEEDBACK_RUBRIC_VERSION;
  evaluationState: "partial";
  strengths: EvidenceLimitedFeedbackSelectionItem<EvidenceLimitedStrengthSignalCode>[];
  improvements: EvidenceLimitedFeedbackSelectionItem<EvidenceLimitedImprovementSignalCode>[];
}

interface EvidenceLimitedFeedbackItemBase extends FeedbackV2Item {
  actionCode: EvidenceLimitedActionCode;
}

export interface EvidenceLimitedStrengthItem
  extends EvidenceLimitedFeedbackItemBase {
  signalCode: EvidenceLimitedStrengthSignalCode;
}

export interface EvidenceLimitedImprovementItem
  extends EvidenceLimitedFeedbackItemBase {
  signalCode: EvidenceLimitedImprovementSignalCode;
}

export interface EvidenceLimitedFeedbackResult {
  schemaVersion: typeof FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION;
  promptVersion: typeof FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION;
  modelVersion: string;
  rubricVersion: typeof FEEDBACK_RUBRIC_VERSION;
  evaluationState: "partial";
  strengths: EvidenceLimitedStrengthItem[];
  improvements: EvidenceLimitedImprovementItem[];
  summary: typeof EVIDENCE_LIMITED_SUMMARY;
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
  const root = requireRecord(value, "response_not_object");
  requireExactKeys(root, [
    "schemaVersion",
    "promptVersion",
    "rubricVersion",
    "evaluationState",
    "strengths",
    "improvements",
  ]);
  requireExact(
    root.schemaVersion,
    FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION,
    "schema_version_mismatch"
  );
  requireExact(
    root.promptVersion,
    FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    "prompt_version_mismatch"
  );
  requireExact(
    root.rubricVersion,
    FEEDBACK_RUBRIC_VERSION,
    "rubric_version_mismatch"
  );
  requireExact(root.evaluationState, "partial", "evaluation_state_mismatch");

  const transcriptById = prepareEvidenceTranscript(options.transcript);
  const strengths = parseProviderSelections(
    root.strengths,
    "strength",
    transcriptById
  );
  const improvements = parseProviderSelections(
    root.improvements,
    "improvement",
    transcriptById
  );
  requireTotalFindingCount(strengths.length + improvements.length);

  return {
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    modelVersion: requireString(
      options.modelVersion,
      256,
      "model_version_invalid"
    ),
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "partial",
    strengths,
    improvements,
    summary: EVIDENCE_LIMITED_SUMMARY,
  };
}

export function parsePersistedEvidenceLimitedFeedback(
  value: unknown,
  options: {
    transcript: FeedbackTranscriptTurn[];
    modelVersion: string;
  }
): EvidenceLimitedFeedbackResult {
  const root = requireRecord(value, "response_not_object");
  requireExactKeys(root, [
    "schemaVersion",
    "promptVersion",
    "rubricVersion",
    "evaluationState",
    "strengths",
    "improvements",
    "summary",
  ]);
  requireExact(
    root.schemaVersion,
    FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    "schema_version_mismatch"
  );
  requireExact(
    root.promptVersion,
    FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    "prompt_version_mismatch"
  );
  requireExact(
    root.rubricVersion,
    FEEDBACK_RUBRIC_VERSION,
    "rubric_version_mismatch"
  );
  requireExact(root.evaluationState, "partial", "evaluation_state_mismatch");
  requireExact(root.summary, EVIDENCE_LIMITED_SUMMARY, "summary_invalid");

  const transcriptById = prepareEvidenceTranscript(options.transcript);
  const strengths = parsePersistedFindings(
    root.strengths,
    "strength",
    transcriptById
  );
  const improvements = parsePersistedFindings(
    root.improvements,
    "improvement",
    transcriptById
  );
  requireTotalFindingCount(strengths.length + improvements.length);

  return {
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    modelVersion: requireString(
      options.modelVersion,
      256,
      "model_version_invalid"
    ),
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "partial",
    strengths,
    improvements,
    summary: EVIDENCE_LIMITED_SUMMARY,
  };
}

export function hasServerOwnedEvidenceLimitedContent(value: {
  strengths: unknown;
  improvements: unknown;
  summary: unknown;
}): boolean {
  try {
    requireExact(value.summary, EVIDENCE_LIMITED_SUMMARY, "summary_invalid");
    const strengths = parsePersistedFindings(
      value.strengths,
      "strength",
      undefined
    );
    const improvements = parsePersistedFindings(
      value.improvements,
      "improvement",
      undefined
    );
    requireTotalFindingCount(strengths.length + improvements.length);
    return true;
  } catch {
    return false;
  }
}

function prepareEvidenceTranscript(
  transcript: FeedbackTranscriptTurn[]
): ReadonlyMap<string, FeedbackTranscriptTurn> {
  const prepared = prepareFeedbackTranscript(transcript);
  if (!prepared.eligible || prepared.transcript.length === 0) {
    throw new FeedbackV2ParseError(
      "canonical_transcript_empty",
      "evidence-limited transcript is not trustworthy"
    );
  }
  return new Map(prepared.transcript.map((turn) => [turn.eventId, turn]));
}

function parseProviderSelections(
  value: unknown,
  kind: "strength",
  transcriptById: ReadonlyMap<string, FeedbackTranscriptTurn>
): EvidenceLimitedStrengthItem[];
function parseProviderSelections(
  value: unknown,
  kind: "improvement",
  transcriptById: ReadonlyMap<string, FeedbackTranscriptTurn>
): EvidenceLimitedImprovementItem[];
function parseProviderSelections(
  value: unknown,
  kind: "strength" | "improvement",
  transcriptById: ReadonlyMap<string, FeedbackTranscriptTurn>
): Array<EvidenceLimitedStrengthItem | EvidenceLimitedImprovementItem> {
  const selections = requireFindingArray(value);
  const seenRefs = new Set<string>();
  return selections.map((entry) => {
    const selection = requireRecord(entry, "finding_not_object");
    requireExactKeys(selection, ["signalCode", "actionCode", "transcriptRef"]);
    const signalCode = requireSignalCode(selection.signalCode, kind);
    const signal = getSignalDefinition(kind, signalCode);
    const actionCode = requireActionCode(selection.actionCode);
    const action = EVIDENCE_LIMITED_ACTIONS[actionCode];
    if (action.dimension !== signal.dimension) {
      throw new FeedbackV2ParseError(
        "finding_dimension_invalid",
        "evidence-limited signal and action dimensions must match"
      );
    }
    const transcriptRef = requireString(
      selection.transcriptRef,
      512,
      "evidence_turn_ref_invalid"
    );
    requireUniqueReference(transcriptRef, seenRefs);
    const turn = requireCandidateTurn(transcriptRef, transcriptById);
    return {
      signalCode,
      actionCode,
      dimension: signal.dimension,
      observation: signal.observation,
      transcriptRefs: [transcriptRef],
      evidence: [{ turnRef: transcriptRef, quote: turn.text }],
      nextStep: action.nextStep,
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      confidence: EVIDENCE_LIMITED_CONFIDENCE,
    };
  });
}

function parsePersistedFindings(
  value: unknown,
  kind: "strength",
  transcriptById?: ReadonlyMap<string, FeedbackTranscriptTurn>
): EvidenceLimitedStrengthItem[];
function parsePersistedFindings(
  value: unknown,
  kind: "improvement",
  transcriptById?: ReadonlyMap<string, FeedbackTranscriptTurn>
): EvidenceLimitedImprovementItem[];
function parsePersistedFindings(
  value: unknown,
  kind: "strength" | "improvement",
  transcriptById?: ReadonlyMap<string, FeedbackTranscriptTurn>
): Array<EvidenceLimitedStrengthItem | EvidenceLimitedImprovementItem> {
  const findings = requireFindingArray(value);
  const seenRefs = new Set<string>();
  return findings.map((entry) => {
    const finding = requireRecord(entry, "finding_not_object");
    requireExactKeys(finding, [
      "signalCode",
      "actionCode",
      "dimension",
      "observation",
      "transcriptRefs",
      "evidence",
      "nextStep",
      "rubricVersion",
      "confidence",
    ]);
    const signalCode = requireSignalCode(finding.signalCode, kind);
    const signal = getSignalDefinition(kind, signalCode);
    const actionCode = requireActionCode(finding.actionCode);
    const action = EVIDENCE_LIMITED_ACTIONS[actionCode];
    requireExact(
      finding.dimension,
      signal.dimension,
      "finding_dimension_invalid"
    );
    if (action.dimension !== signal.dimension) {
      throw new FeedbackV2ParseError(
        "finding_dimension_invalid",
        "evidence-limited signal and action dimensions must match"
      );
    }
    requireExact(
      finding.observation,
      signal.observation,
      "finding_text_invalid"
    );
    requireExact(finding.nextStep, action.nextStep, "finding_text_invalid");
    requireExact(
      finding.rubricVersion,
      FEEDBACK_RUBRIC_VERSION,
      "finding_rubric_version_mismatch"
    );
    if (finding.confidence !== EVIDENCE_LIMITED_CONFIDENCE) {
      throw new FeedbackV2ParseError(
        "confidence_invalid",
        "evidence-limited confidence must be server owned"
      );
    }
    const transcriptRef = requireSingleTranscriptRef(finding.transcriptRefs);
    requireUniqueReference(transcriptRef, seenRefs);
    const evidence = requireSingleEvidence(finding.evidence, transcriptRef);
    if (transcriptById) {
      const turn = requireCandidateTurn(transcriptRef, transcriptById);
      requireExact(evidence.quote, turn.text, "evidence_quote_not_grounded");
    }
    return {
      signalCode,
      actionCode,
      dimension: signal.dimension,
      observation: signal.observation,
      transcriptRefs: [transcriptRef],
      evidence: [{ turnRef: transcriptRef, quote: evidence.quote }],
      nextStep: action.nextStep,
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      confidence: EVIDENCE_LIMITED_CONFIDENCE,
    };
  });
}

function requireFindingArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new FeedbackV2ParseError(
      "findings_count_invalid",
      "evidence-limited strengths and improvements require one or two selections"
    );
  }
  return value;
}

function requireTotalFindingCount(count: number): void {
  if (count < 2 || count > 3) {
    throw new FeedbackV2ParseError(
      "findings_count_invalid",
      "evidence-limited feedback requires two or three total selections"
    );
  }
}

function requireSignalCode(
  value: unknown,
  kind: "strength"
): EvidenceLimitedStrengthSignalCode;
function requireSignalCode(
  value: unknown,
  kind: "improvement"
): EvidenceLimitedImprovementSignalCode;
function requireSignalCode(
  value: unknown,
  kind: "strength" | "improvement"
): EvidenceLimitedStrengthSignalCode | EvidenceLimitedImprovementSignalCode;
function requireSignalCode(
  value: unknown,
  kind: "strength" | "improvement"
): EvidenceLimitedStrengthSignalCode | EvidenceLimitedImprovementSignalCode {
  const allowed =
    kind === "strength"
      ? EVIDENCE_LIMITED_STRENGTH_SIGNAL_CODES
      : EVIDENCE_LIMITED_IMPROVEMENT_SIGNAL_CODES;
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw new FeedbackV2ParseError(
      "finding_text_invalid",
      `unknown evidence-limited ${kind} signal code`
    );
  }
  return value as
    | EvidenceLimitedStrengthSignalCode
    | EvidenceLimitedImprovementSignalCode;
}

function getSignalDefinition(
  kind: "strength",
  code: EvidenceLimitedStrengthSignalCode
): SignalDefinition;
function getSignalDefinition(
  kind: "improvement",
  code: EvidenceLimitedImprovementSignalCode
): SignalDefinition;
function getSignalDefinition(
  kind: "strength" | "improvement",
  code: EvidenceLimitedStrengthSignalCode | EvidenceLimitedImprovementSignalCode
): SignalDefinition;
function getSignalDefinition(
  kind: "strength" | "improvement",
  code: EvidenceLimitedStrengthSignalCode | EvidenceLimitedImprovementSignalCode
): SignalDefinition {
  return kind === "strength"
    ? EVIDENCE_LIMITED_STRENGTH_SIGNALS[
        code as EvidenceLimitedStrengthSignalCode
      ]
    : EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS[
        code as EvidenceLimitedImprovementSignalCode
      ];
}

function requireActionCode(value: unknown): EvidenceLimitedActionCode {
  if (
    typeof value !== "string" ||
    !(EVIDENCE_LIMITED_ACTION_CODES as readonly string[]).includes(value)
  ) {
    throw new FeedbackV2ParseError(
      "finding_text_invalid",
      "unknown evidence-limited action code"
    );
  }
  return value as EvidenceLimitedActionCode;
}

function requireUniqueReference(value: string, seen: Set<string>): void {
  if (seen.has(value)) {
    throw new FeedbackV2ParseError(
      "transcript_refs_duplicate",
      "evidence-limited references must be unique within each selection array"
    );
  }
  seen.add(value);
}

function requireCandidateTurn(
  transcriptRef: string,
  transcriptById: ReadonlyMap<string, FeedbackTranscriptTurn>
): FeedbackTranscriptTurn {
  const turn = transcriptById.get(transcriptRef);
  if (!turn) {
    throw new FeedbackV2ParseError(
      "evidence_turn_ref_not_found",
      "evidence-limited transcript reference was not found"
    );
  }
  if (turn.speaker !== "user") {
    throw new FeedbackV2ParseError(
      "evidence_turn_ref_wrong_speaker",
      "evidence-limited references must cite candidate turns"
    );
  }
  return turn;
}

function requireSingleTranscriptRef(value: unknown): string {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new FeedbackV2ParseError(
      "transcript_refs_invalid",
      "evidence-limited persisted finding requires one transcript reference"
    );
  }
  return requireString(value[0], 512, "evidence_turn_ref_invalid");
}

function requireSingleEvidence(
  value: unknown,
  transcriptRef: string
): { turnRef: string; quote: string } {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new FeedbackV2ParseError(
      "evidence_count_invalid",
      "evidence-limited persisted finding requires one citation"
    );
  }
  const evidence = requireRecord(value[0], "evidence_not_object");
  requireExactKeys(evidence, ["turnRef", "quote"]);
  requireExact(
    evidence.turnRef,
    transcriptRef,
    "evidence_reference_set_mismatch"
  );
  return {
    turnRef: transcriptRef,
    quote: requireString(evidence.quote, 20_000, "evidence_quote_invalid"),
  };
}

function requireRecord(
  value: unknown,
  code: "response_not_object" | "finding_not_object" | "evidence_not_object"
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FeedbackV2ParseError(
      code,
      "evidence-limited value is not an object"
    );
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
    throw new FeedbackV2ParseError(
      "response_unknown_field",
      "evidence-limited fields are invalid"
    );
  }
}

function requireExact(
  value: unknown,
  expected: string,
  code:
    | "schema_version_mismatch"
    | "prompt_version_mismatch"
    | "rubric_version_mismatch"
    | "evaluation_state_mismatch"
    | "finding_dimension_invalid"
    | "finding_text_invalid"
    | "finding_rubric_version_mismatch"
    | "evidence_reference_set_mismatch"
    | "evidence_quote_not_grounded"
    | "summary_invalid"
): void {
  if (value !== expected) {
    throw new FeedbackV2ParseError(
      code,
      "evidence-limited exact value mismatch"
    );
  }
}

function requireString(
  value: unknown,
  maximum: number,
  code:
    | "model_version_invalid"
    | "evidence_turn_ref_invalid"
    | "evidence_quote_invalid"
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum
  ) {
    throw new FeedbackV2ParseError(code, "evidence-limited string is invalid");
  }
  return value;
}
