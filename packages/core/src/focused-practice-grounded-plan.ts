import {
  EVIDENCE_LIMITED_ACTIONS,
  EVIDENCE_LIMITED_ACTION_CODES,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNAL_CODES,
  type EvidenceLimitedActionCode,
  type EvidenceLimitedImprovementSignalCode,
} from "./feedback-evidence-limited";
import {
  FEEDBACK_DIMENSIONS,
  ROUND_DIMENSION_COVERAGE_CONFIG,
} from "./feedback-dimension-coverage";
import type { FeedbackDimension } from "./evaluation";
import {
  FOCUSED_PRACTICE_DURATION_MINUTES,
  FOCUSED_PRACTICE_TEMPLATE_CATALOG,
  type FocusedPracticeSourceQuestion,
} from "./focused-practice-plan";
import { DRILL_TEMPLATE_VERSION } from "./drill-recommendation";
import { ALL_INTERVIEW_TYPES, type RoundType } from "./interview";

export const FOCUSED_PRACTICE_GROUNDED_PLAN_CONTRACT_VERSION =
  "focused-practice-plan.v2" as const;
export const FOCUSED_PRACTICE_GROUNDED_TEMPLATE_VERSION =
  "focused-practice-templates.v2" as const;
export const FOCUSED_PRACTICE_DIMENSION_ACTION_CODE =
  "reinforce_grounded_rubric_move" as const;

export type FocusedPracticeGroundedFocusIdentity =
  | {
      kind: "evidence_limited_improvement";
      dimension: FeedbackDimension;
      signalCode: EvidenceLimitedImprovementSignalCode;
      actionCode: EvidenceLimitedActionCode;
    }
  | {
      kind: "dimension_coverage_focus";
      dimension: FeedbackDimension;
      facetCode: string;
      actionCode: typeof FOCUSED_PRACTICE_DIMENSION_ACTION_CODE;
    };

export interface AvailableFocusedPracticeGroundedPlan {
  readonly state: "available";
  readonly contractVersion: typeof FOCUSED_PRACTICE_GROUNDED_PLAN_CONTRACT_VERSION;
  readonly templateVersion: typeof FOCUSED_PRACTICE_GROUNDED_TEMPLATE_VERSION;
  readonly durationMinutes: typeof FOCUSED_PRACTICE_DURATION_MINUTES;
  readonly templateId: string;
  readonly title: string;
  readonly objective: string;
  readonly instructions: readonly [string, string];
  readonly successCriterion: string;
  readonly selfReviewPrompt: string;
  readonly source: {
    readonly questionId: string;
    readonly questionText: string;
    readonly roundType: RoundType;
    readonly focusDimension: FeedbackDimension;
    readonly focusIdentity: FocusedPracticeGroundedFocusIdentity;
  };
}

export type BuildFocusedPracticeGroundedPlanResult =
  | { state: "available"; plan: AvailableFocusedPracticeGroundedPlan }
  | {
      state: "unavailable";
      reason:
        | "invalid_source_question"
        | "invalid_round"
        | "invalid_focus_identity"
        | "template_not_found";
    };

