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

test("parses grounded narrative feedback while withholding scores", () => {
  const parsed = parseEvidenceLimitedFeedback(response(), {
    transcript,
    modelVersion: "fixture-model-v1",
  });
  assert.equal(parsed.schemaVersion, FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION);
  assert.equal("scores" in parsed, false);
  assert.equal(parsed.strengths.length, 1);
  assert.equal(parsed.improvements.length, 0);
});

test("rejects ungrounded, empty, and score-bearing narrative responses", () => {
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

  const covertRecommendation = response();
  covertRecommendation.strengths[0]!.nextStep = "Aim for an eight overall.";
  assert.throws(() =>
    parseEvidenceLimitedFeedback(covertRecommendation, {
      transcript,
      modelVersion: "fixture-model-v1",
    })
  );

  for (const summary of [
    "The recorded answer receives a score of 8.",
    "The recorded answer is rated eight out of ten.",
    "The recorded answer receives 8/10.",
    "Aim for an eight overall.",
    "The answer lands at 8.5 overall.",
    "Overall, this response is a nine.",
    "Target an overall seven next time.",
    "Work toward an eight next time.",
    "I would call this answer an eight.",
    "This answer is an eight.",
    "Give this response an eight.",
  ]) {
    assert.throws(() =>
      parseEvidenceLimitedFeedback(
        { ...response(), summary },
        { transcript, modelVersion: "fixture-model-v1" }
      )
    );
  }
});

test("preserves non-evaluative quantities in evidence and recommendations", () => {
  const quantitative = response();
  quantitative.strengths[0]!.nextStep =
    "By August 8, plan an eight-week pilot, interview eight users, target 8% market share and $8 million revenue, and track three activation metrics plus a 200 ms latency guardrail.";

  const parsed = parseEvidenceLimitedFeedback(quantitative, {
    transcript,
    modelVersion: "fixture-model-v1",
  });

  assert.match(parsed.strengths[0]!.nextStep, /8% market share/);
  assert.match(parsed.strengths[0]!.nextStep, /\$8 million revenue/);
  assert.match(parsed.strengths[0]!.nextStep, /eight-week pilot/);
});
