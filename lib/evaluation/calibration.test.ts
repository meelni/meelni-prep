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
  createEmptyCalibrationSpendState,
  type CalibrationPersistedSpendState,
  type CalibrationSpendPersistence,
} from "./calibration-budget";
import {
  SAV_248_APPROVED_RUN_ID,
  SAV_248_SPEND_AUTHORIZATION,
  buildCalibrationActivatedPlan,
} from "./calibration-run-ledger";
import {
  FeedbackProviderInvocationError,
  parseFeedbackProviderCompletion,
} from "./scorer";

const SELF_TEST_MODEL = "deterministic-calibration-self-test.v1";
const LIVE_MODEL = CALIBRATION_PRICING_CONTRACT.model;
const NOW = new Date(
  new Date(CALIBRATION_PRICING_CONTRACT.reviewedAt).getTime() + 60 * 60 * 1_000
);
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

test("adjudicated evidence accepts a larger exact quote span that preserves the complete anchor", async () => {
  const baseline = createDeterministicCalibrationEvaluator(SELF_TEST_MODEL);
  const target = evaluationCalibrationCases.find(
    ({ id }) => id === "product_sense:01:caregiver-planning"
  )!;
  const targetTurn = target.transcript.find(
    ({ eventId }) => eventId === target.evidenceAnchors[0].turnRef
  )!;
  const report = await runEvaluationCalibration({
    executionKind: "deterministic_self_test",
    modelVersion: SELF_TEST_MODEL,
    repetitions: 3,
    now: NOW,
    evaluator: async (input) => {
      const output = await baseline(input);
      if (input.fixture.id !== target.id || input.runIndex !== 0) return output;
      return {
        ...output,
        strengths: output.strengths.map((item, index) =>
          index === 0
            ? {
                ...item,
                evidence: [{ ...item.evidence[0], quote: targetTurn.text }],
              }
            : item
        ),
      };
    },
  });

  assert.equal(report.metrics.evidenceValidityRate, 1);
  assert.equal(report.metrics.adjudicatedEvidenceMatchRate, 1);
  assert.equal(
    report.failures.some(
      ({ code }) => code === "adjudicated_evidence_not_matched"
    ),
    false
  );
});

