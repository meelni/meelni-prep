export const SYNTHETIC_FEEDBACK_REVIEW_OUTCOMES = [
  "full_scorecard",
  "partial_scorecard",
  "coaching_review",
  "unable_to_review",
] as const;

export type SyntheticFeedbackReviewOutcome =
  (typeof SYNTHETIC_FEEDBACK_REVIEW_OUTCOMES)[number];

export const SYNTHETIC_FEEDBACK_REVIEW_DIMENSIONS = [
  "structure",
  "clarity",
  "insight",
  "communication",
  "leadership",
] as const;

export type SyntheticFeedbackReviewDimension =
  (typeof SYNTHETIC_FEEDBACK_REVIEW_DIMENSIONS)[number];

export interface SyntheticFeedbackTranscriptEvent {
  eventId: string;
  answerBlockId: string | null;
  speaker: "interviewer" | "candidate";
  text: string;
}

export interface SyntheticFeedbackTranscriptVariant {
  id: "segmented" | "merged";
  events: SyntheticFeedbackTranscriptEvent[];
}

export interface SyntheticDimensionPresentation {
  dimension: SyntheticFeedbackReviewDimension;
  state: "scored" | "not_enough_evidence";
  score: number | null;
}

export interface SyntheticGroundedSignal {
  dimension: SyntheticFeedbackReviewDimension;
  observation: string;
  confidence: "strong" | "moderate" | "limited";
  citation: string;
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
    signals: SyntheticGroundedSignal[];
    prioritizedPracticeFocus: string | null;
    recovery:
      | "continue_practice"
      | "start_another_interview"
      | "retry_review"
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

const SCORED_DIMENSIONS: SyntheticDimensionPresentation[] = [
  { dimension: "structure", state: "scored", score: 8 },
  { dimension: "clarity", state: "scored", score: 7 },
  { dimension: "insight", state: "scored", score: 8 },
  { dimension: "communication", state: "scored", score: 7 },
  { dimension: "leadership", state: "scored", score: 7 },
];

const ALL_DIMENSIONS = [...SYNTHETIC_FEEDBACK_REVIEW_DIMENSIONS];

const SIGNAL: SyntheticGroundedSignal = {
  dimension: "insight",
  observation:
    "The answer connected a specific resident group to a recurring problem.",
  confidence: "strong",
  citation:
    "I would start with apartment residents who miss recycling pickup details.",
};

function sourceVariants(
  namespace: string
): SyntheticFeedbackTranscriptVariant[] {
  const prompt =
    "Design a tool that helps city residents reduce household waste.";
  const first =
    "I would start with apartment residents who miss recycling pickup details.";
  const second =
    "The first test would compare reminder completion with contamination reports.";
  const followUp = "What would you prioritize first?";
  const priority =
    "I would prioritize reminders before rewards because a missed pickup is the clearest recurring problem.";

  return [
    {
      id: "segmented",
      events: [
        {
          eventId: `${namespace}:prompt:segmented`,
          answerBlockId: null,
          speaker: "interviewer",
          text: prompt,
        },
        {
          eventId: `${namespace}:answer-1a`,
          answerBlockId: `${namespace}:answer-block-1`,
          speaker: "candidate",
          text: first,
        },
        {
          eventId: `${namespace}:answer-1b`,
          answerBlockId: `${namespace}:answer-block-1`,
          speaker: "candidate",
          text: second,
        },
        {
          eventId: `${namespace}:follow-up:segmented`,
          answerBlockId: null,
          speaker: "interviewer",
          text: followUp,
        },
        {
          eventId: `${namespace}:answer-2:segmented`,
          answerBlockId: `${namespace}:answer-block-2`,
          speaker: "candidate",
          text: priority,
        },
      ],
    },
    {
      id: "merged",
      events: [
        {
          eventId: `${namespace}:prompt:merged`,
          answerBlockId: null,
          speaker: "interviewer",
          text: prompt,
        },
        {
          eventId: `${namespace}:answer-1:merged`,
          answerBlockId: `${namespace}:answer-block-1`,
          speaker: "candidate",
          text: `${first} ${second}`,
        },
        {
          eventId: `${namespace}:follow-up:merged`,
          answerBlockId: null,
          speaker: "interviewer",
          text: followUp,
        },
        {
          eventId: `${namespace}:answer-2:merged`,
          answerBlockId: `${namespace}:answer-block-2`,
          speaker: "candidate",
          text: priority,
        },
      ],
    },
  ];
}

const FIXTURES: SyntheticFeedbackReviewOutcomeFixture[] = [
  {
    id: "full-scorecard-equivalent-segmentation",
    provenance: "fully_synthetic",
    sourceIntegrity: "verified",
    sourceVariants: sourceVariants("full"),
    expected: {
      outcome: "full_scorecard",
      withheldReason: null,
      dimensions: SCORED_DIMENSIONS,
      displayOverallScore: 8,
      signals: [SIGNAL],
      prioritizedPracticeFocus:
        "State the decision rule before comparing reminder and reward options.",
      recovery: "continue_practice",
      historyLabel: "Full scorecard ready",
      numericMetricContribution: {
        overall: true,
        dimensions: ALL_DIMENSIONS,
      },
    },
  },
  {
    id: "partial-scorecard-supported-dimensions-only",
    provenance: "fully_synthetic",
    sourceIntegrity: "verified",
    sourceVariants: sourceVariants("partial"),
    expected: {
      outcome: "partial_scorecard",
      withheldReason: "rubric_coverage",
      dimensions: [
        { dimension: "structure", state: "scored", score: 8 },
        { dimension: "clarity", state: "not_enough_evidence", score: null },
        { dimension: "insight", state: "scored", score: 8 },
        {
          dimension: "communication",
          state: "scored",
          score: 7,
        },
        {
          dimension: "leadership",
          state: "not_enough_evidence",
          score: null,
        },
      ],
      displayOverallScore: null,
      signals: [SIGNAL],
      prioritizedPracticeFocus:
        "Make the prioritization rule explicit before choosing an option.",
      recovery: "continue_practice",
      historyLabel: "Partial scorecard ready",
      numericMetricContribution: {
        overall: false,
        dimensions: ["structure", "insight", "communication"],
      },
    },
  },
  {
    id: "coaching-review-grounded-focus",
    provenance: "fully_synthetic",
    sourceIntegrity: "verified",
    sourceVariants: sourceVariants("coaching"),
    expected: {
      outcome: "coaching_review",
      withheldReason: "rubric_coverage",
      dimensions: [],
      displayOverallScore: null,
      signals: [SIGNAL],
      prioritizedPracticeFocus:
        "Name one decision rule, compare two options, and choose one.",
      recovery: "continue_practice",
      historyLabel: "Coaching review ready",
      numericMetricContribution: { overall: false, dimensions: [] },
    },
  },
  {
    id: "unable-no-reviewable-evidence",
    provenance: "fully_synthetic",
    sourceIntegrity: "verified",
    sourceVariants: sourceVariants("unable-coverage"),
    expected: {
      outcome: "unable_to_review",
      withheldReason: "rubric_coverage",
      dimensions: [],
      displayOverallScore: null,
      signals: [],
      prioritizedPracticeFocus: null,
      recovery: "start_another_interview",
      historyLabel: "Unable to review",
      numericMetricContribution: { overall: false, dimensions: [] },
    },
  },
  {
    id: "unable-integrity-retry",
    provenance: "fully_synthetic",
    sourceIntegrity: "failed",
    sourceVariants: sourceVariants("unable-integrity-retry"),
    expected: {
      outcome: "unable_to_review",
      withheldReason: "verified_evidence_integrity",
      dimensions: [],
      displayOverallScore: null,
      signals: [],
      prioritizedPracticeFocus: null,
      recovery: "retry_review",
      historyLabel: "Unable to review",
      numericMetricContribution: { overall: false, dimensions: [] },
    },
  },
  {
    id: "unable-integrity-credit-recovery",
    provenance: "fully_synthetic",
    sourceIntegrity: "failed",
    sourceVariants: sourceVariants("unable-integrity-credit"),
    expected: {
      outcome: "unable_to_review",
      withheldReason: "verified_evidence_integrity",
      dimensions: [],
      displayOverallScore: null,
      signals: [],
      prioritizedPracticeFocus: null,
      recovery: "credit_returned",
      historyLabel: "Unable to review",
      numericMetricContribution: { overall: false, dimensions: [] },
    },
  },
  {
    id: "unable-integrity-credit-recovery-pending",
    provenance: "fully_synthetic",
    sourceIntegrity: "failed",
    sourceVariants: sourceVariants("unable-integrity-credit-pending"),
    expected: {
      outcome: "unable_to_review",
      withheldReason: "verified_evidence_integrity",
      dimensions: [],
      displayOverallScore: null,
      signals: [],
      prioritizedPracticeFocus: null,
      recovery: "credit_recovery_in_progress",
      historyLabel: "Unable to review",
      numericMetricContribution: { overall: false, dimensions: [] },
    },
  },
];

export function createSyntheticFeedbackReviewOutcomeFixtures(): SyntheticFeedbackReviewOutcomeFixture[] {
  return structuredClone(FIXTURES);
}
