import assert from "node:assert/strict";
import test from "node:test";

import { evaluationCalibrationCases } from "@meelni/test-fixtures";

import {
  CALIBRATION_MAX_PROVIDER_CALLS,
  CALIBRATION_MAX_SPEND_NANO_USD,
  CALIBRATION_PRICING_CONTRACT,
  CALIBRATION_PRICING_REVIEW_TTL_MS,
  CalibrationSpendGuard,
  calibrationInputTokenCeiling,
  validateCalibrationPricingFreshness,
  type CalibrationProviderUsage,
} from "./calibration-budget";

const MODEL = CALIBRATION_PRICING_CONTRACT.model;
const REVIEWED_AT = new Date(CALIBRATION_PRICING_CONTRACT.reviewedAt);
const NOW = new Date(REVIEWED_AT.getTime() + 60_000);
const SCORED_FIXTURE = evaluationCalibrationCases.find(
  ({ expectedCompletionState }) =>
    expectedCompletionState === "full" || expectedCompletionState === "partial"
)!;

test("the exact $3 reservation boundary is allowed and another call is refused", () => {
  const guard = createGuard();
  const fixture = fixtureWithInputTokenCeiling(2_384_000);

  const reservation = guard.reserve(fixture);
  assert.ok(reservation);
  assert.equal(reservation.worstCaseNanoUsd, CALIBRATION_MAX_SPEND_NANO_USD);
  assert.equal(guard.reserve(SCORED_FIXTURE), null);
  assert.equal(guard.report().stopReason, "spend_cap_before_next_call");
  assert.equal(guard.report().estimatedCommittedCostUsd, 3);
});

test("the 96-call boundary refuses call 97 before invocation", async () => {
  const guard = createGuard();
  for (let index = 0; index < CALIBRATION_MAX_PROVIDER_CALLS; index += 1) {
    const reservation = guard.reserve(SCORED_FIXTURE);
    assert.ok(reservation);
    await guard.assertPhysicalRequestAllowed(reservation);
    assert.equal(
      guard.settleSuccess(reservation, usageWithin(reservation)),
      true
    );
  }
  assert.equal(guard.reserve(SCORED_FIXTURE), null);
  assert.equal(guard.report().attemptedCalls, 96);
  assert.equal(guard.report().physicalRequestBoundaryAttempts, 96);
  assert.equal(guard.report().physicalHttpAttemptCeiling, 96);
  assert.equal(guard.report().completedCalls, 96);
  assert.equal(guard.report().stopReason, "call_cap_reached");
});

test("unknown or moving model identity fails before reservation", () => {
  assert.throws(
    () => new CalibrationSpendGuard("gpt-5.1", NOW),
    /no_reviewed_pricing_contract/
  );
  assert.throws(
    () => new CalibrationSpendGuard("unknown-provider-model", NOW),
    /no_reviewed_pricing_contract/
  );
});

test("an over-budget next call is stopped without increasing attempted calls", () => {
  const guard = createGuard();
  assert.equal(guard.reserve(fixtureWithInputTokenCeiling(2_384_001)), null);
  assert.equal(guard.report().attemptedCalls, 0);
  assert.equal(guard.report().stopReason, "spend_cap_before_next_call");
});

test("provider failure reconciles known usage and forbids another call", async () => {
  const guard = createGuard();
  const reservation = guard.reserve(SCORED_FIXTURE)!;
  await guard.assertPhysicalRequestAllowed(reservation);
  guard.settleFailure(reservation, usageWithin(reservation));

  assert.equal(guard.reserve(SCORED_FIXTURE), null);
  assert.equal(guard.report().attemptedCalls, 1);
  assert.equal(guard.report().completedCalls, 0);
  assert.equal(guard.report().stopReason, "provider_failure");
  assert.equal(guard.report().actualCostComplete, true);
});