test("adjudicated evidence still rejects a grounded quote that omits the canonical anchor", async () => {
  const baseline = createDeterministicCalibrationEvaluator(SELF_TEST_MODEL);
  const target = evaluationCalibrationCases.find(
    ({ id }) => id === "product_sense:01:caregiver-planning"
  )!;
  const alternativeQuote = "After that I would brainstorm features";
  const report = await runEvaluationCalibration({
    executionKind: "deterministic_self_test",
    modelVersion: SELF_TEST_MODEL,
    repetitions: 3,
    now: NOW,
    evaluator: async (input) => {
      const output = await baseline(input);
      if (input.fixture.id !== target.id || input.runIndex !== 0) return output;
      return {
        ...output,
        strengths: output.strengths.map((item, index) =>
          index === 0
            ? {
                ...item,
                evidence: [{ ...item.evidence[0], quote: alternativeQuote }],
              }
            : item
        ),
      };
    },
  });

  assert.equal(report.metrics.evidenceValidityRate, 1);
  assert.ok(report.metrics.adjudicatedEvidenceMatchRate! < 1);
  assert.ok(
    report.failures.some(
      ({ caseId, runIndex, code }) =>
        caseId === target.id &&
        runIndex === 0 &&
        code === "adjudicated_evidence_not_matched"
    )
  );
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
    evaluator: async (input) => {
      await input.beforePhysicalRequest?.();
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

test("live reports preserve only allowlisted provider failure categories", async () => {
  for (const failureCode of [
    "evaluation_provider_refused",
    "evaluation_provider_incomplete",
    "evaluation_provider_content_filtered",
    "evaluation_provider_unexpected_finish",
    "evaluation_provider_returned_no_content",
    "evaluation_provider_returned_invalid_json",
    "evaluation_provider_returned_invalid_feedback",
  ] as const) {
    const report = await runEvaluationCalibration({
      executionKind: "live_provider",
      modelVersion: LIVE_MODEL,
      repetitions: 3,
      now: NOW,
      adjudicationApproval: approvalFixture(),
      spendGuard: liveGuard(),
      evaluator: async (input) => {
        await input.beforePhysicalRequest?.();
        throw new FeedbackProviderInvocationError(
          failureCode,
          {
            inputTokens: 100,
            cachedInputTokens: 0,
            outputTokens: 100,
            totalTokens: 200,
          },
          LIVE_MODEL,
          "default"
        );
      },
    });

    assert.equal(report.failures[0]?.code, failureCode);
    assert.equal(
      report.failures[0]?.feedbackRejectionCode,
      failureCode === "evaluation_provider_returned_invalid_feedback"
        ? "parser_internal_failure"
        : undefined
    );
    assert.equal(report.execution.cost?.attemptedCalls, 1);
    assert.equal(report.execution.cost?.completedCalls, 0);
    assert.equal(report.execution.cost?.stopReason, "provider_failure");
    assert.equal(report.execution.cost?.actualCostComplete, true);
    assert.equal(report.execution.cost?.reconciledActualCostUsd, 0.001125);
    assert.equal(report.execution.cost?.unreconciledReservedCostUsd, 0);
  }

  for (const failureCode of [
    "evaluation_provider_usage_missing",
    "evaluation_provider_invocation_failed",
  ] as const) {
    const report = await runEvaluationCalibration({
      executionKind: "live_provider",
      modelVersion: LIVE_MODEL,
      repetitions: 3,
      now: NOW,
      adjudicationApproval: approvalFixture(),
      spendGuard: liveGuard(),
      evaluator: async (input) => {
        await input.beforePhysicalRequest?.();
        throw new FeedbackProviderInvocationError(failureCode);
      },
    });

    assert.equal(report.failures[0]?.code, failureCode);
    assert.equal(report.execution.cost?.attemptedCalls, 1);
    assert.equal(report.execution.cost?.completedCalls, 0);
    assert.equal(report.execution.cost?.stopReason, "missing_provider_usage");
    assert.equal(report.execution.cost?.actualCostComplete, false);
    assert.equal(report.execution.cost?.reconciledActualCostUsd, 0);
    assert.ok(report.execution.cost!.unreconciledReservedCostUsd > 0);
  }

  const secret = "provider-body-must-not-appear";
  const report = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    adjudicationApproval: approvalFixture(),
    spendGuard: liveGuard(),
    evaluator: async (input) => {
      await input.beforePhysicalRequest?.();
      throw Object.assign(new Error(secret), {
        observedModel: LIVE_MODEL,
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

  assert.equal(report.failures[0]?.code, "evaluation_failed");
  assert.equal(JSON.stringify(report).includes(secret), false);

  const classifiedInvalidFeedback = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    adjudicationApproval: approvalFixture(),
    spendGuard: liveGuard(),
    evaluator: async (input) => {
      await input.beforePhysicalRequest?.();
      return parseFeedbackProviderCompletion(
        {
          model: LIVE_MODEL,
          service_tier: "default",
          usage: {
            prompt_tokens: 100,
            prompt_tokens_details: { cached_tokens: 0 },
            completion_tokens: 100,
            total_tokens: 200,
          },
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  schemaVersion: "feedback.v2",
                  unexpectedProviderField: secret,
                }),
              },
            },
          ],
        },
        input.fixture.transcript,
        input.evaluationState
      );
    },
  });

  assert.deepEqual(classifiedInvalidFeedback.failures[0], {
    caseId: "product_sense:01:caregiver-planning",
    runIndex: 0,
    code: "evaluation_provider_returned_invalid_feedback",
    feedbackRejectionCode: "response_unknown_field",
  });
  assert.equal(
    classifiedInvalidFeedback.execution.cost?.reconciledActualCostUsd,
    0.001125
  );
  assert.equal(
    classifiedInvalidFeedback.execution.cost?.unreconciledReservedCostUsd,
    0
  );

  const forgedRejection = new FeedbackProviderInvocationError(
    "evaluation_provider_returned_invalid_feedback",
    {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 100,
      totalTokens: 200,
    },
    LIVE_MODEL,
    "default"
  );
  assert.throws(
    () =>
      Object.defineProperty(forgedRejection, "feedbackRejectionCode", {
        value: "evidence_quote_not_grounded",
      }),
    TypeError
  );
  const forgedRejectionReport = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    adjudicationApproval: approvalFixture(),
    spendGuard: liveGuard(),
    evaluator: async (input) => {
      await input.beforePhysicalRequest?.();
      throw forgedRejection;
    },
  });
  assert.equal(
    forgedRejectionReport.failures[0]?.feedbackRejectionCode,
    "parser_internal_failure"
  );
  assert.equal(JSON.stringify(forgedRejectionReport).includes(secret), false);

  const proxiedRejection = new Proxy(forgedRejection, {
    get: (target, property, receiver) =>
      property === "feedbackRejectionCode"
        ? "evidence_quote_not_grounded"
        : Reflect.get(target, property, receiver),
  });
  assert.equal(
    proxiedRejection instanceof FeedbackProviderInvocationError,
    true
  );
  assert.equal(
    proxiedRejection.feedbackRejectionCode,
    "evidence_quote_not_grounded"
  );
  const proxiedRejectionReport = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    adjudicationApproval: approvalFixture(),
    spendGuard: liveGuard(),
    evaluator: async (input) => {
      await input.beforePhysicalRequest?.();
      throw proxiedRejection;
    },
  });
  assert.equal(
    proxiedRejectionReport.failures[0]?.feedbackRejectionCode,
    "parser_internal_failure"
  );

  const forged = new FeedbackProviderInvocationError(
    "evaluation_provider_returned_invalid_feedback",
    {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 100,
      totalTokens: 200,
    },
    LIVE_MODEL,
    "default"
  );
  Object.defineProperty(forged, "code", {
    configurable: true,
    value: secret,
  });
  const forgedReport = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    adjudicationApproval: approvalFixture(),
    spendGuard: liveGuard(),
    evaluator: async (input) => {
      await input.beforePhysicalRequest?.();
      throw forged;
    },
  });

  assert.equal(forgedReport.failures[0]?.code, "evaluation_failed");
  assert.equal(JSON.stringify(forgedReport).includes(secret), false);

  let codeReads = 0;
  Object.defineProperty(forged, "code", {
    configurable: true,
    get: () => {
      codeReads += 1;
      return codeReads === 1
        ? "evaluation_provider_returned_invalid_feedback"
        : secret;
    },
  });
  const changingCodeReport = await runEvaluationCalibration({
    executionKind: "live_provider",
    modelVersion: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
    adjudicationApproval: approvalFixture(),
    spendGuard: liveGuard(),
    evaluator: async (input) => {
      await input.beforePhysicalRequest?.();
      throw forged;
    },
  });

  assert.equal(codeReads, 1);
  assert.equal(
    changingCodeReport.failures[0]?.code,
    "evaluation_provider_returned_invalid_feedback"
  );
  assert.equal(JSON.stringify(changingCodeReport).includes(secret), false);
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
      evaluator: async (input) => {
        await input.beforePhysicalRequest?.();
        return {
          evaluation: await baseline(input),
          observedServiceTier,
          usage: {
            inputTokens: 100,
            cachedInputTokens: 0,
            outputTokens: 100,
            totalTokens: 200,
          },
        };
      },
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
    evaluator: async (input) => {
      await input.beforePhysicalRequest?.();
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
  assert.equal(report.execution.cost?.authorizedRunId, SAV_248_APPROVED_RUN_ID);
  assert.equal(report.execution.cost?.authorizationHash?.length, 64);
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
  return async (input) => {
    await input.beforePhysicalRequest?.();
    return {
      evaluation: (await evaluator(input)) as FeedbackV2Result,
      usage: {
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
        totalTokens: 200,
      },
      observedServiceTier: "default",
    };
  };
}

