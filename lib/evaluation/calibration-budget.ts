import type { EvaluationCalibrationCase } from "@meelni/test-fixtures";

import { EVALUATION_SYSTEM_PROMPT, getEvaluationPrompt } from "./prompts";

export const CALIBRATION_MAX_PROVIDER_CALLS = 96;
export const CALIBRATION_MAX_SPEND_NANO_USD = 3_000_000_000;
export const CALIBRATION_MAX_COMPLETION_TOKENS = 2_000;
export const CALIBRATION_OFFICIAL_OPENAI_ENDPOINT = "https://api.openai.com/v1";
export const CALIBRATION_SERVICE_TIER = "default";
export const CALIBRATION_MAX_SDK_RETRIES = 0;
export const CALIBRATION_PRICING_REVIEW_TTL_MS = 24 * 60 * 60 * 1_000;

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
  endpoint: "https://api.openai.com/v1";
  serviceTier: "default";
  maximumSdkRetries: 0;
  redirectPolicy: "error";
  reviewedAt: "2026-07-12T06:28:08.000Z";
  reviewTtlHours: 24;
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
  endpoint: CALIBRATION_OFFICIAL_OPENAI_ENDPOINT,
  serviceTier: CALIBRATION_SERVICE_TIER,
  maximumSdkRetries: CALIBRATION_MAX_SDK_RETRIES,
  redirectPolicy: "error",
  reviewedAt: "2026-07-12T06:28:08.000Z",
  reviewTtlHours: 24,
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
  | "provider_service_tier_missing"
  | "provider_service_tier_mismatch"
  | "missing_provider_usage"
  | "invalid_provider_usage"
  | "provider_usage_exceeded_reservation";

export interface CalibrationCostReport {
  contractVersion: "evaluation-calibration-cost-report.v2";
  maximumCalls: 96;
  maximumSpendUsd: 3;
  attemptedCalls: number;
  physicalHttpAttemptCeiling: number;
  completedCalls: number;
  reservedWorstCaseCostUsd: number;
  reconciledActualCostUsd: number;
  unreconciledReservedCostUsd: number;
  estimatedCommittedCostUsd: number;
  actualCostComplete: boolean;
  observedUsage: CalibrationProviderUsage;
  pricingReviewExpiresAt: string;
  stopReason: CalibrationBudgetStopReason | null;
  pricing: CalibrationPricingContract;
}

export interface CalibrationSpendReservation {
  id: number;
  inputTokenCeiling: number;
  outputTokenCeiling: number;
  worstCaseNanoUsd: number;
  settled: boolean;
  usageRecorded: boolean;
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
  private observedUsage: CalibrationProviderUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  readonly pricing = CALIBRATION_PRICING_CONTRACT;

  constructor(
    readonly model: string,
    readonly now: Date = new Date()
  ) {
    if (model !== this.pricing.model) {
      throw new Error("calibration_model_has_no_reviewed_pricing_contract");
    }
    validateCalibrationPricingFreshness(now, this.pricing);
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
      usageRecorded: false,
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

  rejectObservedModel(
    reservation: CalibrationSpendReservation,
    usage: CalibrationProviderUsage | undefined
  ): void {
    this.rejectProviderIdentity(reservation, usage, "provider_model_mismatch");
  }

  rejectObservedServiceTier(
    reservation: CalibrationSpendReservation,
    usage: CalibrationProviderUsage | undefined,
    observedTier: string | null | undefined
  ): void {
    this.rejectProviderIdentity(
      reservation,
      usage,
      observedTier
        ? "provider_service_tier_mismatch"
        : "provider_service_tier_missing"
    );
  }

  finishPlan(): void {
    if (this.stopReason === null) this.stopReason = "completed_plan";
  }

  report(): CalibrationCostReport {
    return {
      contractVersion: "evaluation-calibration-cost-report.v2",
      maximumCalls: CALIBRATION_MAX_PROVIDER_CALLS,
      maximumSpendUsd: 3,
      attemptedCalls: this.attemptedCalls,
      physicalHttpAttemptCeiling:
        this.attemptedCalls * (this.pricing.maximumSdkRetries + 1),
      completedCalls: this.completedCalls,
      reservedWorstCaseCostUsd: nanoUsdToUsd(this.cumulativeReservedNanoUsd),
      reconciledActualCostUsd: nanoUsdToUsd(this.reconciledActualNanoUsd),
      unreconciledReservedCostUsd: nanoUsdToUsd(this.unresolvedReservedNanoUsd),
      estimatedCommittedCostUsd: nanoUsdToUsd(
        this.reconciledActualNanoUsd + this.unresolvedReservedNanoUsd
      ),
      actualCostComplete: this.unresolvedReservedNanoUsd === 0,
      observedUsage: { ...this.observedUsage },
      pricingReviewExpiresAt: pricingReviewExpiresAt(
        this.pricing
      ).toISOString(),
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
    this.recordUsage(reservation, usage);
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

  private rejectProviderIdentity(
    reservation: CalibrationSpendReservation,
    usage: CalibrationProviderUsage | undefined,
    reason: CalibrationBudgetStopReason
  ): void {
    if (reservation.settled) {
      this.stopReason = "invalid_provider_usage";
      return;
    }
    if (!usage) {
      this.stopReason = reason;
      return;
    }
    const actual = this.reconcile(reservation, usage);
    if (actual !== null) this.stopReason = reason;
  }

  private recordUsage(
    reservation: CalibrationSpendReservation,
    usage: CalibrationProviderUsage
  ): void {
    if (reservation.usageRecorded) return;
    reservation.usageRecorded = true;
    this.observedUsage.inputTokens += usage.inputTokens;
    this.observedUsage.cachedInputTokens += usage.cachedInputTokens;
    this.observedUsage.outputTokens += usage.outputTokens;
    this.observedUsage.totalTokens += usage.totalTokens;
  }
}

export function validateCalibrationPricingFreshness(
  now: Date,
  pricing: CalibrationPricingContract = CALIBRATION_PRICING_CONTRACT
): void {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("calibration_pricing_review_clock_invalid");
  }
  const reviewedAt = new Date(pricing.reviewedAt);
  if (!Number.isFinite(reviewedAt.getTime())) {
    throw new Error("calibration_pricing_review_timestamp_invalid");
  }
  if (reviewedAt.getTime() > now.getTime()) {
    throw new Error("calibration_pricing_review_is_future_dated");
  }
  if (now.getTime() > pricingReviewExpiresAt(pricing).getTime()) {
    throw new Error("calibration_pricing_review_is_stale");
  }
}

function pricingReviewExpiresAt(pricing: CalibrationPricingContract): Date {
  return new Date(
    new Date(pricing.reviewedAt).getTime() +
      pricing.reviewTtlHours * 60 * 60 * 1_000
  );
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
