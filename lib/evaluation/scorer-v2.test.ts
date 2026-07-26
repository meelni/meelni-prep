import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  FeedbackV2ParseError,
  type FeedbackV2RejectionCode,
  type FeedbackV2Result,
} from "@meelni/core";
import {
  FeedbackProviderInvocationError,
  getAuthenticatedFeedbackRejectionCode,
  normalizeFeedbackV2Recommendations,
  parseFeedbackProviderEvaluation,
} from "./scorer";
import { projectEvaluationTranscriptAliases } from "./transcript-aliases";

function resultWithRecommendations(drills: string[]): FeedbackV2Result {
  const finding = {
    dimension: "structure" as const,
    observation: "The answer states a clear sequence.",
    transcriptRefs: ["candidate:1"],
    evidence: [{ turnRef: "candidate:1", quote: "First, I define the goal." }],
    nextStep: "Keep making the sequence explicit.",
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    confidence: 0.9,
  };

  return {
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    modelVersion: "fixture-model-v1",
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "full",
    scores: {
      structure: 8,
      clarity: 8,
      insight: 8,
      communication: 8,
      leadership: 8,
    },
    overallScore: 8,
    strengths: [finding],
    improvements: [
      {
        ...finding,
        observation: "The answer does not name a decision threshold.",
        nextStep: "State the decision threshold before comparing options.",
      },
    ],
    drills,
    summary: "Grounded fixture feedback.",
  };
}

test("feedback v2 fails closed when normalization removes every recommendation", () => {
  assert.throws(
    () =>
      normalizeFeedbackV2Recommendations(
        resultWithRecommendations(["Do ten reps focused on metrics."])
      ),
    /requires at least one product-language-safe practice recommendation/
  );
});

test("feedback v2 retains valid recommendations when a mixed list is normalized", () => {
  const result = normalizeFeedbackV2Recommendations(
    resultWithRecommendations([
      "Do ten reps focused on metrics.",
      "State one outcome metric and one decision threshold.",
    ])
  );

  assert.deepEqual(result.drills, [
    "State one outcome metric and one decision threshold.",
  ]);
});

