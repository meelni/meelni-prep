import type { CandidateAnswerBlock } from "./answer-blocks";
import { calculateOverallScore, type FeedbackDimension } from "./evaluation";
import type { RoundType } from "./interview";
import {
  TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION,
  type TrustedAnswerBlockIdentity,
  type TrustedAnswerBlockProjection,
} from "./trusted-answer-block-authority";

export const FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION =
  "feedback.dimension-coverage.v1" as const;
export const FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION =
  "feedback.dimension-coverage.v2" as const;
export const FEEDBACK_VERIFIED_PREFIX_SCOPE_VERSION =
  "feedback.verified-prefix-scope.v1" as const;
const MAX_VERIFIED_PREFIX_IDENTITIES = 1_000;
const MAX_VERIFIED_PREFIX_SCOPE_SERIALIZED_LENGTH = 128_000;
export const FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION =
  "feedback.dimension-coverage.selection.v1" as const;
export const FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION =
  "feedback.prompt.dimension-coverage.v1" as const;
export const FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION =
  "pm-feedback-rubric.v3" as const;

export const FEEDBACK_DIMENSIONS = [
  "structure",
  "clarity",
  "insight",
  "communication",
  "leadership",
] as const satisfies readonly FeedbackDimension[];

export type DimensionCoverageState = "sufficient" | "partial" | "absent";
export type DimensionCoverageFeedbackMode =
  | "full_scorecard"
  | "partial_scorecard"
  | "coaching_review";

export interface RubricFacetDefinition {
  code: string;
  label: string;
  evaluatorGuidance: string;
}
export interface DimensionRubricDefinition {
  facets: readonly [RubricFacetDefinition, RubricFacetDefinition];
}
export type RoundDimensionCoverageConfig = Record<
  FeedbackDimension,
  DimensionRubricDefinition
>;

function facet(
  code: string,
  label: string,
  evaluatorGuidance: string
): RubricFacetDefinition {
  return { code, label, evaluatorGuidance };
}

