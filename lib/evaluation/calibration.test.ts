import assert from "node:assert/strict";
import test from "node:test";
import type { FeedbackV2Result, FeedbackV2Scores } from "@meelni/core";

import {
  createDeterministicCalibrationEvaluator,
  runEvaluationCalibration,
} from "./calibration";

const SELF_TEST_MODEL = "deterministic-calibration-self-test.v1";
const NOW = new Date("2026-07-10T16:00:00.000Z");

test("calibration preflight validates 40 synthetic cases without claiming readiness", async () => {
  const report = await runEvaluationCalibration({
    executionKind: "preflight",
    modelVersion: null,
    now: NOW,
  });

  assert.equal(report.corpus.totalCases, 40);
  assert.equal(report.corpus.scoredCases, 32);
  assert.equal(report.corpus.insufficientCases, 8);
  assert.deepEqual(report.corpus.casesByRound, {
    product_sense: 10,
    execution: 10,
    strategy: 10,
    behavioral: 10,
  });
  assert.deepEqual(report.corpus.scoredCasesByQuality, {
    weak: 8,
    average: 8,
    strong: 16,
  });
  assert.equal(report.corpus.expectedStateMismatches, 0);
  assert.equal(report.corpus.invalidEvidenceAnchors, 0);
  assert.equal(report.metrics.insufficientHandlingRate, 1);
  assert.equal(report.metrics.providerEvaluationCalls, 0);
  assert.equal(report.metrics.evaluatorCalls, 0);
  assert.equal(report.execution.paidProviderCalled, false);
  assert.equal(report.gate.liveProviderAcceptance, "pending");
  assert.equal(report.gate.launchAcceptance, "pending_live_provider_run");
});

test("deterministic self-test proves the harness but keeps live acceptance pending", async () => {
  const report = await runEvaluationCalibration({
    executionKind: "deterministic_self_test",
    evaluator: createDeterministicCalibrationEvaluator(SELF_TEST_MODEL),
    modelVersion: SELF_TEST_MODEL,
    repetitions: 3,
    now: NOW,
  });

  assert.equal(report.metrics.evidenceValidityRate, 1);
  assert.equal(report.metrics.adjudicatedEvidenceMatchRate, 1);
  assert.equal(report.metrics.insufficientHandlingRate, 1);
  assert.equal(report.metrics.scoreBandAgreementRate, 1);
  assert.deepEqual(report.metrics.scoreBandAgreementByDimension, {
    structure: 1,
    clarity: 1,
    insight: 1,
    communication: 1,
    leadership: 1,
  });
  assert.equal(report.metrics.modelVersionMatchRate, 1);
  assert.equal(report.metrics.maximumRepeatedRunScoreRange, 0);
  assert.equal(report.metrics.evaluatorCalls, 96);
  assert.equal(report.metrics.providerEvaluationCalls, 0);
  assert.equal(report.execution.paidProviderCalled, false);
  assert.deepEqual(report.execution.observedModelVersions, [SELF_TEST_MODEL]);
  assert.equal(report.gate.deterministicHarness, "passed");
  assert.equal(report.gate.liveProviderAcceptance, "pending");
  assert.equal(report.gate.launchAcceptance, "pending_live_provider_run");
  assert.equal(report.failures.length, 0);
});

test("calibration fails a live report when repeated scores are unstable", async () => {
  const baseline = createDeterministicCalibrationEvaluator(
    "unstable-fixture-model"
  );
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: "unstable-fixture-model",
    repetitions: 3,
    now: NOW,
    evaluator: async (input) => {
      const output = await baseline(input);
      return input.runIndex === 2
        ? {
            ...output,
            scores: { ...output.scores, structure: 0 },
            overallScore: 0,
          }
        : output;
    },
  });

  assert.ok(
    report.metrics.maximumRepeatedRunScoreRange === null ||
      report.metrics.maximumRepeatedRunScoreRange > 1
  );
  assert.equal(report.gate.liveProviderAcceptance, "failed");
  assert.equal(report.gate.launchAcceptance, "failed");
  assert.ok(
    report.failures.some(
      (failure) =>
        failure.code === "unstable_dimension_score" &&
        failure.dimension === "structure" &&
        failure.runIndex === 2 &&
        failure.observedScoreRange !== undefined
    )
  );
});

test("a constant-high scorer fails the varied corpus instead of gaming a pooled band", async () => {
  const baseline = createDeterministicCalibrationEvaluator("constant-eight");
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: "constant-eight",
    repetitions: 3,
    now: NOW,
    evaluator: async (input) =>
      withScores(await baseline(input), {
        structure: 8,
        clarity: 8,
        insight: 8,
        communication: 8,
        leadership: 8,
      }),
  });

  assert.ok(report.metrics.scoreBandAgreementRate! < 0.8);
  assert.ok(
    Object.values(report.metrics.scoreBandAgreementByRound).every(
      (value) => value !== null && value < 0.75
    )
  );
  assert.equal(report.gate.liveProviderAcceptance, "failed");
  assert.ok(
    report.failures.some(
      (failure) =>
        failure.code === "score_outside_adjudicated_band" &&
        failure.dimension !== undefined &&
        failure.actualScore === 8 &&
        failure.runIndex !== undefined
    )
  );
});

test("a completely broken leadership scorer cannot pass at the pooled 80 percent boundary", async () => {
  const baseline = createDeterministicCalibrationEvaluator("broken-leadership");
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: "broken-leadership",
    repetitions: 3,
    now: NOW,
    evaluator: async (input) => {
      const output = await baseline(input);
      return withScores(output, { ...output.scores, leadership: 0 });
    },
  });

  assert.equal(report.metrics.scoreBandAgreementRate, 0.8);
  assert.equal(report.metrics.scoreBandAgreementByDimension.leadership, 0);
  assert.equal(report.gate.liveProviderAcceptance, "failed");
});

test("model provenance mismatch fails every otherwise valid output", async () => {
  const baseline = createDeterministicCalibrationEvaluator(
    "provider-observed-snapshot"
  );
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: "configured-model-alias",
    repetitions: 3,
    now: NOW,
    evaluator: baseline,
  });

  assert.equal(report.metrics.modelVersionMatchRate, 0);
  assert.deepEqual(report.execution.observedModelVersions, [
    "provider-observed-snapshot",
  ]);
  assert.equal(report.gate.liveProviderAcceptance, "failed");
  assert.ok(
    report.failures.every(
      (failure) =>
        failure.code !== "model_version_mismatch" ||
        (failure.expectedModelVersion === "configured-model-alias" &&
          failure.observedModelVersion === "provider-observed-snapshot")
    )
  );
  assert.equal(
    report.failures.filter(
      (failure) => failure.code === "model_version_mismatch"
    ).length,
    96
  );
});

test("run budget rejects a repetition typo before the evaluator can be called", async () => {
  let evaluatorCalls = 0;
  await assert.rejects(
    runEvaluationCalibration({
      executionKind: "live_provider",
      modelVersion: "budget-test",
      repetitions: 4,
      now: NOW,
      evaluator: async () => {
        evaluatorCalls += 1;
        throw new Error("should not run");
      },
    }),
    /must be exactly 3/
  );
  assert.equal(evaluatorCalls, 0);
});

function withScores(output: FeedbackV2Result, scores: FeedbackV2Scores) {
  return { ...output, scores, overallScore: 0 };
}
