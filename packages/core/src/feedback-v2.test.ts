import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  FEEDBACK_V2_REJECTION_CODES,
  FEEDBACK_V2_REJECTION_TAXONOMY_VERSION,
  FeedbackV2ParseError,
  isFeedbackV2RejectionCode,
  projectFeedbackItems,
  parseFeedbackV2,
  type FeedbackTranscriptTurn,
  type FeedbackV2RejectionCode,
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

function assertRejection(
  run: () => unknown,
  expectedCode: FeedbackV2RejectionCode
): void {
  assert.throws(run, (error) => {
    assert.ok(error instanceof FeedbackV2ParseError);
    assert.equal(error.code, expectedCode);
    assert.equal(isFeedbackV2RejectionCode(error.code), true);
    return true;
  });
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

test("normalizes harmless quote typography to exact canonical transcript text", () => {
  const response = validResponse();
  const typographicTranscript = [
    {
      eventId: "writer-a:1",
      speaker: "user" as const,
      text: "I would start with working parents — and measure weekly completed plans.",
    },
    transcript[1],
  ];
  response.strengths[0].evidence[0].quote =
    "working parents - and  measure weekly completed plans";
  const parsed = parseFeedbackV2(response, {
    transcript: typographicTranscript,
    evaluationState: "full",
    modelVersion: "gpt-test-1",
  });
  assert.equal(
    parsed.strengths[0].evidence[0].quote,
    "working parents — and measure weekly completed plans"
  );
});

test("rejects interviewer speech and repeated evidence across findings", () => {
  const interviewerTranscript = [
    ...transcript,
    {
      eventId: "writer-a:3",
      speaker: "interviewer" as const,
      text: "You should define a decision threshold.",
    },
  ];
  const interviewerEvidence = validResponse();
  interviewerEvidence.improvements[0].transcriptRefs = ["writer-a:3"];
  interviewerEvidence.improvements[0].evidence = [
    { turnRef: "writer-a:3", quote: "define a decision threshold" },
  ];
  assert.throws(
    () =>
      parseFeedbackV2(interviewerEvidence, {
        transcript: interviewerTranscript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /must reference user speech/
  );

  const repeatedEvidence = validResponse();
  repeatedEvidence.improvements[0].transcriptRefs = ["writer-a:1"];
  repeatedEvidence.improvements[0].evidence = [
    {
      turnRef: "writer-a:1",
      quote: "working parents and measure weekly completed plans",
    },
  ];
  assert.throws(
    () =>
      parseFeedbackV2(repeatedEvidence, {
        transcript,
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    /repeated across findings/
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

test("exposes a closed versioned rejection taxonomy", () => {
  assert.equal(
    FEEDBACK_V2_REJECTION_TAXONOMY_VERSION,
    "feedback-v2-rejection.v1"
  );
  assert.equal(new Set(FEEDBACK_V2_REJECTION_CODES).size, 36);
  assert.equal(isFeedbackV2RejectionCode("evidence_quote_not_grounded"), true);
  assert.equal(isFeedbackV2RejectionCode("provider-supplied-value"), false);
  assert.equal(isFeedbackV2RejectionCode(null), false);
});

test("classifies mutated provider feedback by rejected invariant", () => {
  type Response = ReturnType<typeof validResponse>;
  type Mutation = {
    expected: FeedbackV2RejectionCode;
    mutate: (response: Response) => unknown;
    transcript?: FeedbackTranscriptTurn[];
  };
  const asRecord = (value: unknown) => value as Record<string, unknown>;
  const mutations: Mutation[] = [
    {
      expected: "response_not_object",
      mutate: () => [],
    },
    {
      expected: "response_unknown_field",
      mutate: (response) => Object.assign(response, { leaked: "content" }),
    },
    {
      expected: "schema_version_mismatch",
      mutate: (response) =>
        Object.assign(response, { schemaVersion: "feedback.v1" }),
    },
    {
      expected: "prompt_version_mismatch",
      mutate: (response) =>
        Object.assign(response, { promptVersion: "feedback.prompt.v1" }),
    },
    {
      expected: "rubric_version_mismatch",
      mutate: (response) =>
        Object.assign(response, { rubricVersion: "unknown-rubric" }),
    },
    {
      expected: "evaluation_state_mismatch",
      mutate: (response) =>
        Object.assign(response, { evaluationState: "partial" }),
    },
    {
      expected: "scores_not_object",
      mutate: (response) => Object.assign(response, { scores: [] }),
    },
    {
      expected: "scores_unknown_field",
      mutate: (response) => {
        Object.assign(response.scores, { leaked: 10 });
        return response;
      },
    },
    {
      expected: "score_invalid",
      mutate: (response) => {
        response.scores.structure = 10.5;
        return response;
      },
    },
    {
      expected: "findings_count_invalid",
      mutate: (response) => Object.assign(response, { strengths: [] }),
    },
    {
      expected: "finding_not_object",
      mutate: (response) => {
        asRecord(response).strengths = ["finding"];
        return response;
      },
    },
    {
      expected: "finding_unknown_field",
      mutate: (response) => {
        Object.assign(response.strengths[0], { leaked: "content" });
        return response;
      },
    },
    {
      expected: "finding_dimension_invalid",
      mutate: (response) => {
        Object.assign(response.strengths[0], { dimension: "persuasion" });
        return response;
      },
    },
    {
      expected: "finding_rubric_version_mismatch",
      mutate: (response) => {
        Object.assign(response.strengths[0], {
          rubricVersion: "unknown-rubric",
        });
        return response;
      },
    },
    {
      expected: "finding_text_invalid",
      mutate: (response) => {
        Object.assign(response.strengths[0], { observation: "" });
        return response;
      },
    },
    {
      expected: "transcript_refs_invalid",
      mutate: (response) => {
        Object.assign(response.strengths[0], { transcriptRefs: [] });
        return response;
      },
    },
    {
      expected: "transcript_refs_duplicate",
      mutate: (response) => {
        response.strengths[0].transcriptRefs = ["writer-a:1", "writer-a:1"];
        return response;
      },
    },
    {
      expected: "evidence_count_invalid",
      mutate: (response) => {
        Object.assign(response.strengths[0], { evidence: [] });
        return response;
      },
    },
    {
      expected: "evidence_not_object",
      mutate: (response) => {
        asRecord(response.strengths[0]).evidence = ["evidence"];
        return response;
      },
    },
    {
      expected: "evidence_unknown_field",
      mutate: (response) => {
        Object.assign(response.strengths[0].evidence[0], {
          leaked: "content",
        });
        return response;
      },
    },
    {
      expected: "evidence_turn_ref_invalid",
      mutate: (response) => {
        Object.assign(response.strengths[0].evidence[0], { turnRef: "" });
        return response;
      },
    },
    {
      expected: "evidence_turn_ref_duplicate",
      mutate: (response) => {
        response.strengths[0].transcriptRefs = ["writer-a:1"];
        response.strengths[0].evidence.push({
          turnRef: "writer-a:1",
          quote: "weekly completed plans",
        });
        return response;
      },
    },
    {
      expected: "evidence_turn_ref_not_found",
      mutate: (response) => {
        response.strengths[0].transcriptRefs = ["missing"];
        response.strengths[0].evidence[0].turnRef = "missing";
        return response;
      },
    },
    {
      expected: "evidence_turn_ref_wrong_speaker",
      transcript: [
        ...transcript,
        {
          eventId: "writer-a:3",
          speaker: "interviewer" as const,
          text: "Please define a decision threshold.",
        },
      ],
      mutate: (response) => {
        response.strengths[0].transcriptRefs = ["writer-a:3"];
        response.strengths[0].evidence = [
          { turnRef: "writer-a:3", quote: "decision threshold" },
        ];
        return response;
      },
    },
    {
      expected: "evidence_quote_invalid",
      mutate: (response) => {
        Object.assign(response.strengths[0].evidence[0], { quote: "" });
        return response;
      },
    },
    {
      expected: "evidence_quote_not_grounded",
      mutate: (response) => {
        Object.assign(response.strengths[0].evidence[0], {
          quote: "provider invented this evidence",
        });
        return response;
      },
    },
    {
      expected: "evidence_reference_set_mismatch",
      mutate: (response) => {
        response.strengths[0].transcriptRefs.push("writer-a:2");
        return response;
      },
    },
    {
      expected: "evidence_reused_across_findings",
      mutate: (response) => {
        response.improvements[0].transcriptRefs = ["writer-a:1"];
        response.improvements[0].evidence = [
          {
            turnRef: "writer-a:1",
            quote: "working parents and measure weekly completed plans",
          },
        ];
        return response;
      },
    },
    {
      expected: "confidence_invalid",
      mutate: (response) => {
        Object.assign(response.strengths[0], { confidence: Number.NaN });
        return response;
      },
    },
    {
      expected: "drills_invalid",
      mutate: (response) => Object.assign(response, { drills: [] }),
    },
    {
      expected: "summary_invalid",
      mutate: (response) => Object.assign(response, { summary: "" }),
    },
  ];

  for (const { expected, mutate, transcript: mutatedTranscript } of mutations) {
    const response = validResponse();
    const value = mutate(response);
    assertRejection(
      () =>
        parseFeedbackV2(value, {
          transcript: mutatedTranscript ?? transcript,
          evaluationState: "full",
          modelVersion: "gpt-test-1",
        }),
      expected
    );
  }
});

test("classifies non-provider parser inputs without exposing mutable values", () => {
  assertRejection(
    () =>
      parseFeedbackV2(validResponse(), {
        transcript,
        evaluationState: "full",
        modelVersion: " ",
      }),
    "model_version_invalid"
  );
  assertRejection(
    () =>
      parseFeedbackV2(validResponse(), {
        transcript: [],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    "canonical_transcript_empty"
  );
  assertRejection(
    () =>
      parseFeedbackV2(validResponse(), {
        transcript: [{ ...transcript[0], text: "" }, transcript[1]],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    "canonical_transcript_turn_invalid"
  );
  assertRejection(
    () =>
      parseFeedbackV2(validResponse(), {
        transcript: [
          transcript[0],
          { ...transcript[1], eventId: "writer-a:1" },
        ],
        evaluationState: "full",
        modelVersion: "gpt-test-1",
      }),
    "canonical_transcript_duplicate_event_id"
  );
});