export const ROUND_DIMENSION_COVERAGE_CONFIG = {
  product_sense: {
    structure: {
      facets: [
        facet(
          "ps_structure_problem_progression",
          "Problem progression",
          "Connect a product problem, user, or goal through an explicit progression."
        ),
        facet(
          "ps_structure_solution_tradeoff",
          "Solution and tradeoff structure",
          "Connect a proposed solution to prioritization or a tradeoff."
        ),
      ],
    },
    clarity: {
      facets: [
        facet(
          "ps_clarity_prioritized_thesis",
          "Prioritized thesis",
          "State a clear product focus or prioritized claim."
        ),
        facet(
          "ps_clarity_connected_rationale",
          "Connected rationale",
          "Connect the user problem, choice, and intended outcome."
        ),
      ],
    },
    insight: {
      facets: [
        facet(
          "ps_insight_user_need_specificity",
          "Specific user need",
          "Identify a concrete user need, behavior, or constraint."
        ),
        facet(
          "ps_insight_non_obvious_tradeoff",
          "Non-obvious tradeoff",
          "Identify a meaningful second-order effect or non-obvious tradeoff."
        ),
      ],
    },
    communication: {
      facets: [
        facet(
          "ps_communication_clarifying_alignment",
          "Clarifying alignment",
          "Align on scope, assumptions, or the product decision."
        ),
        facet(
          "ps_communication_reasoning_visibility",
          "Visible reasoning",
          "Make product reasoning and prioritization legible."
        ),
      ],
    },
    leadership: {
      facets: [
        facet(
          "ps_leadership_explicit_decision",
          "Explicit decision",
          "Make an explicit product decision instead of listing undifferentiated options."
        ),
        facet(
          "ps_leadership_conviction_with_tradeoff",
          "Conviction with tradeoff",
          "Own a recommendation while acknowledging a material tradeoff."
        ),
      ],
    },
  },
  execution: {
    structure: {
      facets: [
        facet(
          "ex_structure_goal_to_plan",
          "Goal-to-plan structure",
          "Connect the execution goal to an ordered plan or decision path."
        ),
        facet(
          "ex_structure_prioritization_sequence",
          "Prioritization sequence",
          "Sequence priorities, dependencies, or milestones."
        ),
      ],
    },
    clarity: {
      facets: [
        facet(
          "ex_clarity_priority_rationale",
          "Priority rationale",
          "Explain why one execution priority comes before another."
        ),
        facet(
          "ex_clarity_decision_rule",
          "Decision rule",
          "State a rule, threshold, or criterion for an execution choice."
        ),
      ],
    },
    insight: {
      facets: [
        facet(
          "ex_insight_dependency_risk",
          "Dependency or risk",
          "Identify a dependency, failure mode, or execution risk."
        ),
        facet(
          "ex_insight_metric_tradeoff",
          "Metric tradeoff",
          "Explain a metric relationship, guardrail, or tradeoff that changes the plan."
        ),
      ],
    },
    communication: {
      facets: [
        facet(
          "ex_communication_constraint_alignment",
          "Constraint alignment",
          "Surface and align on a relevant execution constraint."
        ),
        facet(
          "ex_communication_plan_visibility",
          "Plan visibility",
          "Communicate the plan, checkpoints, or decision logic."
        ),
      ],
    },
    leadership: {
      facets: [
        facet(
          "ex_leadership_accountable_owner",
          "Accountable ownership",
          "Identify ownership or take responsibility for an execution decision."
        ),
        facet(
          "ex_leadership_ship_decision",
          "Ship decision",
          "Make a bounded ship, sequence, or escalation decision."
        ),
      ],
    },
  },
  behavioral: {
    structure: {
      facets: [
        facet(
          "bh_structure_context_goal",
          "Context and goal",
          "Establish the situation and the candidate's responsibility."
        ),
        facet(
          "bh_structure_action_result",
          "Action and result",
          "Connect candidate actions to a concrete result."
        ),
      ],
    },
    clarity: {
      facets: [
        facet(
          "bh_clarity_specific_example",
          "Specific example",
          "Use a specific situation rather than general leadership principles."
        ),
        facet(
          "bh_clarity_personal_contribution",
          "Personal contribution",
          "Distinguish the candidate's decisions and actions from the team's work."
        ),
      ],
    },
    insight: {
      facets: [
        facet(
          "bh_insight_reflection",
          "Reflection",
          "Reflect on why the situation unfolded or what was learned."
        ),
        facet(
          "bh_insight_changed_behavior",
          "Changed behavior",
          "Identify how later judgment or behavior changed."
        ),
      ],
    },
    communication: {
      facets: [
        facet(
          "bh_communication_stakeholder_context",
          "Stakeholder context",
          "Make relevant stakeholder perspectives or conflict understandable."
        ),
        facet(
          "bh_communication_causal_narrative",
          "Causal narrative",
          "Connect decisions, actions, and consequences."
        ),
      ],
    },
    leadership: {
      facets: [
        facet(
          "bh_leadership_influence_ownership",
          "Influence and ownership",
          "Ground an example of influencing others or taking ownership."
        ),
        facet(
          "bh_leadership_measurable_impact",
          "Measurable impact",
          "Identify a concrete team, customer, product, or business impact."
        ),
      ],
    },
  },
  strategy: {
    structure: {
      facets: [
        facet(
          "st_structure_market_to_choice",
          "Market-to-choice structure",
          "Connect market or customer context to strategic options and a choice."
        ),
        facet(
          "st_structure_option_tradeoff",
          "Option tradeoff",
          "Compare strategic options using explicit tradeoffs."
        ),
      ],
    },
    clarity: {
      facets: [
        facet(
          "st_clarity_strategic_thesis",
          "Strategic thesis",
          "State a clear strategic thesis or recommendation."
        ),
        facet(
          "st_clarity_logic_chain",
          "Logic chain",
          "Make the causal logic from market fact to recommendation explicit."
        ),
      ],
    },
    insight: {
      facets: [
        facet(
          "st_insight_market_dynamic",
          "Market dynamic",
          "Identify a concrete market, customer, or competitive dynamic."
        ),
        facet(
          "st_insight_second_order_effect",
          "Second-order effect",
          "Identify a second-order strategic implication, risk, or response."
        ),
      ],
    },
    communication: {
      facets: [
        facet(
          "st_communication_assumption_alignment",
          "Assumption alignment",
          "Surface a material strategic assumption or uncertainty."
        ),
        facet(
          "st_communication_evidence_narrative",
          "Evidence narrative",
          "Connect evidence and reasoning into a coherent strategic narrative."
        ),
      ],
    },
    leadership: {
      facets: [
        facet(
          "st_leadership_bounded_bet",
          "Bounded strategic bet",
          "Commit to a bounded strategic bet rather than leaving every option open."
        ),
        facet(
          "st_leadership_long_term_tradeoff",
          "Long-term tradeoff",
          "Own a long-term tradeoff, sequence, or exit condition."
        ),
      ],
    },
  },
} as const satisfies Record<RoundType, RoundDimensionCoverageConfig>;

