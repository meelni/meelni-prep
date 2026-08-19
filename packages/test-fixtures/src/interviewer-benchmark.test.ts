import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERVIEWER_BENCHMARK_CANDIDATE_BEHAVIORS,
  INTERVIEWER_QUALITY_DIMENSIONS,
  decodeInterviewerBenchmarkScenarioV1,
  decodeInterviewerQualityJudgeOutputV1,
  evaluateInterviewerInvariants,
} from "@meelni/agent";

import {
  INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS,
  INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS,
  INTERVIEWER_BENCHMARK_REPLAY_SEEDS,
  createInterviewerBenchmarkJudgeOutputs,
  createInterviewerBenchmarkScenarios,
} from "./interviewer-benchmark";

test("catalog has one full current-runtime session per PM round and every adversarial behavior", () => {
  const scenarios = createInterviewerBenchmarkScenarios();
  const baseline = scenarios.filter(
    (scenario) => scenario.fixture_kind === "current_runtime_baseline"
  );

  assert.equal(baseline.length, 4);
  assert.deepEqual(baseline.map((scenario) => scenario.round_type).sort(), [
    "behavioral",
    "execution",
    "product_sense",
    "strategy",
  ]);
  assert.deepEqual(
    [
      ...new Set(baseline.flatMap((scenario) => scenario.candidate_behaviors)),
    ].sort(),
    [...INTERVIEWER_BENCHMARK_CANDIDATE_BEHAVIORS].sort()
  );
  assert.ok(baseline.every((scenario) => scenario.turns.length >= 10));
  assert.ok(
    scenarios.every((scenario) =>
      decodeInterviewerBenchmarkScenarioV1(JSON.parse(JSON.stringify(scenario)))
    )
  );
});

test("each deterministic negative control produces exactly its declared invariant family", () => {
  const controls = createInterviewerBenchmarkScenarios().filter(
    (scenario) => scenario.fixture_kind === "invariant_control"
  );

  assert.equal(controls.length, 6);
  for (const scenario of controls) {
    assert.deepEqual(
      [
        ...new Set(
          evaluateInterviewerInvariants(scenario).map(({ code }) => code)
        ),
      ].sort(),
      [...scenario.expected_invariant_codes].sort(),
      scenario.scenario_id
    );
  }
});

test("frozen judge outputs are strict, bounded, and reproducible across three seeds", () => {
  const scenarios = createInterviewerBenchmarkScenarios();
  const scenarioIds = new Set(
    scenarios.map((scenario) => scenario.scenario_id)
  );
  const outputs = createInterviewerBenchmarkJudgeOutputs();
  const keys = new Set<string>();

  assert.equal(outputs.length, 16);
  for (const output of outputs) {
    assert.ok(scenarioIds.has(output.scenario_id));
    assert.deepEqual(
      decodeInterviewerQualityJudgeOutputV1(JSON.parse(JSON.stringify(output))),
      output
    );
    const key = `${output.scenario_id}:${output.seed}`;
    assert.equal(keys.has(key), false, key);
    keys.add(key);
  }

  for (const scenario of scenarios.filter(
    (candidate) => candidate.fixture_kind === "current_runtime_baseline"
  )) {
    const runs = outputs.filter(
      (output) => output.scenario_id === scenario.scenario_id
    );
    assert.deepEqual(
      runs.map((output) => output.seed),
      [...INTERVIEWER_BENCHMARK_REPLAY_SEEDS]
    );
    assert.ok(
      Math.max(...runs.map(({ overall_score }) => overall_score)) -
        Math.min(...runs.map(({ overall_score }) => overall_score)) <=
        5
    );
    for (const dimension of INTERVIEWER_QUALITY_DIMENSIONS) {
      const values = runs.map((output) => output.scores[dimension]);
      assert.ok(Math.max(...values) - Math.min(...values) <= 1);
    }
  }
});

test("eight exact calibration candidates preserve their pre-approval manifest identity", () => {
  const outputs = new Map(
    createInterviewerBenchmarkJudgeOutputs().map((output) => [
      `${output.scenario_id}:${output.seed}`,
      output,
    ])
  );

  assert.equal(INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS.length, 4);
  assert.equal(
    INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS.flatMap((pair) => [
      pair.strong,
      pair.weak,
    ]).length,
    8
  );
  assert.deepEqual(
    INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS.flatMap(({ strong, weak }) => [
      {
        scenarioId: strong.scenario_id,
        expectedLabel: strong.expected_quality,
        seed: strong.seed,
      },
      {
        scenarioId: weak.scenario_id,
        expectedLabel: weak.expected_quality,
        seed: weak.seed,
      },
    ]),
    [
      {
        scenarioId: "current-product-sense-strong",
        expectedLabel: "strong",
        seed: 17,
      },
      {
        scenarioId: "calibration-product-sense-weak",
        expectedLabel: "weak",
        seed: 0,
      },
      {
        scenarioId: "calibration-execution-strong",
        expectedLabel: "strong",
        seed: 0,
      },
      {
        scenarioId: "current-execution-shallow-silent",
        expectedLabel: "weak",
        seed: 17,
      },
      {
        scenarioId: "calibration-strategy-strong",
        expectedLabel: "strong",
        seed: 0,
      },
      {
        scenarioId: "current-strategy-rambling-contradictory",
        expectedLabel: "weak",
        seed: 17,
      },
      {
        scenarioId: "calibration-behavioral-strong",
        expectedLabel: "strong",
        seed: 0,
      },
      {
        scenarioId: "current-behavioral-interrupting",
        expectedLabel: "weak",
        seed: 17,
      },
    ]
  );
  for (const pair of INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS) {
    assert.equal(
      pair.strong.adjudication_status,
      INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS
    );
    assert.equal(
      pair.weak.adjudication_status,
      INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS
    );
    const strong = outputs.get(
      `${pair.strong.scenario_id}:${pair.strong.seed}`
    );
    const weak = outputs.get(`${pair.weak.scenario_id}:${pair.weak.seed}`);
    assert.ok(strong && weak, pair.round_type);
    assert.ok(strong.overall_score - weak.overall_score >= 15, pair.round_type);
  }
});
