import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  FeedbackV2ParseError,
  isFeedbackV2Item,
  projectFeedbackItems,
  parseFeedbackV2,
} from "./feedback-v2";

const transcript = [
  {
    eventId: "writer-a:1",
    speaker: "user" as const,
    text: "I would start with working parents and measure weekly completed plans.",
  },
  {
    eventId: "writer-a:2",
    speaker: "user" as const,
    text: "The trade-off is speed versus confidence, so I would test a concierge flow first.",
  },
];

function validResponse() {
  return {
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "full",
    scores: {
      structure: 8,
      clarity: 7,
      insight: 9,
      communication: 7,
      leadership: 8,
    },
    strengths: [
      {
        dimension: "insight",
        observation:
          "The answer chooses a specific audience and measurable behavior.",
        transcriptRefs: ["writer-a:1"],
        evidence: [
          {
            turnRef: "writer-a:1",
            quote: "working parents and measure weekly completed plans",
          },
        ],
        nextStep: "Carry the segment into solution prioritization.",
        rubricVersion: FEEDBACK_RUBRIC_VERSION,
        confidence: 0.9,
      },
    ],
    improvements: [
      {
        dimension: "structure",
        observation: "The experiment lacks an explicit success threshold.",
        transcriptRefs: ["writer-a:2"],
        evidence: [
          {
            turnRef: "writer-a:2",
            quote: "test a concierge flow first",
          },
        ],
        nextStep: "Name the decision threshold before describing the test.",
        rubricVersion: FEEDBACK_RUBRIC_VERSION,
        confidence: 0.8,
      },
    ],
    drills: ["Define one metric and decision threshold before each answer."],
    summary:
      "The answer is specific and measurable, with room for clearer experiment criteria.",
  };
}

test("parses complete grounded feedback and computes the canonical overall score", () => {
  const result = parseFeedbackV2(validResponse(), {
    transcript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });

  assert.equal(result.overallScore, 7.9);
  assert.equal(result.modelVersion, "gpt-test-1");
  assert.equal(result.strengths[0].evidence[0].turnRef, "writer-a:1");
});

test("projects legacy and v2 items into safe comparison text", () => {
  assert.deepEqual(
    projectFeedbackItems([
      "Legacy strength",
      { text: "Legacy object strength", dimension: "clarity" },
      validResponse().strengths[0],
      { unexpected: true },
    ]),
    [
      "Legacy strength",
      "Legacy object strength",
      "The answer chooses a specific audience and measurable behavior. Next step: Carry the segment into solution prioritization.",
    ]
  );
});

test("recognizes only complete feedback v2 items at read boundaries", () => {
  const valid = validResponse().strengths[0];
  assert.equal(isFeedbackV2Item(valid), true);

  const invalidItems = [
    { ...valid, observation: " " },
    { ...valid, transcriptRefs: [] },
    { ...valid, transcriptRefs: ["writer-a:1", "writer-a:1"] },
    { ...valid, evidence: [null] },
    { ...valid, evidence: [{ turnRef: "writer-a:1", quote: " " }] },
    {
      ...valid,
      transcriptRefs: ["writer-a:1"],
      evidence: [{ turnRef: "writer-a:2", quote: "exact text" }],
    },
    { ...valid, nextStep: " " },
    { ...valid, confidence: Number.NaN },
    { ...valid, confidence: 1.1 },
  ];

  for (const invalid of invalidItems) {
    assert.equal(isFeedbackV2Item(invalid), false);
  }
});

test("accepts an explicitly matching partial evaluation state", () => {
  const response = { ...validResponse(), evaluationState: "partial" };
  const result = parseFeedbackV2(response, {
    transcript,
    evaluationState: "partial",
    modelVersion: "gpt-test-1",
  });
  assert.equal(result.evaluationState, "partial");
});

test("rejects incomplete findings instead of inferring missing fields", () => {
  const response = validResponse();
  delete (response.strengths[0] as Partial<(typeof response.strengths)[number]>)
    .nextStep;
  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    FeedbackV2ParseError
  );
});

test("rejects evidence quotes that do not exactly occur in the referenced turn", () => {
  const response = validResponse();
  response.strengths[0].evidence[0].quote = "Working Parents";
  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /quote is not exact evidence/
  );
});

test("accepts evidence from a canonical candidate turn", () => {
  const result = parseFeedbackV2(validResponse(), {
    transcript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });

  assert.equal(result.strengths[0].evidence[0].turnRef, "writer-a:1");
});

test("rejects an exact quote from an interviewer turn as candidate evidence", () => {
  const response = validResponse();
  response.strengths[0].transcriptRefs[0] = "writer-a:interviewer";
  response.strengths[0].evidence[0] = {
    turnRef: "writer-a:interviewer",
    quote: "prioritized enterprise customers",
  };

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: [
          ...transcript,
          {
            eventId: "writer-a:interviewer",
            speaker: "interviewer",
            text: "You clearly prioritized enterprise customers.",
          },
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /must reference a candidate turn/
  );
});

test("rejects reference and evidence sets that do not match", () => {
  const response = validResponse();
  response.strengths[0].transcriptRefs.push("writer-a:2");
  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /transcriptRefs and evidence references must match/
  );
});

test("rejects unknown keys at every object boundary", () => {
  const mutations: Array<(response: ReturnType<typeof validResponse>) => void> =
    [
      (response) => Object.assign(response, { overallScore: 8 }),
      (response) => Object.assign(response.scores, { persuasion: 8 }),
      (response) =>
        Object.assign(response.strengths[0], { text: "legacy field" }),
      (response) =>
        Object.assign(response.strengths[0].evidence[0], { speaker: "user" }),
    ];

  for (const mutate of mutations) {
    const response = validResponse();
    mutate(response);
    assert.throws(
      () =>
        parseFeedbackV2(response, {
          transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      /contains unknown field/
    );
  }
});

test("rejects version, state, score, confidence, and transcript identity mismatches", () => {
  const mutations: Array<(response: ReturnType<typeof validResponse>) => void> =
    [
      (response) => {
        response.schemaVersion =
          "feedback.v1" as typeof FEEDBACK_SCHEMA_VERSION;
      },
      (response) => {
        response.evaluationState = "partial";
      },
      (response) => {
        response.scores.structure = 11;
      },
      (response) => {
        response.strengths[0].confidence = 1.1;
      },
      (response) => {
        response.strengths[0].transcriptRefs[0] = "missing";
        response.strengths[0].evidence[0].turnRef = "missing";
      },
    ];

  for (const mutate of mutations) {
    const response = validResponse();
    mutate(response);
    assert.throws(() =>
      parseFeedbackV2(response, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      })
    );
  }
});