export interface DimensionFacetSelection {
  facetCode: string;
  answerBlockRef: string;
}
export interface DimensionCoverageProviderDimensionSelection {
  score: number | null;
  evidence: DimensionFacetSelection[];
}
export interface DimensionCoverageProviderSelection {
  schemaVersion: typeof FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION;
  promptVersion: typeof FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION;
  rubricVersion: typeof FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION;
  roundType: RoundType;
  dimensions: Record<
    FeedbackDimension,
    DimensionCoverageProviderDimensionSelection
  >;
}
export interface DimensionCoverageEvidence extends DimensionFacetSelection {
  facetLabel: string;
  evidenceText: string;
}
export interface DimensionCoverageResultDimension {
  coverage: DimensionCoverageState;
  score: number | null;
  evidence: DimensionCoverageEvidence[];
}
export type DimensionCoverageResultDimensions = Record<
  FeedbackDimension,
  DimensionCoverageResultDimension
>;
interface DimensionCoverageFeedbackResultBase {
  promptVersion: typeof FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION;
  rubricVersion: typeof FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION;
  modelVersion: string;
  roundType: RoundType;
  evaluationState: "full" | "partial";
  mode: DimensionCoverageFeedbackMode;
  dimensions: DimensionCoverageResultDimensions;
  overallScore: number | null;
  summary: string;
}

export interface CompleteSessionDimensionCoverageFeedbackResult
  extends DimensionCoverageFeedbackResultBase {
  schemaVersion: typeof FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION;
}

export interface VerifiedPrefixFeedbackScopeV1 {
  contractVersion: typeof FEEDBACK_VERIFIED_PREFIX_SCOPE_VERSION;
  projectionVersion: typeof TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION;
  trustedBlockIdentities: TrustedAnswerBlockIdentity[];
  excludedTailBlockCount: number;
}

export interface VerifiedPrefixDimensionCoverageFeedbackResult
  extends DimensionCoverageFeedbackResultBase {
  schemaVersion: typeof FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION;
  verifiedPrefixScope: VerifiedPrefixFeedbackScopeV1;
}

export type DimensionCoverageFeedbackResult =
  | CompleteSessionDimensionCoverageFeedbackResult
  | VerifiedPrefixDimensionCoverageFeedbackResult;

export interface DimensionCoveragePracticeFocusSource {
  dimension: FeedbackDimension;
  coverage: Exclude<DimensionCoverageState, "absent">;
  facetCode: string;
  facetLabel: string;
  answerBlockRef: string;
  evidenceText: string;
}

/**
 * Select one grounded SAV-420 practice focus without consulting scores.
 * Scoreless coaching prefers a grounded incomplete dimension, then uses the
 * canonical dimension/facet/answer-block order used by presentation.
 */
export function selectDimensionCoveragePracticeFocus(
  feedback: DimensionCoverageFeedbackResult
): DimensionCoveragePracticeFocusSource | null {
  if (
    feedback.mode !== "partial_scorecard" &&
    feedback.mode !== "coaching_review"
  ) {
    return null;
  }
  const candidates = FEEDBACK_DIMENSIONS.flatMap((dimension) => {
    const source = feedback.dimensions[dimension];
    if (source.coverage === "absent") return [];
    const coverage: Exclude<DimensionCoverageState, "absent"> = source.coverage;
    return source.evidence.map((evidence) => ({
      dimension,
      coverage,
      facetCode: evidence.facetCode,
      facetLabel: evidence.facetLabel,
      answerBlockRef: evidence.answerBlockRef,
      evidenceText: evidence.evidenceText,
    }));
  });
  candidates.sort(
    (left, right) =>
      (feedback.mode === "partial_scorecard" ||
      feedback.mode === "coaching_review"
        ? coveragePracticePriority(left.coverage) -
          coveragePracticePriority(right.coverage)
        : 0) ||
      FEEDBACK_DIMENSIONS.indexOf(left.dimension) -
        FEEDBACK_DIMENSIONS.indexOf(right.dimension) ||
      left.facetCode.localeCompare(right.facetCode) ||
      left.answerBlockRef.localeCompare(right.answerBlockRef)
  );
  return candidates[0] ?? null;
}