export function buildFocusedPracticeGroundedPlan(input: {
  sourceQuestion: FocusedPracticeSourceQuestion;
  roundType: RoundType;
  focusIdentity: FocusedPracticeGroundedFocusIdentity;
}): BuildFocusedPracticeGroundedPlanResult {
  const sourceQuestion = parseSourceQuestion(input.sourceQuestion);
  if (!sourceQuestion) {
    return { state: "unavailable", reason: "invalid_source_question" };
  }
  if (!ALL_INTERVIEW_TYPES.includes(input.roundType)) {
    return { state: "unavailable", reason: "invalid_round" };
  }
  const identity = parseFocusIdentity(input.focusIdentity, input.roundType);
  if (!identity) {
    return { state: "unavailable", reason: "invalid_focus_identity" };
  }
  const copy = findTemplateCopy(input.roundType, identity.dimension);
  if (!copy) return { state: "unavailable", reason: "template_not_found" };

  const templateId = groundedTemplateId(input.roundType, identity);
  return {
    state: "available",
    plan: freezePlan({
      state: "available",
      contractVersion: FOCUSED_PRACTICE_GROUNDED_PLAN_CONTRACT_VERSION,
      templateVersion: FOCUSED_PRACTICE_GROUNDED_TEMPLATE_VERSION,
      durationMinutes: FOCUSED_PRACTICE_DURATION_MINUTES,
      templateId,
      title: copy.title,
      objective: copy.objective,
      instructions: [
        "Use only the grounded focus and exact interview evidence selected by Meelni; do not fill in missing context.",
        copy.instructions[1],
      ],
      successCriterion: copy.successCriterion,
      selfReviewPrompt: copy.selfReviewPrompt,
      source: {
        ...sourceQuestion,
        roundType: input.roundType,
        focusDimension: identity.dimension,
        focusIdentity: identity,
      },
    }),
  };
}

export function parseAvailableFocusedPracticeGroundedPlan(
  value: unknown
): AvailableFocusedPracticeGroundedPlan | null {
  if (!isRecord(value) || !hasExactKeys(value, PLAN_KEYS)) return null;
  if (
    value.state !== "available" ||
    value.contractVersion !== FOCUSED_PRACTICE_GROUNDED_PLAN_CONTRACT_VERSION ||
    value.templateVersion !== FOCUSED_PRACTICE_GROUNDED_TEMPLATE_VERSION ||
    value.durationMinutes !== FOCUSED_PRACTICE_DURATION_MINUTES ||
    !isIdentity(value.templateId) ||
    !isBoundedText(value.title, 500) ||
    !isBoundedText(value.objective, 2_000) ||
    !Array.isArray(value.instructions) ||
    value.instructions.length !== 2 ||
    !value.instructions.every((item) => isBoundedText(item, 2_000)) ||
    !isBoundedText(value.successCriterion, 2_000) ||
    !isBoundedText(value.selfReviewPrompt, 2_000) ||
    !isRecord(value.source) ||
    !hasExactKeys(value.source, SOURCE_KEYS)
  ) {
    return null;
  }
  const sourceQuestion = parseSourceQuestion({
    questionId: value.source.questionId as string,
    questionText: value.source.questionText as string,
  });
  if (
    !sourceQuestion ||
    !ALL_INTERVIEW_TYPES.includes(value.source.roundType as RoundType)
  ) {
    return null;
  }
  const roundType = value.source.roundType as RoundType;
  const identity = parseFocusIdentity(value.source.focusIdentity, roundType);
  if (!identity || identity.dimension !== value.source.focusDimension) {
    return null;
  }
  const rebuilt = buildFocusedPracticeGroundedPlan({
    sourceQuestion,
    roundType,
    focusIdentity: identity,
  });
  if (rebuilt.state !== "available") return null;
  return canonicalJson(rebuilt.plan) === canonicalJson(value)
    ? rebuilt.plan
    : null;
}