test("missing usage retains the reservation and forbids another call", async () => {
  const guard = createGuard();
  const reservation = guard.reserve(SCORED_FIXTURE)!;
  await guard.assertPhysicalRequestAllowed(reservation);

  assert.equal(guard.settleSuccess(reservation, undefined), false);
  assert.equal(guard.reserve(SCORED_FIXTURE), null);
  assert.equal(guard.report().stopReason, "missing_provider_usage");
  assert.equal(guard.report().actualCostComplete, false);
  assert.equal(
    guard.report().unreconciledReservedCostUsd,
    reservation.worstCaseNanoUsd / 1_000_000_000
  );
});

test("usage outside the reservation fails closed and forbids another call", async () => {
  const guard = createGuard();
  const reservation = guard.reserve(SCORED_FIXTURE)!;
  await guard.assertPhysicalRequestAllowed(reservation);
  const usage = usageWithin(reservation);
  usage.outputTokens = reservation.outputTokenCeiling + 1;
  usage.totalTokens = usage.inputTokens + usage.outputTokens;

  assert.equal(guard.settleSuccess(reservation, usage), false);
  assert.equal(guard.reserve(SCORED_FIXTURE), null);
  assert.equal(
    guard.report().stopReason,
    "provider_usage_exceeded_reservation"
  );
});

test("pricing review must be current and never future-dated before call one", () => {
  assert.equal(
    CALIBRATION_PRICING_REVIEW_TTL_MS,
    CALIBRATION_PRICING_CONTRACT.reviewTtlHours * 60 * 60 * 1_000
  );
  assert.doesNotThrow(() => validateCalibrationPricingFreshness(NOW));
  assert.doesNotThrow(() =>
    validateCalibrationPricingFreshness(
      new Date(REVIEWED_AT.getTime() + CALIBRATION_PRICING_REVIEW_TTL_MS)
    )
  );
  assert.throws(
    () =>
      validateCalibrationPricingFreshness(new Date(REVIEWED_AT.getTime() - 1)),
    /future_dated/
  );
  assert.throws(
    () =>
      new CalibrationSpendGuard(
        MODEL,
        new Date(REVIEWED_AT.getTime() + CALIBRATION_PRICING_REVIEW_TTL_MS + 1)
      ),
    /review_is_stale/
  );
});

test("pricing expiry during request preparation stops before physical HTTP", async () => {
  const expiresAt = REVIEWED_AT.getTime() + CALIBRATION_PRICING_REVIEW_TTL_MS;
  const reads = [expiresAt - 2, expiresAt - 1, expiresAt + 1];
  const guard = new CalibrationSpendGuard(
    MODEL,
    () => new Date(reads.shift() ?? expiresAt + 1)
  );
  const reservation = guard.reserve(SCORED_FIXTURE)!;

  await assert.rejects(
    async () => await guard.assertPhysicalRequestAllowed(reservation),
    /review_is_stale/
  );
  assert.equal(guard.report().attemptedCalls, 1);
  assert.equal(guard.report().physicalRequestBoundaryAttempts, 1);
  assert.equal(guard.report().physicalHttpAttemptCeiling, 0);
  assert.equal(
    guard.report().stopReason,
    "pricing_review_expired_before_request"
  );
  assert.equal(guard.report().actualCostComplete, false);
});

test("a physical request reservation is atomically single-use", async () => {
  const guard = createGuard();
  const reservation = guard.reserve(SCORED_FIXTURE)!;
  await guard.assertPhysicalRequestAllowed(reservation);

  await assert.rejects(
    async () => await guard.assertPhysicalRequestAllowed(reservation),
    /boundary_already_used/
  );
  const report = guard.report();
  assert.equal(report.contractVersion, "evaluation-calibration-cost-report.v5");
  assert.equal(report.physicalRequestBoundaryAttempts, 2);
  assert.equal(report.physicalHttpAttemptCeiling, 1);
  assert.equal(report.stopReason, "physical_request_reentry");
  assert.equal(guard.reserve(SCORED_FIXTURE), null);
});