function coveragePracticePriority(
  coverage: Exclude<DimensionCoverageState, "absent">
): number {
  return coverage === "partial" ? 0 : 1;
}

export type DimensionCoverageParseErrorCode =
  | "invalid_shape"
  | "version_mismatch"
  | "round_mismatch"
  | "unknown_answer_block"
  | "wrong_round_facet"
  | "duplicate_facet"
  | "score_coverage_mismatch"
  | "persisted_result_mismatch";
export class DimensionCoverageParseError extends Error {
  constructor(readonly code: DimensionCoverageParseErrorCode) {
    super(code);
    this.name = "DimensionCoverageParseError";
  }
}

export function isDimensionCoverageFeedbackResult(value: {
  schemaVersion: string;
}): value is DimensionCoverageFeedbackResult {
  return (
    value.schemaVersion === FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION ||
    value.schemaVersion === FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION
  );
}

export function parseDimensionCoverageProviderSelection(
  value: unknown,
  options: {
    roundType: RoundType;
    answerBlocks: readonly CandidateAnswerBlock[];
    modelVersion: string;
    allowNumericalScores: boolean;
    verifiedPrefixProjection?: TrustedAnswerBlockProjection;
  }
): DimensionCoverageFeedbackResult {
  return parseDimensionCoverageProviderSelectionWithPolicy(value, options, {
    preserveHistoricalPartialMode: false,
  });
}

