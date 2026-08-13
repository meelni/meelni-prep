import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  deriveCandidateAnswerBlocks,
  parseDimensionCoverageProviderSelection,
  type AnswerBlockLedgerEvent,
  type CandidateAnswerBlock,
  type DimensionCoverageFeedbackResult,
  type DimensionCoverageProviderSelection,
  type FeedbackDimension,
} from "@meelni/core";

import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
  createAnswerBlockTurn,
} from "./answer-blocks";

export const SYNTHETIC_FEEDBACK_REVIEW_OUTCOMES = [
  "full_scorecard",
  "partial_scorecard",
  "coaching_review",
  "unable_to_review",
] as const;

export type SyntheticFeedbackReviewOutcome =
  (typeof SYNTHETIC_FEEDBACK_REVIEW_OUTCOMES)[number];

export const SYNTHETIC_FEEDBACK_REVIEW_DIMENSIONS = FEEDBACK_DIMENSIONS;
export type SyntheticFeedbackReviewDimension = FeedbackDimension;

export interface SyntheticFeedbackTranscriptVariant {
  segmentCount: (typeof ANSWER_BLOCK_SEGMENT_COUNTS)[number];
  events: AnswerBlockLedgerEvent[];
  answerBlocks: CandidateAnswerBlock[];
  coverageResult: DimensionCoverageFeedbackResult | null;
}

export interface SyntheticDimensionPresentation {
  dimension: SyntheticFeedbackReviewDimension;
  state: "scored" | "not_enough_evidence";
  score: number | null;
}

export interface SyntheticFeedbackReviewOutcomeFixture {
  id: string;
  provenance: "fully_synthetic";
  sourceIntegrity: "verified" | "failed";
  sourceVariants: SyntheticFeedbackTranscriptVariant[];
  expected: {
    outcome: SyntheticFeedbackReviewOutcome;
    withheldReason: "rubric_coverage" | "verified_evidence_integrity" | null;
    dimensions: SyntheticDimensionPresentation[];
    displayOverallScore: number | null;
    exactCandidateCitation: string | null;
    prioritizedPracticeFocus: boolean;
    recovery:
      | "continue_practice"
      | "start_another_interview"
      | "credit_returned"
      | "credit_recovery_in_progress";
    historyLabel:
      | "Full scorecard ready"
      | "Partial scorecard ready"
      | "Coaching review ready"
      | "Unable to review";
    numericMetricContribution: {
      overall: boolean;
      dimensions: SyntheticFeedbackReviewDimension[];
    };
  };
}

const FULL_DIMENSIONS: SyntheticDimensionPresentation[] =
  FEEDBACK_DIMENSIONS.map((dimension) => ({
    dimension,
    state: "scored",
    score: 8,
  }));

const PARTIAL_DIMENSIONS: SyntheticDimensionPresentation[] =
  FEEDBACK_DIMENSIONS.map((dimension) => ({
    dimension,
    state: dimension === "structure" ? "scored" : "not_enough_evidence",
    score: dimension === "structure" ? 8 : null,
  }));