test("freshness is re-read before every subsequent reservation", async () => {
  const expiresAt = REVIEWED_AT.getTime() + CALIBRATION_PRICING_REVIEW_TTL_MS;
  let now = expiresAt - 1;
  const guard = new CalibrationSpendGuard(MODEL, () => new Date(now));
  const first = guard.reserve(SCORED_FIXTURE)!;
  await guard.assertPhysicalRequestAllowed(first);
  assert.equal(guard.settleSuccess(first, usageWithin(first)), true);

  now = expiresAt + 1;
  assert.throws(() => guard.reserve(SCORED_FIXTURE), /review_is_stale/);
  assert.equal(guard.report().attemptedCalls, 1);
  assert.equal(guard.report().physicalHttpAttemptCeiling, 1);
});

test("identity mismatch preserves exact usage and reconciled cost", async () => {
  const guard = createGuard();
  const reservation = guard.reserve(SCORED_FIXTURE)!;
  await guard.assertPhysicalRequestAllowed(reservation);
  const usage = usageWithin(reservation);
  guard.rejectObservedModel(reservation, usage);

  const report = guard.report();
  assert.equal(report.stopReason, "provider_model_mismatch");
  assert.equal(report.actualCostComplete, true);
  assert.equal(report.unreconciledReservedCostUsd, 0);
  assert.equal(report.reconciledActualCostUsd, 0.000625);
  assert.deepEqual(report.observedUsage, usage);
});

test("valid over-ceiling usage records the exact actual $3 breach", async () => {
  const guard = createGuard();
  const fixture = fixtureWithInputTokenCeiling(2_384_000);
  const reservation = guard.reserve(fixture)!;
  await guard.assertPhysicalRequestAllowed(reservation);
  const usage = {
    inputTokens: 2_384_000,
    cachedInputTokens: 0,
    outputTokens: 2_001,
    totalTokens: 2_386_001,
  };

  assert.equal(guard.settleSuccess(reservation, usage), false);
  const report = guard.report();
  assert.equal(report.stopReason, "actual_spend_cap_breached");
  assert.equal(report.reconciledActualCostUsd, 3.00001);
  assert.equal(report.unreconciledReservedCostUsd, 0);
  assert.equal(report.estimatedCommittedCostUsd, 3.00001);
  assert.equal(report.spendCapBreached, true);
  assert.deepEqual(report.observedUsage, usage);
  assert.equal(guard.reserve(SCORED_FIXTURE), null);
});

test("an exact $3 actual settles but cannot authorize another request", async () => {
  const guard = createGuard();
  const fixture = fixtureWithInputTokenCeiling(2_384_000);
  const reservation = guard.reserve(fixture)!;
  await guard.assertPhysicalRequestAllowed(reservation);
  assert.equal(
    guard.settleSuccess(reservation, {
      inputTokens: 2_384_000,
      cachedInputTokens: 0,
      outputTokens: 2_000,
      totalTokens: 2_386_000,
    }),
    true
  );
  assert.equal(guard.report().reconciledActualCostUsd, 3);
  assert.equal(guard.report().spendCapBreached, false);
  assert.equal(guard.reserve(SCORED_FIXTURE), null);
  assert.equal(guard.report().stopReason, "spend_cap_before_next_call");
});

function usageWithin(reservation: {
  inputTokenCeiling: number;
  outputTokenCeiling: number;
}): CalibrationProviderUsage {
  const inputTokens = Math.min(100, reservation.inputTokenCeiling);
  const outputTokens = Math.min(50, reservation.outputTokenCeiling);
  return {
    inputTokens,
    cachedInputTokens: 0,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function fixtureWithInputTokenCeiling(target: number) {
  const fixture = structuredClone(SCORED_FIXTURE);
  const userTurn = fixture.transcript.find(
    ({ speaker }) => speaker === "user"
  )!;
  const current = calibrationInputTokenCeiling(fixture);
  assert.ok(target >= current);
  userTurn.text += "x".repeat(target - current);
  assert.equal(calibrationInputTokenCeiling(fixture), target);
  return fixture;
}

function createGuard(): CalibrationSpendGuard {
  return new CalibrationSpendGuard(MODEL, NOW);
}