function parseDimensionCoverageProviderSelectionWithPolicy(
  value: unknown,
  options: {
    roundType: RoundType;
    answerBlocks: readonly CandidateAnswerBlock[];
    modelVersion: string;
    allowNumericalScores: boolean;
    verifiedPrefixProjection?: TrustedAnswerBlockProjection;
  },
  policy: { preserveHistoricalPartialMode: boolean }
): DimensionCoverageFeedbackResult {
  const verifiedPrefixScope = options.verifiedPrefixProjection
    ? scopeFromVerifiedPrefixProjection(
        options.verifiedPrefixProjection,
        options.answerBlocks
      )
    : null;
  const root = requireRecord(value);
  requireKeys(root, [
    "schemaVersion",
    "promptVersion",
    "rubricVersion",
    "roundType",
    "dimensions",
  ]);
  requireExact(
    root.schemaVersion,
    FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION
  );
  requireExact(root.promptVersion, FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION);
  requireExact(root.rubricVersion, FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION);
  if (root.roundType !== options.roundType)
    throw new DimensionCoverageParseError("round_mismatch");
  const modelVersion = requireBoundedString(options.modelVersion, 256);
  const blockByRef = new Map<string, CandidateAnswerBlock>();
  for (const block of options.answerBlocks) {
    if (blockByRef.has(block.answerBlockId) || !block.responseText.trim()) {
      throw new DimensionCoverageParseError("invalid_shape");
    }
    blockByRef.set(block.answerBlockId, block);
  }
  if (blockByRef.size === 0 || blockByRef.size > 1_000) {
    throw new DimensionCoverageParseError("invalid_shape");
  }
  const rawDimensions = requireRecord(root.dimensions);
  requireKeys(rawDimensions, FEEDBACK_DIMENSIONS);
  const config = ROUND_DIMENSION_COVERAGE_CONFIG[options.roundType];
  const dimensions = {} as DimensionCoverageResultDimensions;
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const rawDimension = requireRecord(rawDimensions[dimension]);
    requireKeys(rawDimension, ["score", "evidence"]);
    if (
      !Array.isArray(rawDimension.evidence) ||
      rawDimension.evidence.length > 2
    ) {
      throw new DimensionCoverageParseError("invalid_shape");
    }
    const allowedFacets = new Map(
      config[dimension].facets.map((entry) => [entry.code, entry])
    );
    const selectedFacets = new Set<string>();
    const evidence = rawDimension.evidence.map((item) => {
      const rawEvidence = requireRecord(item);
      requireKeys(rawEvidence, ["facetCode", "answerBlockRef"]);
      const foundFacet =
        typeof rawEvidence.facetCode === "string"
          ? allowedFacets.get(rawEvidence.facetCode)
          : undefined;
      if (!foundFacet)
        throw new DimensionCoverageParseError("wrong_round_facet");
      if (selectedFacets.has(foundFacet.code))
        throw new DimensionCoverageParseError("duplicate_facet");
      selectedFacets.add(foundFacet.code);
      const block =
        typeof rawEvidence.answerBlockRef === "string"
          ? blockByRef.get(rawEvidence.answerBlockRef)
          : undefined;
      if (!block) throw new DimensionCoverageParseError("unknown_answer_block");
      return {
        facetCode: foundFacet.code,
        facetLabel: foundFacet.label,
        answerBlockRef: block.answerBlockId,
        evidenceText: requireBoundedString(block.responseText, 32_000),
      };
    });
    evidence.sort(
      (left, right) =>
        left.facetCode.localeCompare(right.facetCode) ||
        left.answerBlockRef.localeCompare(right.answerBlockRef)
    );
    const coverage =
      selectedFacets.size === 0
        ? "absent"
        : selectedFacets.size === 1
          ? "partial"
          : "sufficient";
    const score = parseNullableScore(rawDimension.score);
    if (
      (options.allowNumericalScores && coverage === "sufficient") !==
      (score !== null)
    ) {
      throw new DimensionCoverageParseError("score_coverage_mismatch");
    }
    dimensions[dimension] = { coverage, score, evidence };
  }
  const sufficientCount = FEEDBACK_DIMENSIONS.filter(
    (dimension) => dimensions[dimension].coverage === "sufficient"
  ).length;
  const historicalMode: DimensionCoverageFeedbackMode = verifiedPrefixScope
    ? options.allowNumericalScores && sufficientCount > 0
      ? "partial_scorecard"
      : "coaching_review"
    : !options.allowNumericalScores
      ? "coaching_review"
      : sufficientCount === FEEDBACK_DIMENSIONS.length
        ? "full_scorecard"
        : sufficientCount > 0
          ? "partial_scorecard"
          : "coaching_review";
  const scorecardEligible =
    options.allowNumericalScores &&
    sufficientCount === FEEDBACK_DIMENSIONS.length &&
    (verifiedPrefixScope === null ||
      verifiedPrefixScope.excludedTailBlockCount === 0);
  const mode: DimensionCoverageFeedbackMode =
    policy.preserveHistoricalPartialMode &&
    historicalMode === "partial_scorecard"
      ? "partial_scorecard"
      : scorecardEligible
        ? "full_scorecard"
        : "coaching_review";
  if (mode === "coaching_review") {
    for (const dimension of FEEDBACK_DIMENSIONS) {
      dimensions[dimension] = { ...dimensions[dimension], score: null };
    }
  }
  const overallScore =
    mode === "full_scorecard"
      ? calculateOverallScore({
          structure: dimensions.structure.score!,
          clarity: dimensions.clarity.score!,
          insight: dimensions.insight.score!,
          communication: dimensions.communication.score!,
          leadership: dimensions.leadership.score!,
        })
      : null;
  return verifiedPrefixScope
    ? {
        schemaVersion: FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION,
        promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
        rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
        modelVersion,
        roundType: options.roundType,
        evaluationState: mode === "full_scorecard" ? "full" : "partial",
        mode,
        dimensions,
        overallScore,
        summary: summaryForMode(mode, true),
        verifiedPrefixScope,
      }
    : {
        schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION,
        promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
        rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
        modelVersion,
        roundType: options.roundType,
        evaluationState: mode === "full_scorecard" ? "full" : "partial",
        mode,
        dimensions,
        overallScore,
        summary: summaryForMode(mode),
      };
}

