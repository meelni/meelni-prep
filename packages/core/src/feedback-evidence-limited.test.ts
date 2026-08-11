import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  parseEvidenceLimitedFeedback,
} from "./feedback-evidence-limited";
import { FEEDBACK_RUBRIC_VERSION } from "./feedback-v2";

const transcript = [
  {
    eventId: "writer:answer:1",
    speaker: "user" as const,
    text: "I would prioritize working parents because weekly scheduling creates recurring coordination pain.",
  },
];

function response() {
  return {
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "partial",
    strengths: [
      {
        dimension: "insight",
        observation:
          "The answer prioritizes working parents and recurring coordination pain.",
        transcriptRefs: ["writer:answer:1"],
        evidence: [
          {
            turnRef: "writer:answer:1",
            quote:
              "prioritize working parents because weekly scheduling creates recurring coordination pain",
          },
        ],
        nextStep:
          "Use the same specificity in the next focused practice answer.",
        rubricVersion: FEEDBACK_RUBRIC_VERSION,
        confidence: 0.7,
      },
    ],
    improvements: [],
    summary:
      "The recorded answer prioritizes working parents and recurring coordination pain.",
  };
}

test("parses grounded qualitative feedback with numeric-free narrative", () => {
  const parsed = parseEvidenceLimitedFeedback(response(), {
    transcript,
    modelVersion: "fixture-model-v1",
  });
  assert.equal(parsed.schemaVersion, FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION);
  assert.equal("scores" in parsed, false);
  assert.equal(parsed.strengths.length, 1);
  assert.equal(parsed.improvements.length, 0);
});

test("rejects ungrounded, empty, and structurally score-bearing responses", () => {
  const ungrounded = response();
  ungrounded.strengths[0]!.evidence[0]!.quote = "invented evidence";
  assert.throws(() =>
    parseEvidenceLimitedFeedback(ungrounded, {
      transcript,
      modelVersion: "fixture-model-v1",
    })
  );

  const empty = response();
  empty.strengths = [];
  assert.throws(() =>
    parseEvidenceLimitedFeedback(empty, {
      transcript,
      modelVersion: "fixture-model-v1",
    })
  );

  assert.throws(() =>
    parseEvidenceLimitedFeedback(
      { ...response(), scores: { structure: 7 } },
      { transcript, modelVersion: "fixture-model-v1" }
    )
  );
});

test("rejects every reproduced numeric-value representation in model narrative", () => {
  for (const copy of NUMERIC_VALUE_REJECTIONS) {
    const candidate = response();
    candidate.strengths[0]!.nextStep = copy;
    assert.throws(
      () =>
        parseEvidenceLimitedFeedback(candidate, {
          transcript,
          modelVersion: "fixture-model-v1",
        }),
      /evidence-limited narrative must be numeric-value-free/,
      copy
    );
  }
});

test("canonicalizes safe model narrative while preserving exact evidence bytes", () => {
  const candidate = response();
  candidate.strengths[0]!.observation =
    "The answer prioritizes working parents and recurring coordination pain.\u2060";
  candidate.strengths[0]!.nextStep =
    "Use the same specificity in the next focused practice answer.\u200B";
  candidate.summary =
    "Ｔｈｅ recorded answer prioritizes working parents and recurring coordination pain.";

  const parsed = parseEvidenceLimitedFeedback(candidate, {
    transcript,
    modelVersion: "fixture-model-v1",
  });
  assert.equal(
    parsed.strengths[0]!.observation,
    "The answer prioritizes working parents and recurring coordination pain."
  );
  assert.equal(
    parsed.strengths[0]!.nextStep,
    "Use the same specificity in the next focused practice answer."
  );
  assert.equal(
    parsed.summary,
    "The recorded answer prioritizes working parents and recurring coordination pain."
  );
  assert.equal(
    parsed.strengths[0]!.evidence[0]!.quote,
    candidate.strengths[0]!.evidence[0]!.quote
  );
});

test("keeps exact quantitative transcript evidence outside numeric-free narrative", () => {
  const quantitativeTranscript = [
    {
      eventId: "writer:quantitative:1",
      speaker: "user" as const,
      text: "I interviewed twelve customers, tracked activation at 40%, and compared an 8/10 conversion ratio on August 8.",
    },
  ];
  const quantitative = response();
  quantitative.strengths[0] = {
    ...quantitative.strengths[0]!,
    observation:
      "The answer connects customer research with a concrete activation metric.",
    transcriptRefs: ["writer:quantitative:1"],
    evidence: [
      {
        turnRef: "writer:quantitative:1",
        quote:
          "interviewed twelve customers, tracked activation at 40%, and compared an 8/10 conversion ratio on August 8",
      },
    ],
    nextStep:
      "Connect the activation metric to a clear product decision in focused practice.",
  };
  quantitative.summary =
    "The answer connects customer research with a concrete activation metric.";

  const parsed = parseEvidenceLimitedFeedback(quantitative, {
    transcript: quantitativeTranscript,
    modelVersion: "fixture-model-v1",
  });
  assert.match(parsed.strengths[0]!.evidence[0]!.quote, /40%/);
  assert.match(parsed.strengths[0]!.evidence[0]!.quote, /8\/10/);
  assert.doesNotMatch(parsed.strengths[0]!.observation, /\p{N}/u);
  assert.doesNotMatch(parsed.summary, /\p{N}/u);
});

test("accepts useful qualitative PM feedback without numeric values", () => {
  for (const copy of QUALITATIVE_NARRATIVE_ACCEPTANCE) {
    const candidate = response();
    candidate.strengths[0]!.nextStep = copy;
    const parsed = parseEvidenceLimitedFeedback(candidate, {
      transcript,
      modelVersion: "fixture-model-v1",
    });
    assert.equal(parsed.strengths[0]!.nextStep, copy);
  }
});

const NUMERIC_VALUE_REJECTIONS = [
  "This answer is e\u200Bight.",
  "Return a sc\u200Bore.",
  "This answer earns eight st\u200Bars.",
  "This answer is ８.",
  "This answer is ⑧.",
  "This answer is ①⓪.",
  "This answer is Ⅷ.",
  "This answer is ⁸.",
  "Use a score estimate of eight.",
  "The appraisal is twelve.",
  "The verdict is fourteen.",
  "The ranking is twenty.",
  "Use an eight-part scorecard.",
  "The rating summary places it at twelve.",
  "The review summary places it at twelve.",
  "This answer is 12.",
  "The result is 12.5.",
  "The range is 12-14.",
  "The range is twelve to fourteen.",
  "The result is one hundred.",
  "Use an 8/10 conversion ratio as a benchmark.",
  "Use eight customer interviews and treat them as its rating.",
  "Choose eight segments, and that is the verdict.",
  "This answer includes eight metrics; this is its ranking.",
  "Use the eighth interview as the anchor.",
  "Use the twenty-first interview as the anchor.",
  "The answer earned A+.",
  "The answer received a B.",
  "The answer received grade A.",
  "The answer earned Ａ＋.",
] as const;

const QUALITATIVE_NARRATIVE_ACCEPTANCE = [
  "Name a concrete activation metric and explain why it changes the decision.",
  "Compare customer segments using reach, confidence, and strategic fit.",
  "Use a qualitative appraisal and a decision scorecard to explain the tradeoff.",
  "Describe the review summary without copying quantitative values into feedback.",
  "Connect the market-share evidence to customer value in focused practice.",
] as const;
