import {
  DRILL_RECOMMENDATION_CONTRACT_VERSION,
  DRILL_RECOMMENDATION_UNAVAILABLE_REASONS,
  DRILL_TEMPLATE_VERSION,
  type DrillEvidenceGap,
  type DrillRecommendation,
  type RecommendedDrill,
} from "./drill-recommendation";
import type { FeedbackDimension } from "./evaluation";
import { ALL_INTERVIEW_TYPES, type RoundType } from "./interview";

export const FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION =
  "focused-practice-plan.v1" as const;
export const FOCUSED_PRACTICE_TEMPLATE_VERSION =
  "focused-practice-templates.v1" as const;
export const FOCUSED_PRACTICE_DURATION_MINUTES = 5 as const;

export const FOCUSED_PRACTICE_PLAN_UNAVAILABLE_REASONS = [
  "invalid_source_question",
  "source_recommendation_unavailable",
  "unsupported_recommendation_contract",
  "unsupported_recommendation_template",
  "invalid_recommendation",
  "template_not_found",
] as const;

export type FocusedPracticePlanUnavailableReason =
  (typeof FOCUSED_PRACTICE_PLAN_UNAVAILABLE_REASONS)[number];

export interface FocusedPracticeSourceQuestion {
  questionId: string;
  questionText: string;
}

export interface FocusedPracticePlanInput {
  /** Trusted in-process output from recommendDrill; never deserialize this from a client. */
  recommendation: DrillRecommendation;
  sourceQuestion: FocusedPracticeSourceQuestion;
}

export interface FocusedPracticeTemplate {
  readonly templateId: string;
  readonly version: typeof FOCUSED_PRACTICE_TEMPLATE_VERSION;
  readonly roundType: RoundType;
  readonly focusDimension: FeedbackDimension;
  readonly evidenceGap: DrillEvidenceGap;
  readonly title: string;
  readonly objective: string;
  readonly instructions: readonly [string, string];
  readonly successCriterion: string;
  readonly selfReviewPrompt: string;
}

export interface AvailableFocusedPracticePlan {
  readonly state: "available";
  readonly contractVersion: typeof FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION;
  readonly templateVersion: typeof FOCUSED_PRACTICE_TEMPLATE_VERSION;
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
    readonly recommendationId: string;
    readonly roundType: RoundType;
    readonly focusDimension: FeedbackDimension;
    readonly evidenceGap: DrillEvidenceGap;
    readonly transcriptRefs: readonly string[];
    readonly confidence: number;
  };
}

export interface UnavailableFocusedPracticePlan {
  readonly state: "unavailable";
  readonly contractVersion: typeof FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION;
  readonly templateVersion: typeof FOCUSED_PRACTICE_TEMPLATE_VERSION;
  readonly reason: FocusedPracticePlanUnavailableReason;
}

export type FocusedPracticePlan =
  | AvailableFocusedPracticePlan
  | UnavailableFocusedPracticePlan;

const DIMENSIONS = [
  "structure",
  "clarity",
  "insight",
  "communication",
  "leadership",
] as const satisfies readonly FeedbackDimension[];

const EVIDENCE_GAPS = [
  "grounded_full",
  "grounded_partial",
] as const satisfies readonly DrillEvidenceGap[];

const ROUND_INSTRUCTIONS = {
  product_sense:
    "Revise the part that connects the chosen user and problem to a clear product decision.",
  execution:
    "Revise the part that connects the metric or diagnosis to a clear operating decision.",
  behavioral:
    "Revise the part that explains your own action, influence, and result.",
  strategy:
    "Revise the part that compares strategic options and commits to a clear choice.",
} as const satisfies Record<RoundType, string>;

interface FocusedPracticeTemplateCopy {
  title: string;
  objective: string;
  successCriterion: string;
  selfReviewPrompt: string;
}

