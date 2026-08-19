import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERVIEWER_BENCHMARK_SCENARIO_VERSION,
  INTERVIEWER_QUALITY_DIMENSIONS,
  INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION,
  INTERVIEWER_QUALITY_RUBRIC_VERSION,
  buildInterviewerQualityJudgePrompt,
  buildInterviewerQualityJudgeRequestV1,
  decodeInterviewerBenchmarkScenarioV1,
  decodeInterviewerQualityJudgeOutputV1,
  evaluateInterviewerInvariants,
  type InterviewerBenchmarkScenarioV1,
  type InterviewerBenchmarkTurnV1,
  type InterviewerInvariantCode,
  type InterviewerQualityScoresV1,
} from "./interviewer-benchmark";

test("interviewer benchmark scenario and judge output fail closed", () => {
  const scenario = createScenario([]);
  assert.deepEqual(
    decodeInterviewerBenchmarkScenarioV1(JSON.parse(JSON.stringify(scenario))),
    scenario
  );
  assert.equal(
    decodeInterviewerBenchmarkScenarioV1({ ...scenario, unexpected: true }),
    null
  );

  const scores = uniformScores(3);
  const output = {
    contract_version: INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION,
    rubric_version: INTERVIEWER_QUALITY_RUBRIC_VERSION,
    scenario_id: scenario.scenario_id,
    seed: 17,
    scores,
    overall_score: 75,
    failures: [],
  };
  assert.deepEqual(decodeInterviewerQualityJudgeOutputV1(output), output);
  assert.equal(
    decodeInterviewerQualityJudgeOutputV1({
      ...output,
      overall_score: 76,
    }),
    null
  );
  assert.equal(
    decodeInterviewerQualityJudgeOutputV1({
      ...output,
      scores: { ...scores, candidate_score: 4 },
    }),
    null
  );
});

test("judge prompt evaluates only the interviewer and keeps candidate scorecards separate", () => {
  const prompt = buildInterviewerQualityJudgePrompt(
    buildInterviewerQualityJudgeRequestV1(createScenario([]), 23)
  );

  assert.match(prompt, /Judge only the PM interviewer's behavior/);
  assert.match(prompt, /Do not score, coach, rank, or diagnose the candidate/);
  assert.match(prompt, /Return JSON only/);
  assert.doesNotMatch(prompt, /candidate scorecard/i);
});

test("deterministic interviewer invariants catch every accepted failure family", () => {
  const controls: Array<{
    expected: InterviewerInvariantCode;
    turns: InterviewerBenchmarkTurnV1[];
  }> = [
    {
      expected: "coaching",
      turns: [
        interviewer(
          "i-2",
          "You should use the RICE framework before choosing.",
          20_000,
          "probe",
          "prioritization"
        ),
      ],
    },
    {
      expected: "mid_session_evaluation",
      turns: [
        interviewer(
          "i-2",
          "That is a strong answer.",
          20_000,
          "probe",
          "evidence"
        ),
      ],
    },
    {
      expected: "multiple_questions",
      turns: [
        interviewer(
          "i-2",
          "What is the primary metric? What guardrail would you use?",
          20_000,
          "probe",
          "metrics"
        ),
      ],
    },
    {
      expected: "repeated_probe",
      turns: [
        interviewer("i-2", "Why this segment?", 20_000, "probe", "segment"),
        candidate("c-2", "Because it has the highest unmet need.", 30_000),
        interviewer("i-3", "Why this segment?", 40_000, "probe", "segment"),
      ],
    },
    {
      expected: "deadline_violation",
      turns: [
        interviewer("i-2", "One more question?", 900_000, "probe", "late"),
      ],
    },
    {
      expected: "post_close_speech",
      turns: [
        interviewer("i-2", "That is all for today.", 20_000, "close", "close"),
        interviewer(
          "i-3",
          "Actually, one more thing.",
          30_000,
          "transition",
          "extra"
        ),
      ],
    },
  ];

  for (const control of controls) {
    const violations = evaluateInterviewerInvariants(
      createScenario(control.turns, [control.expected])
    );
    assert.ok(
      violations.some((violation) => violation.code === control.expected),
      control.expected
    );
  }
});

test("clean interviewer sequence preserves one-question and post-close policy", () => {
  const scenario = createScenario([
    interviewer(
      "i-2",
      "Which user will you prioritize?",
      20_000,
      "probe",
      "user"
    ),
    candidate("c-2", "Working caregivers.", 30_000),
    interviewer(
      "i-3",
      "What trade-off does that choice create?",
      40_000,
      "challenge",
      "tradeoff"
    ),
    candidate("c-3", "We trade reach for urgency.", 50_000),
    interviewer("i-4", "That is all for today.", 60_000, "close", "close"),
  ]);

  assert.deepEqual(evaluateInterviewerInvariants(scenario), []);
});

function createScenario(
  extraTurns: InterviewerBenchmarkTurnV1[],
  expectedInvariantCodes: InterviewerInvariantCode[] = []
): InterviewerBenchmarkScenarioV1 {
  return {
    contract_version: INTERVIEWER_BENCHMARK_SCENARIO_VERSION,
    scenario_id: "synthetic-product-sense-contract",
    fixture_kind: "invariant_control",
    title: "Synthetic product-sense contract fixture",
    provenance: "fully_synthetic",
    authoring_provenance: "agent_authored_not_human_adjudicated",
    round_type: "product_sense",
    candidate_behaviors: ["strong"],
    prompt_contract_version: "full_interview_prompt_v1",
    selected_question: "Design a product for synthetic transit riders.",
    duration_ms: 900_000,
    deadline_ms: 900_000,
    turns: [
      interviewer(
        "i-1",
        "Design a product for synthetic transit riders.",
        0,
        null,
        null
      ),
      candidate("c-1", "I would start with the rider outcome.", 10_000),
      ...extraTurns,
    ],
    expected_invariant_codes: expectedInvariantCodes,
  };
}

function interviewer(
  turnId: string,
  text: string,
  startedAtMs: number,
  moveType: "probe" | "clarify" | "challenge" | "transition" | "close" | null,
  targetTopic: string | null
): InterviewerBenchmarkTurnV1 {
  return {
    turn_id: turnId,
    speaker: "interviewer",
    text,
    started_at_ms: startedAtMs,
    ended_at_ms: startedAtMs + 1_000,
    delivery_state: "delivered",
    move:
      moveType && targetTopic
        ? {
            move_type: moveType,
            target_topic: targetTopic,
            source_turn_id: turnId === "i-1" ? null : "c-1",
          }
        : null,
  };
}

function candidate(
  turnId: string,
  text: string,
  startedAtMs: number
): InterviewerBenchmarkTurnV1 {
  return {
    turn_id: turnId,
    speaker: "candidate",
    text,
    started_at_ms: startedAtMs,
    ended_at_ms: startedAtMs + 1_000,
    delivery_state: "delivered",
    move: null,
  };
}

function uniformScores(score: 0 | 1 | 2 | 3 | 4): InterviewerQualityScoresV1 {
  return Object.fromEntries(
    INTERVIEWER_QUALITY_DIMENSIONS.map((dimension) => [dimension, score])
  ) as InterviewerQualityScoresV1;
}