function parseFocusIdentity(
  value: unknown,
  roundType: RoundType
): FocusedPracticeGroundedFocusIdentity | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "evidence_limited_improvement") {
    if (!hasExactKeys(value, EVIDENCE_LIMITED_IDENTITY_KEYS)) return null;
    if (
      !EVIDENCE_LIMITED_IMPROVEMENT_SIGNAL_CODES.includes(
        value.signalCode as EvidenceLimitedImprovementSignalCode
      ) ||
      !EVIDENCE_LIMITED_ACTION_CODES.includes(
        value.actionCode as EvidenceLimitedActionCode
      )
    ) {
      return null;
    }
    const signalCode = value.signalCode as EvidenceLimitedImprovementSignalCode;
    const actionCode = value.actionCode as EvidenceLimitedActionCode;
    const signal = EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS[signalCode];
    const action = EVIDENCE_LIMITED_ACTIONS[actionCode];
    if (
      signal.dimension !== action.dimension ||
      signal.dimension !== value.dimension
    ) {
      return null;
    }
    return Object.freeze({
      kind: "evidence_limited_improvement" as const,
      dimension: signal.dimension,
      signalCode,
      actionCode,
    });
  }
  if (
    value.kind !== "dimension_coverage_focus" ||
    !hasExactKeys(value, DIMENSION_COVERAGE_IDENTITY_KEYS) ||
    !FEEDBACK_DIMENSIONS.includes(value.dimension as FeedbackDimension) ||
    value.actionCode !== FOCUSED_PRACTICE_DIMENSION_ACTION_CODE ||
    !isIdentity(value.facetCode)
  ) {
    return null;
  }
  const dimension = value.dimension as FeedbackDimension;
  const facet = ROUND_DIMENSION_COVERAGE_CONFIG[roundType][
    dimension
  ].facets.find((candidate) => candidate.code === value.facetCode);
  return facet
    ? Object.freeze({
        kind: "dimension_coverage_focus" as const,
        dimension,
        facetCode: facet.code,
        actionCode: FOCUSED_PRACTICE_DIMENSION_ACTION_CODE,
      })
    : null;
}

function findTemplateCopy(roundType: RoundType, dimension: FeedbackDimension) {
  return FOCUSED_PRACTICE_TEMPLATE_CATALOG[
    [
      "pm-drill",
      DRILL_TEMPLATE_VERSION,
      roundType,
      dimension,
      "grounded_partial",
    ].join(":")
  ];
}

function groundedTemplateId(
  roundType: RoundType,
  identity: FocusedPracticeGroundedFocusIdentity
): string {
  const actionIdentity =
    identity.kind === "evidence_limited_improvement"
      ? `${identity.signalCode}:${identity.actionCode}`
      : `${identity.facetCode}:${identity.actionCode}`;
  return [
    "focused-practice",
    FOCUSED_PRACTICE_GROUNDED_TEMPLATE_VERSION,
    roundType,
    identity.dimension,
    identity.kind,
    actionIdentity,
  ].join(":");
}

function parseSourceQuestion(
  value: FocusedPracticeSourceQuestion
): FocusedPracticeSourceQuestion | null {
  return isRecord(value) &&
    hasExactKeys(value, SOURCE_QUESTION_KEYS) &&
    isIdentity(value.questionId) &&
    isBoundedText(value.questionText, 2_000)
    ? Object.freeze({
        questionId: value.questionId,
        questionText: value.questionText,
      })
    : null;
}

function freezePlan(
  plan: AvailableFocusedPracticeGroundedPlan
): AvailableFocusedPracticeGroundedPlan {
  return Object.freeze({
    ...plan,
    instructions: Object.freeze([...plan.instructions] as [string, string]),
    source: Object.freeze({
      ...plan.source,
      focusIdentity: Object.freeze({ ...plan.source.focusIdentity }),
    }),
  });
}

const PLAN_KEYS = [
  "state",
  "contractVersion",
  "templateVersion",
  "durationMinutes",
  "templateId",
  "title",
  "objective",
  "instructions",
  "successCriterion",
  "selfReviewPrompt",
  "source",
] as const;
const SOURCE_KEYS = [
  "questionId",
  "questionText",
  "roundType",
  "focusDimension",
  "focusIdentity",
] as const;
const SOURCE_QUESTION_KEYS = ["questionId", "questionText"] as const;
const EVIDENCE_LIMITED_IDENTITY_KEYS = [
  "kind",
  "dimension",
  "signalCode",
  "actionCode",
] as const;
const DIMENSION_COVERAGE_IDENTITY_KEYS = [
  "kind",
  "dimension",
  "facetCode",
  "actionCode",
] as const;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}
function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])])
  );
}
function isIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    value.length <= 512 &&
    !CONTROL_CHARACTERS.test(value)
  );
}
function isBoundedText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    !CONTROL_CHARACTERS.test(value)
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
}
