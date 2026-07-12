import assert from "node:assert/strict";
import test from "node:test";
import type { FeedbackV2Result, FeedbackV2Scores } from "@meelni/core";
import {
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  evaluationCalibrationCases,
} from "@meelni/test-fixtures";

import {
  createDeterministicCalibrationEvaluator,
  runEvaluationCalibration,
  type CalibrationEvaluator,
} from "./calibration";
import { getEvaluationAdjudicationHashes } from "./calibration-approval";
import {
  CALIBRATION_PRICING_CONTRACT,
  CALIBRATION_PRICING_REVIEW_TTL_MS,
  CalibrationSpendGuard,
} from "./calibration-budget";

const SELF_TEST_MODEL = "deterministic-calibration-self-test.v1";
const LIVE_MODEL = CALIBRATION_PRICING_CONTRACT.model;
const NOW = new Date("2026-07-12T07:00:00.000Z");

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
  assert.equal(
    report.gate.adjudicationAcceptance,
    "pending_product_owner_pm_signoff"
  );
  assert.equal(report.gate.launchAcceptance, "pending_adjudication_signoff");
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
  assert.equal(report.gate.launchAcceptance, "pending_adjudication_signoff");
  assert.equal(report.failures.length, 0);
});

test("calibration fails a live report when repeated scores are unstable", async () => {
  const baseline = createDeterministicCalibrationEvaluator(LIVE_MODEL);
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    evaluator: withProviderUsage(async (input) => {
      const output = await baseline(input);
      return input.runIndex === 2
        ? {
            ...output,
            scores: { ...output.scores, structure: 0 },
            overallScore: 0,
          }
        : output;
    }),
    spendGuard: liveGuard(),
    adjudicationApproval: approvalFixture(),
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
  const baseline = createDeterministicCalibrationEvaluator(LIVE_MODEL);
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    evaluator: withProviderUsage(async (input) =>
      withScores(await baseline(input), {
        structure: 8,
        clarity: 8,
        insight: 8,
        communication: 8,
        leadership: 8,
      })
    ),
    spendGuard: liveGuard(),
    adjudicationApproval: approvalFixture(),
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
  const baseline = createDeterministicCalibrationEvaluator(LIVE_MODEL);
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    evaluator: withProviderUsage(async (input) => {
      const output = await baseline(input);
      return withScores(output, { ...output.scores, leadership: 0 });
    }),
    spendGuard: liveGuard(),
    adjudicationApproval: approvalFixture(),
  });

  assert.equal(report.metrics.scoreBandAgreementRate, 0.8);
  assert.equal(report.metrics.scoreBandAgreementByDimension.leadership, 0);
  assert.equal(report.gate.liveProviderAcceptance, "failed");
});

test("model provenance mismatch stops after the first otherwise valid output", async () => {
  const baseline = createDeterministicCalibrationEvaluator(
    "provider-observed-snapshot"
  );
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    evaluator: withProviderUsage(baseline),
    spendGuard: liveGuard(),
    adjudicationApproval: approvalFixture(),
  });

  assert.equal(report.metrics.modelVersionMatchRate, 0);
  assert.deepEqual(report.execution.observedModelVersions, [
    "provider-observed-snapshot",
  ]);
  assert.equal(report.gate.liveProviderAcceptance, "failed");
  assert.equal(report.execution.cost?.attemptedCalls, 1);
  assert.equal(report.execution.cost?.completedCalls, 0);
  assert.equal(report.execution.cost?.stopReason, "provider_model_mismatch");
  assert.equal(report.execution.cost?.actualCostComplete, true);
  assert.equal(report.execution.cost?.reconciledActualCostUsd, 0.001125);
  assert.deepEqual(report.execution.cost?.observedUsage, {
    inputTokens: 100,
    cachedInputTokens: 0,
    outputTokens: 100,
    totalTokens: 200,
  });
});

