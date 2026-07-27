import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackV2View,
} from "@meelni/core";
import type {
  ComparisonData,
  SessionAttempt,
  SessionComparisonDetail,
} from "@/lib/types/comparison";

export const BROWSER_QA_SESSION_ID = "7b464305-948d-42c5-889f-f030c7db33bd";

export const dashboardSessions = [
  {
    id: BROWSER_QA_SESSION_ID,
    userId: "browser-qa-user",
    role: "product_manager",
    roundType: "product_sense",
    mode: "voice_video",
    startedAt: "2026-07-17T17:00:00.000Z",
    endedAt: "2026-07-17T17:30:00.000Z",
    feedback: {
      status: "completed",
      overallScore: "7.6",
      structureScore: 7,
      clarityScore: 8,
      insightScore: 8,
      communicationScore: 7,
      leadershipScore: 8,
    },
  },
];

export const dashboardStatusSessions = [
  {
    id: "browser-qa-not-scored",
    userId: "browser-qa-user",
    role: "product_manager",
    roundType: "product_sense",
    mode: "voice_video",
    startedAt: "2026-07-21T17:00:00.000Z",
    endedAt: "2026-07-21T17:30:00.000Z",
  },
  {
    id: "browser-qa-score-unavailable",
    userId: "browser-qa-user",
    role: "product_manager",
    roundType: "strategy",
    mode: "voice_video",
    startedAt: "2026-07-20T17:00:00.000Z",
    endedAt: "2026-07-20T17:30:00.000Z",
    feedback: {
      status: "completed",
      overallScore: null,
    },
  },
  {
    id: "browser-qa-feedback-failed",
    userId: "browser-qa-user",
    role: "product_manager",
    roundType: "execution",
    mode: "voice_video",
    startedAt: "2026-07-19T17:00:00.000Z",
    endedAt: "2026-07-19T17:30:00.000Z",
    feedback: {
      status: "failed",
      overallScore: null,
    },
  },
  {
    id: "browser-qa-feedback-skipped",
    userId: "browser-qa-user",
    role: "product_manager",
    roundType: "behavioral",
    mode: "voice_video",
    startedAt: "2026-07-18T17:00:00.000Z",
    endedAt: "2026-07-18T17:30:00.000Z",
    feedback: {
      status: "skipped",
      overallScore: null,
    },
  },
  dashboardSessions[0]!,
];

export const analyticsSessions = [
  dashboardSessions[0]!,
  {
    ...dashboardSessions[0]!,
    id: "browser-qa-analytics-2",
    startedAt: "2026-07-10T17:00:00.000Z",
    endedAt: "2026-07-10T17:30:00.000Z",
    feedback: {
      status: "completed",
      overallScore: "7.1",
      structureScore: 6.5,
      clarityScore: 7.5,
      insightScore: 7,
      communicationScore: 7.5,
      leadershipScore: 7,
    },
  },
  {
    ...dashboardSessions[0]!,
    id: "browser-qa-analytics-3",
    startedAt: "2026-07-03T17:00:00.000Z",
    endedAt: "2026-07-03T17:30:00.000Z",
    feedback: {
      status: "completed",
      overallScore: "6.6",
      structureScore: 6,
      clarityScore: 7,
      insightScore: 6.5,
      communicationScore: 7,
      leadershipScore: 6.5,
    },
  },
];

export const analyticsInsights = {
  overall: {
    totalSessions: analyticsSessions.length,
    completedSessions: analyticsSessions.length,
  },
  trends: {
    improvementTrend: "improving" as const,
    velocity: 0.5,
  },
  competencies: {
    structure: 6.5,
    clarity: 7.5,
    insight: 7,
  },
};

const evidenceTurn = "browser-qa-turn-1";

export const completedFeedback: FeedbackV2View = {
  id: "browser-qa-feedback",
  sessionId: BROWSER_QA_SESSION_ID,
  kind: "v2",
  evaluationState: "full",
  schemaVersion: FEEDBACK_SCHEMA_VERSION,
  promptVersion: FEEDBACK_PROMPT_VERSION,
  modelVersion: "synthetic-browser-qa",
  rubricVersion: FEEDBACK_RUBRIC_VERSION,
  createdAt: "2026-07-17T17:35:00.000Z",
  nextPracticeRecommendation: null,
  scores: {
    structure: 7,
    clarity: 8,
    insight: 8,
    communication: 7,
    leadership: 8,
    overall: 7.6,
  },
  summary:
    "The answer identified a clear user problem and connected the proposal to a measurable outcome.",
  strengths: [
    {
      dimension: "insight",
      observation: "The response chose a specific audience and need.",
      transcriptRefs: [evidenceTurn],
      evidence: [
        {
          turnRef: evidenceTurn,
          quote: "focus on new parents and their late-night support needs",
        },
      ],
      nextStep:
        "Keep this level of specificity through the solution trade-offs.",
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      confidence: 0.9,
    },
  ],
  improvements: [
    {
      dimension: "structure",
      observation: "The comparison did not define a decision threshold.",
      transcriptRefs: [evidenceTurn],
      evidence: [
        {
          turnRef: evidenceTurn,
          quote: "compare the options after the first experiment",
        },
      ],
      nextStep: "State the threshold before comparing the options.",
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      confidence: 0.84,
    },
  ],
};

const longEvidenceSegment = "evidence-segment-".repeat(24);