const ROUND_DIMENSION_TEMPLATES = {
  product_sense: {
    structure: {
      title: "Strengthen the Product Sense structure",
      objective:
        "Connect the user goal, problem, solution choice, and prioritization in a clear sequence.",
      successCriterion:
        "The revision moves from one target user and problem to a prioritized solution with an explicit product rationale.",
      selfReviewPrompt:
        "Can a listener follow the path from target user to problem, solution, and priority without filling in a missing step?",
    },
    clarity: {
      title: "Make the product decision clearer",
      objective:
        "State one target user, one core problem, and the product choice that addresses it.",
      successCriterion:
        "The revision names the target user, defines the core problem precisely, and commits to one product choice.",
      selfReviewPrompt:
        "Are the target user, core problem, and product choice each explicit and consistent?",
    },
    insight: {
      title: "Deepen the user insight",
      objective:
        "Connect a specific user behavior or unmet need to the product decision it changes.",
      successCriterion:
        "The revision names one specific user insight, explains why it matters, and shows how it changes the product choice.",
      selfReviewPrompt:
        "Does the user insight change the product decision rather than merely describe the audience?",
    },
    communication: {
      title: "Make the product answer more direct",
      objective:
        "Lead with the chosen user and product direction, then include only the reasoning needed to support them.",
      successCriterion:
        "The opening identifies the chosen user and product direction, and each supporting point advances that choice.",
      selfReviewPrompt:
        "Would a listener understand the intended user and product direction in the opening sentences?",
    },
    leadership: {
      title: "Strengthen product judgment",
      objective:
        "Make the prioritization tradeoff explicit and show how you would align stakeholders around it.",
      successCriterion:
        "The revision names one tradeoff, commits to a priority, and explains how stakeholder concerns would be addressed.",
      selfReviewPrompt:
        "Does the answer show a defensible priority and a credible way to align the people affected by it?",
    },
  },
  execution: {
    structure: {
      title: "Strengthen the Execution structure",
      objective:
        "Move from the goal to a primary metric, diagnosis, and operating decision in a clear sequence.",
      successCriterion:
        "The revision defines the goal, selects one primary metric with guardrails, and connects the diagnosis to an action.",
      selfReviewPrompt:
        "Can a listener follow the path from goal to metric, diagnosis, and action without a missing link?",
    },
    clarity: {
      title: "Make the metric decision clearer",
      objective:
        "Choose one primary metric and state the threshold or signal that would trigger action.",
      successCriterion:
        "The revision names one primary metric, defines what movement matters, and states the action that follows.",
      selfReviewPrompt:
        "Are the primary metric, meaningful signal, and resulting action all explicit?",
    },
    insight: {
      title: "Deepen the execution insight",
      objective:
        "Interpret a metric or operating signal and connect it to a testable cause and decision.",
      successCriterion:
        "The revision explains what one signal suggests, names a testable hypothesis, and identifies the decision the result would change.",
      selfReviewPrompt:
        "Does the answer interpret the signal and change a decision instead of only listing metrics?",
    },
    communication: {
      title: "Make the execution answer more direct",
      objective:
        "Lead with the diagnosis or operating choice, then use only the metrics needed to support it.",
      successCriterion:
        "The opening states the diagnosis or action, and each cited metric has a clear role in supporting that choice.",
      selfReviewPrompt:
        "Would a listener know the diagnosis or next action before hearing the supporting metric detail?",
    },
    leadership: {
      title: "Clarify execution ownership",
      objective:
        "Show who owns the decision, how teams align on tradeoffs, and how follow-through will be measured.",
      successCriterion:
        "The revision assigns decision ownership, names one cross-functional tradeoff, and defines how progress will be reviewed.",
      selfReviewPrompt:
        "Does the answer make ownership, alignment, and follow-through concrete?",
    },
  },
  behavioral: {
    structure: {
      title: "Strengthen the story structure",
      objective:
        "Organize the story around the situation, your responsibility, your actions, and the result or learning.",
      successCriterion:
        "The revision gives only the context needed, distinguishes your actions, and closes with a specific result or learning.",
      selfReviewPrompt:
        "Can a listener identify the situation, your responsibility, your actions, and the result or learning?",
    },
    clarity: {
      title: "Make your role clearer",
      objective:
        "Separate your decision and actions from the team's work and state the outcome precisely.",
      successCriterion:
        "The revision names your responsibility, the decision you made, the actions you took, and the resulting change.",
      selfReviewPrompt:
        "Is it unmistakable what you personally decided, did, and changed?",
    },
    insight: {
      title: "Deepen the reflection",
      objective:
        "Explain the cause or tradeoff you recognized and how the lesson changed your later behavior.",
      successCriterion:
        "The revision identifies one non-obvious cause or tradeoff, names the lesson, and gives a concrete later application.",
      selfReviewPrompt:
        "Does the reflection show what you learned and how it changed a later action?",
    },
    communication: {
      title: "Make the story more direct",
      objective:
        "Reduce background detail so your actions and the outcome remain central.",
      successCriterion:
        "The revision keeps context brief, gives the most detail to your actions, and ends with a specific outcome.",
      selfReviewPrompt:
        "Would a listener remember your actions and outcome rather than the setup?",
    },
    leadership: {
      title: "Clarify ownership and influence",
      objective:
        "Show the decision you owned, how you influenced others, and what changed as a result.",
      successCriterion:
        "The revision distinguishes your action from the team's work, explains how you influenced a stakeholder, and states the result or learning.",
      selfReviewPrompt:
        "Does the story make your ownership, influence, and resulting change unmistakable?",
    },
  },
  strategy: {
    structure: {
      title: "Strengthen the Strategy structure",
      objective:
        "Connect the objective, strategic options, decision criteria, recommendation, and risks in a clear sequence.",
      successCriterion:
        "The revision compares at least two options against explicit criteria, recommends one, and names a material risk.",
      selfReviewPrompt:
        "Can a listener see how the objective and criteria lead to the recommendation and its main risk?",
    },
    clarity: {
      title: "Make the strategic choice clearer",
      objective:
        "State one strategic choice, its time horizon, and the primary reason it wins.",
      successCriterion:
        "The revision commits to one strategic choice, defines the relevant horizon, and gives one decisive reason.",
      selfReviewPrompt:
        "Are the strategic choice, time horizon, and decisive reason explicit?",
    },
    insight: {
      title: "Deepen the strategic insight",
      objective:
        "Connect a specific market, customer, or competitive insight to the strategic choice it changes.",
      successCriterion:
        "The revision names one specific strategic insight, explains its implication, and shows how it changes the chosen option.",
      selfReviewPrompt:
        "Does the insight change the strategic choice rather than only describe the market?",
    },
    communication: {
      title: "Make the strategy answer more direct",
      objective:
        "Lead with the recommendation, then support it with the decisive rationale, tradeoff, and risk.",
      successCriterion:
        "The opening states the recommendation, and the remaining points explain its decisive rationale, main tradeoff, and material risk.",
      selfReviewPrompt:
        "Would a listener know the recommendation before hearing the supporting analysis?",
    },
    leadership: {
      title: "Clarify strategic ownership",
      objective:
        "Show how you would align stakeholders on the choice, decision rights, and evidence that could change course.",
      successCriterion:
        "The revision names the decision owner, one stakeholder tension, an alignment approach, and a signal that would trigger reconsideration.",
      selfReviewPrompt:
        "Does the answer make decision ownership, stakeholder alignment, and adaptation criteria concrete?",
    },
  },
} as const satisfies Record<
  RoundType,
  Record<FeedbackDimension, FocusedPracticeTemplateCopy>