test("a failed response from an unexpected model preserves identity and known cost", async () => {
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    adjudicationApproval: approvalFixture(),
    spendGuard: liveGuard(),
    evaluator: async () => {
      throw Object.assign(new Error("provider response rejected"), {
        observedModel: "unpriced-provider-snapshot",
        observedServiceTier: "default",
        usage: {
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 100,
          totalTokens: 200,
        },
      });
    },
  });

  assert.equal(report.execution.cost?.attemptedCalls, 1);
  assert.equal(report.execution.cost?.completedCalls, 0);
  assert.equal(report.execution.cost?.stopReason, "provider_model_mismatch");
  assert.deepEqual(report.execution.observedModelVersions, [
    "unpriced-provider-snapshot",
  ]);
  assert.deepEqual(report.execution.observedServiceTiers, ["default"]);
  assert.equal(report.execution.cost?.actualCostComplete, true);
  assert.equal(report.execution.cost?.reconciledActualCostUsd, 0.001125);
});

test("missing or mismatched service tier stops after one reconciled call", async () => {
  for (const [observedServiceTier, expectedReason] of [
    [null, "provider_service_tier_missing"],
    ["priority", "provider_service_tier_mismatch"],
  ] as const) {
    const baseline = createDeterministicCalibrationEvaluator(LIVE_MODEL);
    const report = await runEvaluationCalibration({
      executionKind: "live_provider",
      modelVersion: LIVE_MODEL,
      repetitions: 3,
      now: NOW,
      adjudicationApproval: approvalFixture(),
      spendGuard: liveGuard(),
      evaluator: async (input) => ({
        evaluation: await baseline(input),
        observedServiceTier,
        usage: {
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 100,
          totalTokens: 200,
        },
      }),
    });

    assert.equal(report.execution.cost?.attemptedCalls, 1);
    assert.equal(report.execution.cost?.completedCalls, 0);
    assert.equal(report.execution.cost?.stopReason, expectedReason);
    assert.equal(report.execution.cost?.actualCostComplete, true);
    assert.equal(report.execution.cost?.reconciledActualCostUsd, 0.001125);
    assert.deepEqual(report.execution.observedServiceTiers, [
      observedServiceTier,
    ]);
  }
});

test("provider-error tier identity and known usage survive sanitization", async () => {
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    adjudicationApproval: approvalFixture(),
    spendGuard: liveGuard(),
    evaluator: async () => {
      throw Object.assign(new Error("sanitized_provider_failure"), {
        observedModel: LIVE_MODEL,
        observedServiceTier: "priority",
        usage: {
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 100,
          totalTokens: 200,
        },
      });
    },
  });

  assert.deepEqual(report.execution.observedModelVersions, [LIVE_MODEL]);
  assert.deepEqual(report.execution.observedServiceTiers, ["priority"]);
  assert.equal(
    report.execution.cost?.stopReason,
    "provider_service_tier_mismatch"
  );
  assert.equal(report.execution.cost?.reconciledActualCostUsd, 0.001125);
  assert.equal(report.execution.cost?.unreconciledReservedCostUsd, 0);
  assert.equal(
    JSON.stringify(report).includes("sanitized_provider_failure"),
    false
  );
});

test("run budget rejects a repetition typo before the evaluator can be called", async () => {
  let evaluatorCalls = 0;
  await assert.rejects(
    runEvaluationCalibration({
      executionKind: "live_provider",
      modelVersion: LIVE_MODEL,
      repetitions: 4,
      now: NOW,
      evaluator: async () => {
        evaluatorCalls += 1;
        throw new Error("should not run");
      },
      spendGuard: liveGuard(),
      adjudicationApproval: approvalFixture(),
    }),
    /must be exactly 3/
  );
  assert.equal(evaluatorCalls, 0);
});

test("a stale pricing review blocks the run even with a previously created guard", async () => {
  let evaluatorCalls = 0;
  const staleNow = new Date(
    new Date(CALIBRATION_PRICING_CONTRACT.reviewedAt).getTime() +
      CALIBRATION_PRICING_REVIEW_TTL_MS +
      1
  );
  await assert.rejects(
    runEvaluationCalibration({
      executionKind: "live_provider",
      modelVersion: LIVE_MODEL,
      repetitions: 3,
      now: staleNow,
      evaluator: async () => {
        evaluatorCalls += 1;
        throw new Error("must not run");
      },
      spendGuard: liveGuard(),
      adjudicationApproval: approvalFixture(),
    }),
    /review_is_stale/
  );
  assert.equal(evaluatorCalls, 0);
});