export function parsePersistedDimensionCoverageFeedback(
  value: unknown,
  options: {
    answerBlocks: readonly CandidateAnswerBlock[];
    allowNumericalScores?: boolean;
    verifiedPrefixProjection?: TrustedAnswerBlockProjection;
  }
): DimensionCoverageFeedbackResult {
  const root = requireRecord(value);
  const verifiedPrefix =
    root.schemaVersion === FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION;
  requireKeys(root, [
    "schemaVersion",
    "promptVersion",
    "rubricVersion",
    "modelVersion",
    "roundType",
    "evaluationState",
    "mode",
    "dimensions",
    "overallScore",
    "summary",
    ...(verifiedPrefix ? ["verifiedPrefixScope"] : []),
  ]);
  if (
    root.schemaVersion !== FEEDBACK_DIMENSION_COVERAGE_SCHEMA_VERSION &&
    !verifiedPrefix
  ) {
    throw new DimensionCoverageParseError("version_mismatch");
  }
  const persistedVerifiedPrefixScope = verifiedPrefix
    ? parseVerifiedPrefixScope(root.verifiedPrefixScope)
    : null;
  requireExact(root.promptVersion, FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION);
  requireExact(root.rubricVersion, FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION);
  const roundType = parseRoundType(root.roundType);
  const mode = parseMode(root.mode);
  const persistedDimensions = requireRecord(root.dimensions);
  requireKeys(persistedDimensions, FEEDBACK_DIMENSIONS);
  const providerDimensions = {} as Record<
    FeedbackDimension,
    DimensionCoverageProviderDimensionSelection
  >;
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const persisted = requireRecord(persistedDimensions[dimension]);
    requireKeys(persisted, ["coverage", "score", "evidence"]);
    if (!Array.isArray(persisted.evidence))
      throw new DimensionCoverageParseError("invalid_shape");
    providerDimensions[dimension] = {
      score: parseNullableScore(persisted.score),
      evidence: persisted.evidence.map((item) => {
        const evidence = requireRecord(item);
        requireKeys(evidence, [
          "facetCode",
          "facetLabel",
          "answerBlockRef",
          "evidenceText",
        ]);
        return {
          facetCode: requireBoundedString(evidence.facetCode, 128),
          answerBlockRef: requireBoundedString(evidence.answerBlockRef, 128),
        };
      }),
    };
  }
  const derived = parseDimensionCoverageProviderSelectionWithPolicy(
    {
      schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
      promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
      rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
      roundType,
      dimensions: providerDimensions,
    },
    {
      roundType,
      answerBlocks: options.answerBlocks,
      modelVersion:
        typeof root.modelVersion === "string" ? root.modelVersion : "",
      allowNumericalScores:
        mode === "coaching_review"
          ? false
          : (options.allowNumericalScores ?? true),
      ...(verifiedPrefix
        ? { verifiedPrefixProjection: options.verifiedPrefixProjection }
        : {}),
    },
    { preserveHistoricalPartialMode: mode === "partial_scorecard" }
  );
  const boundedRoot = persistedVerifiedPrefixScope
    ? { ...root, verifiedPrefixScope: persistedVerifiedPrefixScope }
    : root;
  if (canonicalJson(derived) !== canonicalJson(boundedRoot)) {
    throw new DimensionCoverageParseError("persisted_result_mismatch");
  }
  return derived;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortJsonValue(record[key])])
  );
}

function scopeFromVerifiedPrefixProjection(
  projection: TrustedAnswerBlockProjection,
  answerBlocks: readonly CandidateAnswerBlock[]
): VerifiedPrefixFeedbackScopeV1 {
  const aligned =
    projection.contractVersion === TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION &&
    projection.status === "verified_prefix" &&
    projection.failureReason === null &&
    projection.trustedBlocks.length > 0 &&
    projection.trustedBlocks.length ===
      projection.trustedBlockIdentities.length &&
    projection.trustedBlocks.length === projection.closureAuthorities.length &&
    canonicalJson(projection.trustedBlocks) === canonicalJson(answerBlocks) &&
    projection.trustedBlocks.every(
      (block, index) =>
        block.answerBlockId ===
          projection.trustedBlockIdentities[index]?.answerBlockId &&
        block.answerBlockId ===
          projection.closureAuthorities[index]?.answerBlockId
    );
  if (!aligned) throw new DimensionCoverageParseError("invalid_shape");
  return {
    contractVersion: FEEDBACK_VERIFIED_PREFIX_SCOPE_VERSION,
    projectionVersion: TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION,
    trustedBlockIdentities: projection.trustedBlockIdentities.map(
      (identity) => ({ ...identity })
    ),
    excludedTailBlockCount: projection.excludedBlocks.length,
  };
}

