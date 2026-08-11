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

  for (const summary of RATING_COPY_REJECTIONS) {
    assert.throws(() =>
      parseEvidenceLimitedFeedback(
        { ...response(), summary },
        { transcript, modelVersion: "fixture-model-v1" }
      )
    );
  }
});

test("rejects article-less and article-bearing rating contexts", () => {
  for (const copy of RATING_COPY_REJECTIONS) {
    const candidate = response();
    candidate.strengths[0]!.nextStep = copy;
    assert.throws(
      () =>
        parseEvidenceLimitedFeedback(candidate, {
          transcript,
          modelVersion: "fixture-model-v1",
        }),
      /evidence-limited feedback must withhold numerical ratings/,
      copy
    );
  }
});

test("preserves legitimate compound, count, metric, date, and time copy", () => {
  for (const copy of LEGITIMATE_QUANTITATIVE_COPY) {
    const candidate = response();
    candidate.strengths[0]!.nextStep = copy;
    const parsed = parseEvidenceLimitedFeedback(candidate, {
      transcript,
      modelVersion: "fixture-model-v1",
    });
    assert.equal(parsed.strengths[0]!.nextStep, copy);
  }
});

const RATING_COPY_REJECTIONS = [
  "The recorded answer receives a score of 8.",
  "The recorded answer is rated eight out of ten.",
  "The recorded answer receives 8/10.",
  "Aim for eight.",
  "Aim for 8.",
  "Aim for an eight.",
  "Aim for eight-ish.",
  "Aim for eight overall.",
  "Aim for an eight overall.",
  "The answer lands at 8.5 overall.",
  "Overall, this response is nine.",
  "Overall, this response is a nine.",
  "Overall: eight.",
  "Target overall seven next time.",
  "Target an overall seven next time.",
  "Target eight next time.",
  "Work toward eight next time.",
  "Work toward an eight next time.",
  "I would call this answer eight.",
  "I would call this answer an eight.",
  "Consider this response eight.",
  "This answer is eight.",
  "This answer is an eight.",
  "This answer is eight-ish.",
  "This answer is an eight-point score.",
  "This answer is an eight-stage rating.",
  "This answer is an eight-pillar evaluation.",
  "This answer is an eight-point overall.",
  "This answer is: an eight-point score.",
  "This answer is — an eight-stage rating.",
  "This answer is—an eight-stage rating.",
  "This answer is:\neight stars.",
  "This answer is an eight-stage product quality rating.",
  "This answer is eight stars.",
  "This answer is an eight-star review.",
  "Give this response eight.",
  "Give this response an eight.",
  "Give this response an eight-stage grade.",
  "Give this response:\nan eight-stage grade.",
  "Award the answer eight.",
  "Rate this answer eight.",
  "Rate this answer eight stars.",
  "Rate this answer:\neight stars.",
  "Score the response eight.",
  "Grade this attempt eight.",
  "Assess this performance at eight.",
  "Evaluate this answer as eight.",
  "This response earns eight.",
  "This response earns eight points.",
  "This response earns eight metrics as its score.",
  "This response earns eight metrics; use them as its score.",
  "This response earns eight metrics. Treat that count as its rating.",
  "This response earns:\neight metrics as its score.",
  "This response earns eight metrics, then use them as its score.",
  "This response earns eight metrics — use them as its score.",
  "This response merits eight.",
  "Aim for an eight-point rating.",
  "Aim for: an eight-point rating.",
  "Aim for an eight-layer assessment.",
  "Overall? Eight.",
  "Overall?\nEight.",
  "Overall — eight.",
  "Overall:\nEight.",
] as const;

const LEGITIMATE_QUANTITATIVE_COPY = [
  "Use an eight-stage funnel analysis to compare activation drop-off.",
  "Target an eight-stage funnel analysis with explicit decision points.",
  "The answer is an eight-point framework with explicit decision criteria.",
  "This response is an eight-stage funnel analysis.",
  "The answer is an eight-pillar framework for prioritization.",
  "This response is an eight-layer analysis of the system constraints.",
  "Aim for an eight-section roadmap with explicit decision points.",
  "Target an eight-workstream plan for the partner rollout.",
  "Give this response an eight-criterion matrix for comparing options.",
  "I would call this answer an eight-touchpoint journey analysis.",
  "Aim for eight customer interviews, then compare their product ratings.",
  "Aim for eight customer interviews and compare their product ratings.",
  "Target eight segments, then score each opportunity by reach.",
  "Target eight segments then score each opportunity by reach.",
  "This answer is eight minutes long. Score the options by impact.",
  "Give this response an eight-criterion matrix, then grade the risks by severity.",
  "Target eight workstreams and mark each dependency as blocked or clear.",
  "Plot eight points on a prioritization chart.",
  "Use an eight-star schema for catalog metadata.",
  "Track eight evaluation criteria as research inputs.",
  "Aim for eight customer interviews before August 8.",
  "Interview eight users and compare three customer segments.",
  "This answer is eight minutes long and cites 8% market share.",
  "Reach eight million dollars in revenue by August 8.",
  "Target 8% market share and $8 million revenue.",
  "Track three activation metrics and a 200 ms latency guardrail.",
  "Plan an eight-week pilot with 30-day and two-hour estimates.",
  "Compare the 2026 baseline with the 2027 target.",
  "Score eight customer interviews against three research criteria.",
  "This response earns eight customer referrals and $8 million revenue.",
  "By August 8, plan an eight-week pilot, interview eight users, target 8% market share and $8 million revenue, and track three activation metrics plus a 200 ms latency guardrail.",
] as const;
