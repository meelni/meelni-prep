import type { EvaluationCalibrationCase } from "@meelni/test-fixtures";

import { EVALUATION_SYSTEM_PROMPT, getEvaluationPrompt } from "./prompts";

export const CALIBRATION_MAX_PROVIDER_CALLS = 96;
export const CALIBRATION_MAX_SPEND_NANO_USD = 3_000_000_000;
export const CALIBRATION_MAX_COMPLETION_TOKENS = 2_000;

const REQUEST_FRAMING_TOKEN_CEILING = 1_024;

export interface CalibrationProviderUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CalibrationPricingContract {
  contractVersion: "evaluation-calibration-pricing.v1";
  provider: "openai";
  model: "gpt-5.1-2025-11-13";
  reviewedAt: "2026-07-11";
  source: "https://developers.openai.com/api/docs/models/gpt-5.1";
  nanoUsdPerMillionTokens: {
    input: 1_250_000_000;
    cachedInput: 125_000_000;
    output: 10_000_000_000;
  };
}

export const CALIBRATION_PRICING_CONTRACT: CalibrationPricingContract = {
  contractVersion: "evaluation-calibration-pricing.v1",
  provider: "openai",
  model: "gpt-5.1-2025-11-13",
  reviewedAt: "2026-07-11",
  source: "https://developers.openai.com/api/docs/models/gpt-5.1",
  nanoUsdPerMillionTokens: {
    input: 1_250_000_000,
    cachedInput: 125_000_000,
    output: 10_000_000_000,
  },
};

export type CalibrationBudgetStopReason =
  | "completed_plan"
  | "call_cap_reached"
  | "spend_cap_before_next_call"
  | "provider_failure"
  | "provider_model_mismatch"
  | "missing_provider_usage"
  | "invalid_provider_usage"
  | "provider_usage_exceeded_reservation";

export interface CalibrationCostReport {
  contractVersion: "evaluation-calibration-cost-report.v1";
  maximumCalls: 96;
  maximumSpendUsd: 3;
  attemptedCalls: number;
  completedCalls: number;
  reservedWorstCaseCostUsd: number;
  reconciledActualCostUsd: number;
  unreconciledReservedCostUsd: number;
  estimatedCommittedCostUsd: number;
  actualCostComplete: boolean;
  stopReason: CalibrationBudgetStopReason | null;
  pricing: CalibrationPricingContract;
}

export interface CalibrationSpendReservation {
  id: number;
  inputTokenCeiling: number;
  outputTokenCeiling: number;
  worstCaseNanoUsd: number;
  settled: boolean;
}

/**
 * Fail-closed paid-run accounting. Monetary arithmetic stays in integer
 * nano-dollars so boundary decisions never depend on floating-point rounding.
 */
export class CalibrationSpendGuard {
  private attemptedCalls = 0;
  private completedCalls = 0;
  private cumulativeReservedNanoUsd = 0;
  private reconciledActualNanoUsd = 0;
  private unresolvedReservedNanoUsd = 0;
  private stopReason: CalibrationBudgetStopReason | null = null;
  readonly pricing = CALIBRATION_PRICING_CONTRACT;

  constructor(readonly model: string) {
    if (model !== this.pricing.model) {
      throw new Error("calibration_model_has_no_reviewed_pricing_contract");
    }
  }

  reserve(
    fixture: EvaluationCalibrationCase
  ): CalibrationSpendReservation | null {
    if (this.stopReason !== null) return null;
    if (this.attemptedCalls >= CALIBRATION_MAX_PROVIDER_CALLS) {
      this.stopReason = "call_cap_reached";
      return null;
    }

    const inputTokenCeiling = calibrationInputTokenCeiling(fixture);
    const worstCaseNanoUsd = calculateWorstCaseNanoUsd(
      inputTokenCeiling,
      CALIBRATION_MAX_COMPLETION_TOKENS,
      this.pricing
    );
    const currentlyCommitted =
      this.reconciledActualNanoUsd + this.unresolvedReservedNanoUsd;
    if (
      currentlyCommitted + worstCaseNanoUsd >
      CALIBRATION_MAX_SPEND_NANO_USD
    ) {
      this.stopReason = "spend_cap_before_next_call";
      return null;
    }

    this.attemptedCalls += 1;
    this.cumulativeReservedNanoUsd += worstCaseNanoUsd;
    this.unresolvedReservedNanoUsd += worstCaseNanoUsd;
    return {
      id: this.attemptedCalls,
      inputTokenCeiling,
      outputTokenCeiling: CALIBRATION_MAX_COMPLETION_TOKENS,
      worstCaseNanoUsd,
      settled: false,
    };
  }

  settleSuccess(
    reservation: CalibrationSpendReservation,
    usage: CalibrationProviderUsage | undefined
  ): boolean {
    const actual = this.reconcile(reservation, usage);
    if (actual === null) return false;
    this.completedCalls += 1;
    return true;
  }

  settleFailure(
    reservation: CalibrationSpendReservation,
    usage: CalibrationProviderUsage | undefined
  ): void {
    if (usage) this.reconcile(reservation, usage);
    this.stopReason ??= usage ? "provider_failure" : "missing_provider_usage";
  }

