import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackV2View,
} from "@meelni/core";

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
];