export function createSyntheticFeedbackReviewOutcomeFixtures(): SyntheticFeedbackReviewOutcomeFixture[] {
  return [
    {
      id: "full-scorecard-equivalent-segmentation",
      provenance: "fully_synthetic",
      sourceIntegrity: "verified",
      sourceVariants: coverageVariants("full_scorecard"),
      expected: {
        outcome: "full_scorecard",
        withheldReason: null,
        dimensions: FULL_DIMENSIONS,
        displayOverallScore: 8,
        exactCandidateCitation: firstSyntheticAnswer(),
        prioritizedPracticeFocus: false,
        recovery: "continue_practice",
        historyLabel: "Full scorecard ready",
        numericMetricContribution: {
          overall: true,
          dimensions: [...FEEDBACK_DIMENSIONS],
        },
      },
    },
    {
      id: "partial-scorecard-supported-dimensions-only",
      provenance: "fully_synthetic",
      sourceIntegrity: "verified",
      sourceVariants: coverageVariants("partial_scorecard"),
      expected: {
        outcome: "partial_scorecard",
        withheldReason: "rubric_coverage",
        dimensions: PARTIAL_DIMENSIONS,
        displayOverallScore: null,
        exactCandidateCitation: firstSyntheticAnswer(),
        prioritizedPracticeFocus: false,
        recovery: "continue_practice",
        historyLabel: "Partial scorecard ready",
        numericMetricContribution: { overall: false, dimensions: [] },
      },
    },
    {
      id: "coaching-review-rubric-coverage",
      provenance: "fully_synthetic",
      sourceIntegrity: "verified",
      sourceVariants: coverageVariants("coaching_coverage"),
      expected: {
        outcome: "coaching_review",
        withheldReason: "rubric_coverage",
        dimensions: [],
        displayOverallScore: null,
        exactCandidateCitation: firstSyntheticAnswer(),
        prioritizedPracticeFocus: true,
        recovery: "continue_practice",
        historyLabel: "Coaching review ready",
        numericMetricContribution: { overall: false, dimensions: [] },
      },
    },
    {
      id: "coaching-review-verified-evidence-integrity",
      provenance: "fully_synthetic",
      sourceIntegrity: "failed",
      sourceVariants: coverageVariants("coaching_integrity"),
      expected: {
        outcome: "coaching_review",
        withheldReason: "verified_evidence_integrity",
        dimensions: [],
        displayOverallScore: null,
        exactCandidateCitation: firstSyntheticAnswer(),
        prioritizedPracticeFocus: true,
        recovery: "continue_practice",
        historyLabel: "Coaching review ready",
        numericMetricContribution: { overall: false, dimensions: [] },
      },
    },
    {
      id: "unable-no-reviewable-candidate-evidence",
      provenance: "fully_synthetic",
      sourceIntegrity: "verified",
      sourceVariants: noReviewableAnswerVariants(),
      expected: {
        outcome: "unable_to_review",
        withheldReason: "rubric_coverage",
        dimensions: [],
        displayOverallScore: null,
        exactCandidateCitation: null,
        prioritizedPracticeFocus: false,
        recovery: "start_another_interview",
        historyLabel: "Unable to review",
        numericMetricContribution: { overall: false, dimensions: [] },
      },
    },
    {
      id: "unable-integrity-credit-returned",
      provenance: "fully_synthetic",
      sourceIntegrity: "failed",
      sourceVariants: integrityFailureVariants(),
      expected: {
        outcome: "unable_to_review",
        withheldReason: "verified_evidence_integrity",
        dimensions: [],
        displayOverallScore: null,
        exactCandidateCitation: null,
        prioritizedPracticeFocus: false,
        recovery: "credit_returned",
        historyLabel: "Unable to review",
        numericMetricContribution: { overall: false, dimensions: [] },
      },
    },
    {
      id: "unable-integrity-credit-recovery-pending",
      provenance: "fully_synthetic",
      sourceIntegrity: "failed",
      sourceVariants: integrityFailureVariants(),
      expected: {
        outcome: "unable_to_review",
        withheldReason: "verified_evidence_integrity",
        dimensions: [],
        displayOverallScore: null,
        exactCandidateCitation: null,
        prioritizedPracticeFocus: false,
        recovery: "credit_recovery_in_progress",
        historyLabel: "Unable to review",
        numericMetricContribution: { overall: false, dimensions: [] },
      },
    },
  ];
}

function coverageVariants(
  kind:
    | "full_scorecard"
    | "partial_scorecard"
    | "coaching_coverage"
    | "coaching_integrity"
): SyntheticFeedbackTranscriptVariant[] {
  return ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => {
    const source = createAnswerBlockSegmentationFixture(segmentCount);
    const answerBlocks = deriveCandidateAnswerBlocks(source.events).blocks;
    const selection = coverageSelection(answerBlocks[0]!.answerBlockId, kind);
    const coverageResult = parseDimensionCoverageProviderSelection(selection, {
      roundType: "product_sense",
      answerBlocks,
      modelVersion: "synthetic-review-outcome-fixture-v1",
      allowNumericalScores: kind !== "coaching_integrity",
    });
    return {
      segmentCount,
      events: source.events,
      answerBlocks,
      coverageResult,
    };
  });
}

function coverageSelection(
  answerBlockRef: string,
  kind:
    | "full_scorecard"
    | "partial_scorecard"
    | "coaching_coverage"
    | "coaching_integrity"
): DimensionCoverageProviderSelection {
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const facetCount =
      kind === "full_scorecard" || kind === "coaching_integrity"
        ? 2
        : dimension === "structure"
          ? kind === "partial_scorecard"
            ? 2
            : 1
          : dimension === "insight"
            ? 1
            : 0;
    dimensions[dimension] = {
      score:
        facetCount === 2 &&
        (kind === "full_scorecard" || kind === "partial_scorecard")
          ? 8
          : null,
      evidence: ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[dimension].facets
        .slice(0, facetCount)
        .map((facet) => ({ facetCode: facet.code, answerBlockRef })),
    };
  }
  return {
    schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    roundType: "product_sense",
    dimensions,
  };
}

function noReviewableAnswerVariants(): SyntheticFeedbackTranscriptVariant[] {
  const prompt = createAnswerBlockTurn({
    speaker: "interviewer",
    text: "How would you improve a shared family planning product?",
  });
  return ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => ({
    segmentCount,
    events: [prompt, { kind: "session_end", occurredAtMs: prompt.endedAtMs }],
    answerBlocks: [],
    coverageResult: null,
  }));
}

function integrityFailureVariants(): SyntheticFeedbackTranscriptVariant[] {
  return ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => {
    const source = createAnswerBlockSegmentationFixture(segmentCount);
    return {
      segmentCount,
      events: source.events,
      answerBlocks: [],
      coverageResult: null,
    };
  });
}

function firstSyntheticAnswer(): string {
  return createAnswerBlockSegmentationFixture(1).expectedReviewability[0]!
    .responseText;
}