>;

export const FOCUSED_PRACTICE_TEMPLATE_CATALOG = createTemplateCatalog();

export function buildFocusedPracticePlan(
  input: FocusedPracticePlanInput
): FocusedPracticePlan {
  const sourceQuestion = parseSourceQuestion(input.sourceQuestion);
  if (!sourceQuestion) return unavailable("invalid_source_question");

  const recommendation = input.recommendation;
  if (!isRecord(recommendation)) return unavailable("invalid_recommendation");
  if (typeof recommendation.contractVersion !== "string") {
    return unavailable("invalid_recommendation");
  }
  if (
    recommendation.contractVersion !== DRILL_RECOMMENDATION_CONTRACT_VERSION
  ) {
    return unavailable("unsupported_recommendation_contract");
  }
  if (typeof recommendation.templateVersion !== "string") {
    return unavailable("invalid_recommendation");
  }
  if (recommendation.templateVersion !== DRILL_TEMPLATE_VERSION) {
    return unavailable("unsupported_recommendation_template");
  }
  if (recommendation.state === "unavailable") {
    return isExactUnavailableRecommendation(recommendation)
      ? unavailable("source_recommendation_unavailable")
      : unavailable("invalid_recommendation");
  }
  if (!isExactRecommendedDrill(recommendation)) {
    return unavailable("invalid_recommendation");
  }

  const template = FOCUSED_PRACTICE_TEMPLATE_CATALOG[recommendation.drillId];
  if (!template) return unavailable("template_not_found");

  return freezePlan({
    state: "available",
    contractVersion: FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION,
    templateVersion: FOCUSED_PRACTICE_TEMPLATE_VERSION,
    durationMinutes: FOCUSED_PRACTICE_DURATION_MINUTES,
    templateId: template.templateId,
    title: template.title,
    objective: template.objective,
    instructions: [...template.instructions],
    successCriterion: template.successCriterion,
    selfReviewPrompt: template.selfReviewPrompt,
    source: {
      ...sourceQuestion,
      recommendationId: recommendation.drillId,
      roundType: recommendation.roundType,
      focusDimension: recommendation.weakestDimension,
      evidenceGap: recommendation.evidenceGap,
      transcriptRefs: [...recommendation.sourceFinding.transcriptRefs],
      confidence: recommendation.sourceFinding.confidence,
    },
  });
}