  rejectObservedModel(reservation: CalibrationSpendReservation): void {
    if (!reservation.settled) {
      this.stopReason = "provider_model_mismatch";
    }
  }

  finishPlan(): void {
    if (this.stopReason === null) this.stopReason = "completed_plan";
  }

  report(): CalibrationCostReport {
    return {
      contractVersion: "evaluation-calibration-cost-report.v1",
      maximumCalls: CALIBRATION_MAX_PROVIDER_CALLS,
      maximumSpendUsd: 3,
      attemptedCalls: this.attemptedCalls,
      completedCalls: this.completedCalls,
      reservedWorstCaseCostUsd: nanoUsdToUsd(this.cumulativeReservedNanoUsd),
      reconciledActualCostUsd: nanoUsdToUsd(this.reconciledActualNanoUsd),
      unreconciledReservedCostUsd: nanoUsdToUsd(this.unresolvedReservedNanoUsd),
      estimatedCommittedCostUsd: nanoUsdToUsd(
        this.reconciledActualNanoUsd + this.unresolvedReservedNanoUsd
      ),
      actualCostComplete: this.unresolvedReservedNanoUsd === 0,
      stopReason: this.stopReason,
      pricing: this.pricing,
    };
  }

  private reconcile(
    reservation: CalibrationSpendReservation,
    usage: CalibrationProviderUsage | undefined
  ): number | null {
    if (reservation.settled) {
      this.stopReason = "invalid_provider_usage";
      return null;
    }
    if (!usage) {
      this.stopReason = "missing_provider_usage";
      return null;
    }
    if (!isValidUsage(usage)) {
      this.stopReason = "invalid_provider_usage";
      return null;
    }
    if (
      usage.inputTokens > reservation.inputTokenCeiling ||
      usage.outputTokens > reservation.outputTokenCeiling
    ) {
      this.stopReason = "provider_usage_exceeded_reservation";
      return null;
    }

    const actualNanoUsd = calculateActualNanoUsd(usage, this.pricing);
    if (actualNanoUsd > reservation.worstCaseNanoUsd) {
      this.stopReason = "provider_usage_exceeded_reservation";
      return null;
    }

    reservation.settled = true;
    this.unresolvedReservedNanoUsd -= reservation.worstCaseNanoUsd;
    this.reconciledActualNanoUsd += actualNanoUsd;
    return actualNanoUsd;
  }
}

export function calibrationInputTokenCeiling(
  fixture: EvaluationCalibrationCase
): number {
  const state = fixture.expectedCompletionState;
  if (state !== "full" && state !== "partial") {
    throw new Error("insufficient_fixture_cannot_reserve_provider_spend");
  }
  const userPrompt = getEvaluationPrompt(
    fixture.roundType,
    fixture.transcript,
    state
  );
  // A tokenizer cannot emit more non-empty tokens than the UTF-8 byte count of
  // message content. The extra ceiling covers Chat Completions message framing
  // and response-format instructions without trusting a mutable tokenizer.
  return (
    Buffer.byteLength(EVALUATION_SYSTEM_PROMPT, "utf8") +
    Buffer.byteLength(userPrompt, "utf8") +
    REQUEST_FRAMING_TOKEN_CEILING
  );
}

function calculateWorstCaseNanoUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: CalibrationPricingContract
): number {
  return (
    tokenCostNanoUsd(inputTokens, pricing.nanoUsdPerMillionTokens.input) +
    tokenCostNanoUsd(outputTokens, pricing.nanoUsdPerMillionTokens.output)
  );
}

function calculateActualNanoUsd(
  usage: CalibrationProviderUsage,
  pricing: CalibrationPricingContract
): number {
  const uncachedInputTokens = usage.inputTokens - usage.cachedInputTokens;
  return (
    tokenCostNanoUsd(
      uncachedInputTokens,
      pricing.nanoUsdPerMillionTokens.input
    ) +
    tokenCostNanoUsd(
      usage.cachedInputTokens,
      pricing.nanoUsdPerMillionTokens.cachedInput
    ) +
    tokenCostNanoUsd(usage.outputTokens, pricing.nanoUsdPerMillionTokens.output)
  );
}

function tokenCostNanoUsd(tokens: number, ratePerMillion: number): number {
  return Math.ceil((tokens * ratePerMillion) / 1_000_000);
}

function nanoUsdToUsd(value: number): number {
  return value / 1_000_000_000;
}

function isValidUsage(usage: CalibrationProviderUsage): boolean {
  return (
    Number.isSafeInteger(usage.inputTokens) &&
    usage.inputTokens >= 0 &&
    Number.isSafeInteger(usage.cachedInputTokens) &&
    usage.cachedInputTokens >= 0 &&
    usage.cachedInputTokens <= usage.inputTokens &&
    Number.isSafeInteger(usage.outputTokens) &&
    usage.outputTokens >= 0 &&
    Number.isSafeInteger(usage.totalTokens) &&
    usage.totalTokens === usage.inputTokens + usage.outputTokens
  );
}