export const partialFeedback: FeedbackV2View = {
  ...completedFeedback,
  id: "browser-qa-partial-feedback",
  evaluationState: "partial",
  summary: `The recorded portion supports a limited observation while this intentionally long token verifies strict reflow: ${longEvidenceSegment}`,
  strengths: completedFeedback.strengths.map((finding) => ({
    ...finding,
    nextStep: `Preserve the clear audience definition while testing a longer responsive action: ${longEvidenceSegment}`,
  })),
  improvements: completedFeedback.improvements.map((finding) => ({
    ...finding,
    observation: `The recorded portion did not establish a complete decision threshold: ${longEvidenceSegment}`,
  })),
};

export const comparisonAttempts: SessionAttempt[] = [
  comparisonAttempt("browser-qa-attempt-latest", "2026-07-17T17:00:00.000Z", 8),
  comparisonAttempt("browser-qa-attempt-middle", "2026-07-10T17:00:00.000Z", 7),
  comparisonAttempt(
    "browser-qa-attempt-earliest",
    "2026-07-03T17:00:00.000Z",
    6
  ),
];

export function comparisonFor(earlierId: string): ComparisonData {
  const earlier = comparisonAttempts.find(
    (attempt) => attempt.id === earlierId
  );
  const latest = comparisonAttempts[0];
  if (!earlier || !latest) {
    throw new Error(`Unknown synthetic comparison attempt: ${earlierId}`);
  }

  const session1 = comparisonDetail(earlier);
  const session2 = comparisonDetail(latest);
  return {
    session1,
    session2,
    scoreDelta: {
      overall: scoreDelta(session1.scores.overall, session2.scores.overall),
      structure: scoreDelta(
        session1.scores.structure,
        session2.scores.structure
      ),
      clarity: scoreDelta(session1.scores.clarity, session2.scores.clarity),
      insight: scoreDelta(session1.scores.insight, session2.scores.insight),
      communication: scoreDelta(
        session1.scores.communication,
        session2.scores.communication
      ),
      leadership: scoreDelta(
        session1.scores.leadership,
        session2.scores.leadership
      ),
    },
  };
}

export const transcriptTurns = [
  {
    eventId: "browser-qa-interviewer-1",
    speaker: "interviewer" as const,
    text: "Design a product that helps new parents find trusted support.",
    timestamp: new Date("2026-07-17T17:00:00.000Z"),
  },
  {
    eventId: evidenceTurn,
    speaker: "user" as const,
    text: "I would focus on new parents and their late-night support needs, then measure successful weekly connections.",
    timestamp: new Date("2026-07-17T17:01:00.000Z"),
  },
];

export const publicQuestions = [
  {
    id: "browser-qa-question-1",
    company: "Acme Product Organization With An Intentionally Long Name",
    questionText:
      "Design a product that helps new parents find trusted support during late-night moments when existing resources feel fragmented.",
    questionType: "Product Sense",
    askedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    isActive: true,
  },
  {
    id: "browser-qa-question-2",
    company: "Northstar",
    questionText:
      "How would you diagnose a sudden decline in weekly activation?",
    questionType: "Execution",
    askedAt: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    isActive: true,
  },
  ...Array.from({ length: 16 }, (_, index) => {
    const companies = ["Northstar", "Meridian", "Figma", "Stripe"];
    const questionTypes = [
      "Product Sense",
      "Execution",
      "Strategy",
      "Behavioral",
    ];
    const number = index + 3;

    return {
      id: `browser-qa-question-${number}`,
      company: companies[index % companies.length],
      questionText: [
        "How would you improve discovery for a collaboration product used by distributed teams?",
        "A core activation metric fell after launch. How would you find the cause and decide what to do next?",
        "Your company is entering a crowded market. Which customer segment would you prioritize and why?",
        "Tell me about a time you changed direction after receiving evidence that challenged your plan.",
      ][index % 4]!,
      questionType: questionTypes[index % questionTypes.length]!,
      askedAt: `2026-07-${String(number).padStart(2, "0")}T00:00:00.000Z`,
      createdAt: `2026-07-${String(number).padStart(2, "0")}T00:00:00.000Z`,
      isActive: true,
    };
  }),
];

function comparisonAttempt(
  id: string,
  startedAt: string,
  score: number
): SessionAttempt {
  return {
    id,
    startedAt,
    endedAt: startedAt,
    roundType: "product_sense",
    mode: "voice_video",
    overallScore: score,
    structureScore: score,
    clarityScore: score,
    insightScore: score,
    communicationScore: score,
    leadershipScore: score,
  };
}

function comparisonDetail(attempt: SessionAttempt): SessionComparisonDetail {
  const score = attempt.overallScore;
  return {
    id: attempt.id,
    startedAt: attempt.startedAt,
    endedAt: attempt.endedAt,
    roundType: attempt.roundType,
    mode: attempt.mode,
    scores: {
      overall: score,
      structure: score,
      clarity: score,
      insight: score,
      communication: score,
      leadership: score,
    },
    feedback: {
      strengths: ["The answer named a specific candidate problem."],
      improvements: ["State the decision threshold before comparing options."],
      summary: `Synthetic comparison summary for ${attempt.id}.`,
    },
    keyQuotes: ["Focus on new parents and their late-night support needs."],
  };
}

function scoreDelta(earlier: number | null, latest: number | null) {
  return earlier === null || latest === null ? null : latest - earlier;
}