function parseVerifiedPrefixScope(
  value: unknown
): VerifiedPrefixFeedbackScopeV1 {
  const scope = requireRecord(value);
  requireKeys(scope, [
    "contractVersion",
    "projectionVersion",
    "trustedBlockIdentities",
    "excludedTailBlockCount",
  ]);
  requireExact(scope.contractVersion, FEEDBACK_VERIFIED_PREFIX_SCOPE_VERSION);
  requireExact(
    scope.projectionVersion,
    TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION
  );
  if (
    !Array.isArray(scope.trustedBlockIdentities) ||
    scope.trustedBlockIdentities.length === 0 ||
    scope.trustedBlockIdentities.length > MAX_VERIFIED_PREFIX_IDENTITIES ||
    !Number.isSafeInteger(scope.excludedTailBlockCount) ||
    (scope.excludedTailBlockCount as number) < 0 ||
    (scope.excludedTailBlockCount as number) > MAX_VERIFIED_PREFIX_IDENTITIES
  ) {
    throw new DimensionCoverageParseError("invalid_shape");
  }
  const trustedBlockIdentities = scope.trustedBlockIdentities.map((value) => {
    const identity = requireRecord(value);
    requireKeys(identity, ["contractVersion", "answerBlockId", "identity"]);
    requireExact(identity.contractVersion, "trusted-answer-block-identity.v1");
    const answerBlockId = requireBoundedString(identity.answerBlockId, 17);
    if (
      !/^answer-block:[0-9]{4}$/u.test(answerBlockId) ||
      typeof identity.identity !== "string" ||
      !/^trusted-answer-block\.v1:[a-f0-9]{64}$/u.test(identity.identity)
    ) {
      throw new DimensionCoverageParseError("invalid_shape");
    }
    return {
      contractVersion: "trusted-answer-block-identity.v1" as const,
      answerBlockId,
      identity: identity.identity as `trusted-answer-block.v1:${string}`,
    };
  });
  const decoded: VerifiedPrefixFeedbackScopeV1 = {
    contractVersion: FEEDBACK_VERIFIED_PREFIX_SCOPE_VERSION,
    projectionVersion: TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION,
    trustedBlockIdentities,
    excludedTailBlockCount: scope.excludedTailBlockCount as number,
  };
  if (
    new TextEncoder().encode(JSON.stringify(decoded)).byteLength >
    MAX_VERIFIED_PREFIX_SCOPE_SERIALIZED_LENGTH
  ) {
    throw new DimensionCoverageParseError("invalid_shape");
  }
  return decoded;
}

function summaryForMode(
  mode: DimensionCoverageFeedbackMode,
  verifiedPrefix = false
): string {
  if (mode === "full_scorecard")
    return "Every configured PM dimension had sufficient grounded evidence for a complete scorecard.";
  if (mode === "partial_scorecard")
    return verifiedPrefix
      ? "Only PM dimensions supported by verified completed answers are scored; the unverified interview tail and overall score are excluded."
      : "Only PM dimensions with sufficient grounded evidence are scored; unsupported dimensions and the overall score are withheld.";
  if (verifiedPrefix)
    return "Verified completed answers support grounded coaching, while the unverified interview tail is excluded from review.";
  return "The interview contains a reviewable candidate answer for coaching, but it does not support a fair numerical scorecard.";
}
function parseNullableScore(value: unknown): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 10
  ) {
    throw new DimensionCoverageParseError("invalid_shape");
  }
  return value;
}
function parseRoundType(value: unknown): RoundType {
  if (
    value === "product_sense" ||
    value === "execution" ||
    value === "behavioral" ||
    value === "strategy"
  )
    return value;
  throw new DimensionCoverageParseError("invalid_shape");
}
function parseMode(value: unknown): DimensionCoverageFeedbackMode {
  if (
    value === "full_scorecard" ||
    value === "partial_scorecard" ||
    value === "coaching_review"
  )
    return value;
  throw new DimensionCoverageParseError("invalid_shape");
}
function requireBoundedString(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new DimensionCoverageParseError("invalid_shape");
  }
  return value;
}
function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DimensionCoverageParseError("invalid_shape");
  }
  return value as Record<string, unknown>;
}
function requireKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new DimensionCoverageParseError("invalid_shape");
  }
}
function requireExact(value: unknown, expected: string): void {
  if (value !== expected)
    throw new DimensionCoverageParseError("version_mismatch");
}