test("approved adjudication without a live run remains pending live calibration", async () => {
  const report = await runEvaluationCalibration({
    executionKind: "deterministic_self_test",
    evaluator: createDeterministicCalibrationEvaluator(SELF_TEST_MODEL),
    modelVersion: SELF_TEST_MODEL,
    repetitions: 3,
    now: NOW,
    adjudicationApproval: approvalFixture(),
  });
  assert.equal(report.gate.adjudicationAcceptance, "passed");
  assert.equal(report.gate.liveProviderAcceptance, "pending");
  assert.equal(report.gate.launchAcceptance, "pending_live_provider_run");
});

test("a pending adjudication decision blocks paid evaluation before call one", async () => {
  let evaluatorCalls = 0;
  await assert.rejects(
    runEvaluationCalibration({
      executionKind: "live_provider",
      evaluator: async () => {
        evaluatorCalls += 1;
        throw new Error("must not run");
      },
      modelVersion: LIVE_MODEL,
      repetitions: 3,
      now: NOW,
      adjudicationApproval: approvalFixture(
        "product_sense:01:caregiver-planning"
      ),
    }),
    /requires_approved_adjudication/
  );
  assert.equal(evaluatorCalls, 0);
});

test("approved adjudication and live-pass satisfy the combined gate", async () => {
  const model = LIVE_MODEL;
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    evaluator: withProviderUsage(
      createDeterministicCalibrationEvaluator(model)
    ),
    modelVersion: model,
    repetitions: 3,
    now: NOW,
    adjudicationApproval: approvalFixture(),
    spendGuard: liveGuard(),
  });
  assert.equal(report.gate.adjudicationAcceptance, "passed");
  assert.equal(report.gate.liveProviderAcceptance, "passed");
  assert.equal(report.gate.launchAcceptance, "passed");
  assert.equal(report.execution.cost?.attemptedCalls, 96);
  assert.equal(report.execution.cost?.physicalHttpAttemptCeiling, 96);
  assert.equal(report.execution.cost?.completedCalls, 96);
  assert.equal(report.execution.cost?.stopReason, "completed_plan");
  assert.ok(report.execution.cost!.estimatedCommittedCostUsd < 3);
  const serialized = JSON.stringify(report);
  const syntheticTranscriptText =
    evaluationCalibrationCases[0].transcript[0].text;
  assert.equal(serialized.includes(syntheticTranscriptText), false);
  assert.equal(serialized.includes("OPENAI_API_KEY"), false);
});

function withScores(output: FeedbackV2Result, scores: FeedbackV2Scores) {
  return { ...output, scores, overallScore: 0 };
}

function withProviderUsage(
  evaluator: CalibrationEvaluator
): CalibrationEvaluator {
  return async (input) => ({
    evaluation: (await evaluator(input)) as FeedbackV2Result,
    usage: {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 100,
      totalTokens: 200,
    },
    observedServiceTier: "default",
  });
}

function liveGuard(): CalibrationSpendGuard {
  return new CalibrationSpendGuard(LIVE_MODEL, NOW);
}

function approvalFixture(changesRequiredCaseId?: string) {
  return {
    contractVersion: "evaluation-adjudication-approval.v1",
    ...getEvaluationAdjudicationHashes(),
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    reviewer: { identity: "test-reviewer", role: "pm_reviewer" },
    reviewedAt: NOW.toISOString(),
    decisions: evaluationCalibrationCases
      .filter(({ expectedQuality }) => expectedQuality !== null)
      .map(({ id }) => ({
        caseId: id,
        decision:
          id === changesRequiredCaseId ? "changes_required" : "approved",
      })),
  };
}
