import assert from "node:assert/strict";
import test from "node:test";

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
  assert.equal(report.metrics.maximumRepeatedRunScoreRange, 0);
  assert.equal(report.metrics.evaluatorCalls, 96);
  assert.equal(report.metrics.providerEvaluationCalls, 0);
  assert.equal(report.execution.paidProviderCalled, false);
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
});
