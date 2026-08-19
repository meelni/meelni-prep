import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERVIEWER_BENCHMARK_SUITE_VERSION,
  createInterviewerBenchmarkScenarios,
} from "../../test-fixtures/src/interviewer-benchmark";
import { INTERVIEWER_MOVE_TYPES } from "./interviewer-contracts";

type Comparison =
  | "exact_match"
  | "move_match_target_mismatch"
  | "move_mismatch";

function compare(
  recommendation: { move_type: string; topic: string; source_turn_id: string },
  delivered: { move_type: string; topic: string; source_turn_id: string }
): Comparison {
  assert.equal(recommendation.source_turn_id, delivered.source_turn_id);
  if (recommendation.move_type !== delivered.move_type) {
    return "move_mismatch";
  }
  return recommendation.topic === delivered.topic
    ? "exact_match"
    : "move_match_target_mismatch";
}

test("SAV-467 synthetic moves exercise deterministic shadow comparison plumbing", () => {
  assert.equal(
    INTERVIEWER_BENCHMARK_SUITE_VERSION,
    "meelni.interviewer-benchmark-suite.v2"
  );
  const deliveredMoves = createInterviewerBenchmarkScenarios().flatMap(
    (scenario) =>
      scenario.turns.flatMap((turn) =>
        turn.move?.source_turn_id
          ? [
              {
                move_type: turn.move.move_type,
                topic: turn.move.target_topic,
                source_turn_id: turn.move.source_turn_id,
              },
            ]
          : []
      )
  );

  assert.ok(deliveredMoves.length >= 20);
  for (const delivered of deliveredMoves) {
    assert.ok(INTERVIEWER_MOVE_TYPES.includes(delivered.move_type));
    assert.equal(compare(delivered, delivered), "exact_match");
    assert.equal(
      compare(
        { ...delivered, topic: `${delivered.topic}-counterfactual` },
        delivered
      ),
      "move_match_target_mismatch"
    );
    const differentMove = INTERVIEWER_MOVE_TYPES.find(
      (moveType) => moveType !== delivered.move_type
    );
    assert.ok(differentMove);
    assert.equal(
      compare({ ...delivered, move_type: differentMove }, delivered),
      "move_mismatch"
    );
  }
});

test("fixture comparison is attribution-only and defines no quality threshold", () => {
  const source = createInterviewerBenchmarkScenarios()[0];
  const delivered = source.turns.find(
    (turn) => turn.move?.source_turn_id !== null && turn.move !== null
  );
  assert.ok(delivered?.move?.source_turn_id);

  const comparisonRecord = {
    scenario_id: source.scenario_id,
    source_turn_id: delivered.move.source_turn_id,
    delivered_move_id: delivered.turn_id,
    delivered_move_type: delivered.move.move_type,
    delivered_target_topic: delivered.move.target_topic,
    comparison: "exact_match",
  } as const;

  assert.deepEqual(Object.keys(comparisonRecord).sort(), [
    "comparison",
    "delivered_move_id",
    "delivered_move_type",
    "delivered_target_topic",
    "scenario_id",
    "source_turn_id",
  ]);
  assert.equal("quality_score" in comparisonRecord, false);
  assert.equal("readiness" in comparisonRecord, false);
});