function createTemplateCatalog(): Readonly<
  Record<string, FocusedPracticeTemplate>
> {
  const entries: Array<[string, FocusedPracticeTemplate]> = [];
  for (const roundType of ALL_INTERVIEW_TYPES) {
    for (const focusDimension of DIMENSIONS) {
      for (const evidenceGap of EVIDENCE_GAPS) {
        const sourceId = sourceRecommendationId(
          roundType,
          focusDimension,
          evidenceGap
        );
        const dimension = ROUND_DIMENSION_TEMPLATES[roundType][focusDimension];
        const evidenceInstruction =
          evidenceGap === "grounded_partial"
            ? "Use only the recorded portion and the cited feedback; do not fill in missing parts of the interview."
            : "Use the cited feedback from the completed interview to choose the part of the answer to revise.";
        entries.push([
          sourceId,
          Object.freeze({
            templateId: [
              "focused-practice",
              FOCUSED_PRACTICE_TEMPLATE_VERSION,
              roundType,
              focusDimension,
              evidenceGap,
            ].join(":"),
            version: FOCUSED_PRACTICE_TEMPLATE_VERSION,
            roundType,
            focusDimension,
            evidenceGap,
            title: dimension.title,
            objective: dimension.objective,
            instructions: Object.freeze([
              evidenceInstruction,
              ROUND_INSTRUCTIONS[roundType],
            ] as [string, string]),
            successCriterion: dimension.successCriterion,
            selfReviewPrompt: dimension.selfReviewPrompt,
          }),
        ]);
      }
    }
  }
  return Object.freeze(Object.fromEntries(entries));
}

function sourceRecommendationId(
  roundType: RoundType,
  dimension: FeedbackDimension,
  evidenceGap: DrillEvidenceGap
): string {
  return [
    "pm-drill",
    DRILL_TEMPLATE_VERSION,
    roundType,
    dimension,
    evidenceGap,
  ].join(":");
}

const RECOMMENDED_KEYS = [
  "state",
  "contractVersion",
  "templateVersion",
  "drillId",
  "roundType",
  "weakestDimension",
  "weakestScore",
  "tiedDimensions",
  "evidenceGap",
  "sourceFinding",
] as const;
const SOURCE_FINDING_KEYS = ["transcriptRefs", "confidence"] as const;
const UNAVAILABLE_KEYS = [
  "state",
  "contractVersion",
  "templateVersion",
  "reason",
] as const;