function liveGuard(): CalibrationSpendGuard {
  const plan = buildCalibrationActivatedPlan({
    authorization: SAV_248_SPEND_AUTHORIZATION,
    adjudicationApproval: approvalFixture(),
    model: LIVE_MODEL,
    repetitions: 3,
    now: NOW,
  });
  let spend = createEmptyCalibrationSpendState();
  const persistence: CalibrationSpendPersistence = {
    durable: true,
    runId: SAV_248_APPROVED_RUN_ID,
    authorizationId: SAV_248_SPEND_AUTHORIZATION.authorizationId,
    authorizationHash: plan.authorizationHash,
    activationCommit: "test-activation-commit",
    planHash: plan.planHash,
    plannedCalls: plan.plannedCalls,
    plannedWorstCaseNanoUsd: plan.plannedWorstCaseNanoUsd,
    assertRequestAuthority() {},
    assertReservationAuthorized(input) {
      assert.deepEqual(
        plan.calls.find(({ callKey }) => callKey === input.callKey),
        input
      );
    },
    loadSpendState() {
      return structuredClone(spend);
    },
    saveSpendState(next: CalibrationPersistedSpendState) {
      spend = structuredClone(next);
    },
  };
  return new CalibrationSpendGuard(
    LIVE_MODEL,
    () => new Date(NOW.getTime()),
    persistence
  );
}

function approvalFixture(changesRequiredCaseId?: string) {
  return {
    contractVersion: "evaluation-adjudication-approval.v2",
    ...getEvaluationAdjudicationHashes(),
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    reviewer: { identity: "test-reviewer", role: "pm_reviewer" },
    reviewBasis: {
      candidateManifestVersion: "evaluation-adjudication-review.v2",
      independentExactHashReview: true,
    },
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