test("provider parser authenticates only content-free invariant classifications", () => {
  const canonicalTranscript = [
    {
      eventId: "candidate:1",
      speaker: "user" as const,
      text: "I would start with working parents and measure weekly completed plans.",
    },
    {
      eventId: "candidate:2",
      speaker: "user" as const,
      text: "The trade-off is speed versus confidence, so I would test a concierge flow first.",
    },
  ];
  const projection = projectEvaluationTranscriptAliases(canonicalTranscript);
  const usage = {
    inputTokens: 100,
    cachedInputTokens: 10,
    outputTokens: 50,
    totalTokens: 150,
  };
  const providerValue = {
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
        transcriptRefs: ["turn_0001"],
        evidence: [
          {
            turnRef: "turn_0001",
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
        observation:
          "The concierge experiment lacks an explicit success threshold.",
        transcriptRefs: ["turn_0002"],
        evidence: [
          { turnRef: "turn_0002", quote: "test a concierge flow first" },
        ],
        nextStep: "Name the decision threshold before describing the test.",
        rubricVersion: FEEDBACK_RUBRIC_VERSION,
        confidence: 0.8,
      },
    ],
    drills: ["Define one metric and decision threshold before each answer."],
    summary: "Feedback is limited to the grounded findings above.",
  };
  const parse = (value: unknown) =>
    parseFeedbackProviderEvaluation({
      value,
      transcript: projection.transcript,
      canonicalIdByAlias: projection.canonicalIdByAlias,
      evaluationState: "full",
      observedModel: "gpt-test-1",
      observedServiceTier: "default",
      usage,
    });
  const parseWithCalibrationHints = (value: unknown) =>
    parseFeedbackProviderEvaluation({
      value,
      transcript: projection.transcript,
      canonicalIdByAlias: projection.canonicalIdByAlias,
      evaluationState: "full",
      observedModel: "gpt-test-1",
      observedServiceTier: "default",
      usage,
      calibrationEvidenceHints: [
        {
          kind: "strength",
          dimension: "insight",
          turnRef: "candidate:1",
          quote: "working parents and measure weekly completed plans",
        },
        {
          kind: "improvement",
          dimension: "structure",
          turnRef: "candidate:2",
          quote: "test a concierge flow first",
        },
      ],
    });

  const repairedSummary = parse({
    ...providerValue,
    summary: "The answer invents blockchain moons.",
  }).evaluation;
  assert.equal(
    repairedSummary.summary,
    [
      providerValue.strengths[0].observation,
      providerValue.improvements[0].observation,
    ].join(" ")
  );
  assert.deepEqual(repairedSummary.strengths[0].transcriptRefs, [
    "candidate:1",
  ]);

  const overlappingEvidence = {
    ...providerValue,
    improvements: [
      {
        ...providerValue.improvements[0],
        transcriptRefs: ["turn_0001"],
        evidence: [
          {
            turnRef: "turn_0001",
            quote: "measure weekly completed plans",
          },
        ],
      },
    ],
  };
  let overlappingCaught: unknown;
  try {
    parse(overlappingEvidence);
  } catch (error) {
    overlappingCaught = error;
  }
  assert.ok(overlappingCaught instanceof FeedbackProviderInvocationError);
  assert.equal(
    getAuthenticatedFeedbackRejectionCode(overlappingCaught),
    "evidence_overlaps_across_findings"
  );
  const repairedEvidence =
    parseWithCalibrationHints(overlappingEvidence).evaluation;
  assert.deepEqual(repairedEvidence.improvements[0].transcriptRefs, [
    "candidate:2",
  ]);
  assert.equal(
    repairedEvidence.improvements[0].evidence[0].quote,
    "test a concierge flow first"
  );

  const expectRejection = (
    value: unknown,
    expected: FeedbackV2RejectionCode
  ) => {
    let caught: unknown;
    try {
      parse(value);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof FeedbackProviderInvocationError);
    assert.equal(caught.code, "evaluation_provider_returned_invalid_feedback");
    assert.equal(caught.cause, undefined);
    assert.equal(getAuthenticatedFeedbackRejectionCode(caught), expected);
    return caught;
  };

  expectRejection(
    { ...providerValue, privateProviderText: "never persist this" },
    "response_unknown_field"
  );
  expectRejection(
    { ...providerValue, drills: ["Do ten reps focused on metrics."] },
    "practice_recommendation_normalization_failed"
  );

  for (const { value, secret } of [
    {
      secret: "proxied-provider-content-must-not-leak",
      value: new Proxy(providerValue, {
        ownKeys() {
          throw new Error("proxied-provider-content-must-not-leak");
        },
      }),
    },
    {
      secret: "unrecognized-provider-rejection-must-not-leak",
      value: new Proxy(providerValue, {
        ownKeys() {
          throw new FeedbackV2ParseError(
            "unrecognized-provider-rejection-must-not-leak" as FeedbackV2RejectionCode,
            "unrecognized-provider-rejection-must-not-leak"
          );
        },
      }),
    },
    {
      secret: "proxied-diagnostic-access-must-not-leak",
      value: new Proxy(providerValue, {
        ownKeys() {
          throw new Proxy(
            new FeedbackV2ParseError(
              "response_unknown_field",
              "safe synthetic parser failure"
            ),
            {
              get(target, property, receiver) {
                if (property === "code") {
                  throw new Error("proxied-diagnostic-access-must-not-leak");
                }
                return Reflect.get(target, property, receiver);
              },
            }
          );
        },
      }),
    },
  ]) {
    const error = expectRejection(value, "parser_internal_failure");
    assert.equal(error.message.includes(secret), false);
    assert.equal(JSON.stringify(error).includes(secret), false);
  }

  const forged = new FeedbackProviderInvocationError(
    "evaluation_provider_returned_invalid_feedback",
    usage,
    "gpt-test-1",
    "default"
  );
  assert.equal(getAuthenticatedFeedbackRejectionCode(forged), undefined);
  assert.equal(forged.feedbackRejectionCode, undefined);
  assert.throws(
    () =>
      Object.defineProperty(forged, "feedbackRejectionCode", {
        value: "evidence_quote_not_grounded",
      }),
    TypeError
  );
});