function isExactRecommendedDrill(
  value: Record<string, unknown>
): value is Record<string, unknown> & RecommendedDrill {
  if (
    !hasExactKeys(value, RECOMMENDED_KEYS) ||
    value.state !== "recommended" ||
    value.contractVersion !== DRILL_RECOMMENDATION_CONTRACT_VERSION ||
    value.templateVersion !== DRILL_TEMPLATE_VERSION ||
    typeof value.roundType !== "string" ||
    !ALL_INTERVIEW_TYPES.includes(value.roundType as RoundType) ||
    typeof value.weakestDimension !== "string" ||
    !DIMENSIONS.includes(value.weakestDimension as FeedbackDimension) ||
    typeof value.weakestScore !== "number" ||
    !Number.isInteger(value.weakestScore) ||
    value.weakestScore < 0 ||
    value.weakestScore > 10 ||
    !Array.isArray(value.tiedDimensions) ||
    value.tiedDimensions.length < 1 ||
    !value.tiedDimensions.every(
      (dimension) =>
        typeof dimension === "string" &&
        DIMENSIONS.includes(dimension as FeedbackDimension)
    ) ||
    new Set(value.tiedDimensions).size !== value.tiedDimensions.length ||
    !value.tiedDimensions.includes(value.weakestDimension) ||
    (value.evidenceGap !== "grounded_full" &&
      value.evidenceGap !== "grounded_partial") ||
    !isRecord(value.sourceFinding) ||
    !hasExactKeys(value.sourceFinding, SOURCE_FINDING_KEYS) ||
    !Array.isArray(value.sourceFinding.transcriptRefs) ||
    value.sourceFinding.transcriptRefs.length < 1 ||
    !value.sourceFinding.transcriptRefs.every(isValidIdentity) ||
    new Set(value.sourceFinding.transcriptRefs).size !==
      value.sourceFinding.transcriptRefs.length ||
    !isSorted(value.sourceFinding.transcriptRefs) ||
    typeof value.sourceFinding.confidence !== "number" ||
    !Number.isFinite(value.sourceFinding.confidence) ||
    value.sourceFinding.confidence <= 0 ||
    value.sourceFinding.confidence > 1
  ) {
    return false;
  }

  return (
    value.drillId ===
    sourceRecommendationId(
      value.roundType as RoundType,
      value.weakestDimension as FeedbackDimension,
      value.evidenceGap
    )
  );
}

function isExactUnavailableRecommendation(
  value: Record<string, unknown>
): boolean {
  return (
    hasExactKeys(value, UNAVAILABLE_KEYS) &&
    value.state === "unavailable" &&
    typeof value.reason === "string" &&
    DRILL_RECOMMENDATION_UNAVAILABLE_REASONS.includes(
      value.reason as (typeof DRILL_RECOMMENDATION_UNAVAILABLE_REASONS)[number]
    )
  );
}

function parseSourceQuestion(
  value: FocusedPracticeSourceQuestion
): FocusedPracticeSourceQuestion | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["questionId", "questionText"])
  ) {
    return null;
  }
  if (
    !isBoundedText(value.questionId, 200) ||
    !isBoundedText(value.questionText, 2_000)
  ) {
    return null;
  }
  return {
    questionId: value.questionId,
    questionText: value.questionText,
  };
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  );
}

function isValidIdentity(value: unknown): value is string {
  return isBoundedText(value, 500) && value === value.trim();
}

function isSorted(values: readonly string[]): boolean {
  return values.every(
    (value, index) => index === 0 || values[index - 1] <= value
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

function unavailable(
  reason: FocusedPracticePlanUnavailableReason
): UnavailableFocusedPracticePlan {
  return Object.freeze({
    state: "unavailable",
    contractVersion: FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION,
    templateVersion: FOCUSED_PRACTICE_TEMPLATE_VERSION,
    reason,
  });
}

function freezePlan(
  plan: Omit<AvailableFocusedPracticePlan, "instructions" | "source"> & {
    instructions: [string, string];
    source: Omit<AvailableFocusedPracticePlan["source"], "transcriptRefs"> & {
      transcriptRefs: string[];
    };
  }
): AvailableFocusedPracticePlan {
  const source = Object.freeze({
    ...plan.source,
    transcriptRefs: Object.freeze([...plan.source.transcriptRefs]),
  });
  return Object.freeze({
    ...plan,
    instructions: Object.freeze([...plan.instructions] as [string, string]),
    source,
  });
}
