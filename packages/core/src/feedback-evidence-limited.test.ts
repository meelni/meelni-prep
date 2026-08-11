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

  for (const summary of [
    "The recorded answer receives a score of 8.",
    "The recorded answer is rated eight out of ten.",
    "The recorded answer receives 8/10.",
  ]) {
    assert.throws(() =>
      parseEvidenceLimitedFeedback(
        { ...response(), summary },
        { transcript, modelVersion: "fixture-model-v1" }
      )
    );
  }
});
