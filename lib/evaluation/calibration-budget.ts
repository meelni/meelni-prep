import type { EvaluationCalibrationCase } from "@meelni/test-fixtures";

import { EVALUATION_SYSTEM_PROMPT, getEvaluationPrompt } from "./prompts";
import { projectEvaluationTranscriptAliases } from "./transcript-aliases";
import { serializeFeedbackProviderResponseFormat } from "./provider-response-format";

export const CALIBRATION_MAX_PROVIDER_CALLS = 96;
export const CALIBRATION_MAX_SPEND_NANO_USD = 3_000_000_000;
export const CALIBRATION_MAX_COMPLETION_TOKENS = 2_000;
export const CALIBRATION_OFFICIAL_OPENAI_ENDPOINT = "https://api.openai.com/v1";
export const CALIBRATION_SERVICE_TIER = "default";
export const CALIBRATION_MAX_SDK_RETRIES = 0;
export const CALIBRATION_REQUEST_TIMEOUT_MS = 300_000;
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
  requestTimeoutMs: 300_000;
  reviewedAt: "2026-07-24T17:17:35.000Z";
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
  requestTimeoutMs: CALIBRATION_REQUEST_TIMEOUT_MS,
  reviewedAt: "2026-07-24T17:17:35.000Z",
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
  | "provider_usage_exceeded_reservation"
  | "actual_spend_cap_breached"
  | "physical_request_boundary_not_confirmed"
  | "physical_request_reentry"
  | "pricing_review_expired_before_request"
  | "unresolved_reservation";

export interface CalibrationCostReport {
  contractVersion: "evaluation-calibration-cost-report.v5";
  authorizedRunId: string | null;
  authorizationId: string | null;
  authorizationHash: string | null;
  activationCommit: string | null;
  activatedPlanHash: string | null;
  activatedPlanCalls: number | null;
  activatedPlanWorstCaseCostUsd: number | null;
  maximumCalls: 96;
  maximumSpendUsd: 3;
  attemptedCalls: number;
  physicalRequestBoundaryAttempts: number;
  physicalHttpAttemptCeiling: number;
  completedCalls: number;
  reservedWorstCaseCostUsd: number;
  reconciledActualCostUsd: number;
  unreconciledReservedCostUsd: number;
  estimatedCommittedCostUsd: number;
  actualCostComplete: boolean;
  spendCapBreached: boolean;
  observedUsage: CalibrationProviderUsage;
  pricingReviewExpiresAt: string;
  stopReason: CalibrationBudgetStopReason | null;
  pricing: CalibrationPricingContract;
}

export interface CalibrationSpendReservation {
  id: number;
  callKey: string;
  inputTokenCeiling: number;
  outputTokenCeiling: number;
  worstCaseNanoUsd: number;
  settled: boolean;
  usageRecorded: boolean;
  requestBoundaryAttempts: number;
  requestBoundaryConfirmed: boolean;
}

export interface CalibrationPersistedSpendState {
  attemptedCalls: number;
  completedCalls: number;
  cumulativeReservedNanoUsd: number;
  reconciledActualNanoUsd: number;
  unresolvedReservedNanoUsd: number;
  stopReason: CalibrationBudgetStopReason | null;
  observedUsage: CalibrationProviderUsage;
  reservations: CalibrationSpendReservation[];
}

export interface CalibrationSpendPersistence {
  readonly durable: true;
  readonly runId: string;
  readonly authorizationId: string;
  readonly authorizationHash: string;
  readonly activationCommit: string;
  readonly planHash: string;
  readonly plannedCalls: number;
  readonly plannedWorstCaseNanoUsd: number;
  assertRequestAuthority(): void | Promise<void>;
  assertReservationAuthorized(input: {
    callKey: string;
    inputTokenCeiling: number;
    outputTokenCeiling: number;
    worstCaseNanoUsd: number;
  }): void;
  loadSpendState(): CalibrationPersistedSpendState;
  saveSpendState(state: CalibrationPersistedSpendState): void;
}

export function createEmptyCalibrationSpendState(): CalibrationPersistedSpendState {
  return {
    attemptedCalls: 0,
    completedCalls: 0,
    cumulativeReservedNanoUsd: 0,
    reconciledActualNanoUsd: 0,
    unresolvedReservedNanoUsd: 0,
    stopReason: null,
    observedUsage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    reservations: [],
  };
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
  private reservations = new Map<string, CalibrationSpendReservation>();
  private observedUsage: CalibrationProviderUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  readonly pricing = CALIBRATION_PRICING_CONTRACT;
  readonly durable: boolean;
  private readonly clock: () => Date;

  constructor(
    readonly model: string,
    nowOrClock: Date | (() => Date) = () => new Date(),
    private readonly persistence?: CalibrationSpendPersistence
  ) {
    this.clock =
      nowOrClock instanceof Date
        ? () => new Date(nowOrClock.getTime())
        : nowOrClock;
    this.durable = persistence?.durable === true;
    if (model !== this.pricing.model) {
      throw new Error("calibration_model_has_no_reviewed_pricing_contract");
    }
    validateCalibrationPricingFreshness(this.clock(), this.pricing);
    if (persistence) this.hydrate(persistence.loadSpendState());
  }

  reserve(
    fixture: EvaluationCalibrationCase,
    callKey = `local:${this.attemptedCalls + 1}`
  ): CalibrationSpendReservation | null {
    validateCalibrationPricingFreshness(this.clock(), this.pricing);
    if (this.stopReason !== null) return null;
    if (this.reservations.has(callKey)) return null;
    if (this.attemptedCalls >= CALIBRATION_MAX_PROVIDER_CALLS) {
      this.stopReason = "call_cap_reached";
      this.persist();
      return null;
    }

    const inputTokenCeiling = structuredCalibrationInputTokenCeiling(fixture);
    const worstCaseNanoUsd = calculateWorstCaseNanoUsd(
      inputTokenCeiling,
      CALIBRATION_MAX_COMPLETION_TOKENS,
      this.pricing
    );
    this.persistence?.assertReservationAuthorized({
      callKey,
      inputTokenCeiling,
      outputTokenCeiling: CALIBRATION_MAX_COMPLETION_TOKENS,
      worstCaseNanoUsd,
    });
    const currentlyCommitted =
      this.reconciledActualNanoUsd + this.unresolvedReservedNanoUsd;
    if (
      currentlyCommitted + worstCaseNanoUsd >
      CALIBRATION_MAX_SPEND_NANO_USD
    ) {
      this.stopReason = "spend_cap_before_next_call";
      this.persist();
      return null;
    }

    this.attemptedCalls += 1;
    this.cumulativeReservedNanoUsd += worstCaseNanoUsd;
    this.unresolvedReservedNanoUsd += worstCaseNanoUsd;
    const reservation: CalibrationSpendReservation = {
      id: this.attemptedCalls,
      callKey,
      inputTokenCeiling,
      outputTokenCeiling: CALIBRATION_MAX_COMPLETION_TOKENS,
      worstCaseNanoUsd,
      settled: false,
      usageRecorded: false,
      requestBoundaryAttempts: 0,
      requestBoundaryConfirmed: false,
    };
    this.reservations.set(callKey, reservation);
    // The reservation reaches durable storage before the caller may issue HTTP.
    this.persist();
    return reservation;
  }

  settleSuccess(
    reservation: CalibrationSpendReservation,
    usage: CalibrationProviderUsage | undefined
  ): boolean {
    const actual = this.reconcile(reservation, usage);
    if (actual === null) {
      this.persist();
      return false;
    }
    this.completedCalls += 1;
    this.persist();
    return true;
  }

  settleFailure(
    reservation: CalibrationSpendReservation,
    usage: CalibrationProviderUsage | undefined
  ): void {
    if (usage) this.reconcile(reservation, usage);
    this.stopReason ??= usage ? "provider_failure" : "missing_provider_usage";
    this.persist();
  }

  rejectObservedModel(
    reservation: CalibrationSpendReservation,
    usage: CalibrationProviderUsage | undefined
  ): void {
    this.rejectProviderIdentity(reservation, usage, "provider_model_mismatch");
    this.persist();
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
    this.persist();
  }

  async assertPhysicalRequestAllowed(
    reservation: CalibrationSpendReservation
  ): Promise<void> {
    if (this.reservations.get(reservation.callKey) !== reservation) {
      throw new Error("calibration_reservation_is_not_current");
    }
    reservation.requestBoundaryAttempts += 1;
    this.persist();
    if (reservation.requestBoundaryAttempts > 1) {
      this.stopReason = "physical_request_reentry";
      this.persist();
      throw new Error("calibration_physical_request_boundary_already_used");
    }
    try {
      validateCalibrationPricingFreshness(this.clock(), this.pricing);
    } catch (error) {
      this.stopReason = "pricing_review_expired_before_request";
      this.persist();
      throw error;
    }
    if (reservation.settled || this.stopReason !== null) {
      throw new Error("calibration_reservation_is_not_active");
    }
    if (this.persistence) await this.persistence.assertRequestAuthority();
    // The remote authorization check may take time. Re-read pricing after it so
    // the final local decision is adjacent to transport dispatch.
    validateCalibrationPricingFreshness(this.clock(), this.pricing);
    reservation.requestBoundaryConfirmed = true;
    this.persist();
  }

  finishPlan(): void {
    if (this.stopReason === null) {
      this.stopReason =
        this.unresolvedReservedNanoUsd > 0
          ? "unresolved_reservation"
          : "completed_plan";
    }
    this.persist();
  }

  report(): CalibrationCostReport {
    return {
      contractVersion: "evaluation-calibration-cost-report.v5",
      authorizedRunId: this.persistence?.runId ?? null,
      authorizationId: this.persistence?.authorizationId ?? null,
      authorizationHash: this.persistence?.authorizationHash ?? null,
      activationCommit: this.persistence?.activationCommit ?? null,
      activatedPlanHash: this.persistence?.planHash ?? null,
      activatedPlanCalls: this.persistence?.plannedCalls ?? null,
      activatedPlanWorstCaseCostUsd: this.persistence
        ? nanoUsdToUsd(this.persistence.plannedWorstCaseNanoUsd)
        : null,
      maximumCalls: CALIBRATION_MAX_PROVIDER_CALLS,
      maximumSpendUsd: 3,
      attemptedCalls: this.attemptedCalls,
      physicalRequestBoundaryAttempts: [...this.reservations.values()].reduce(
        (total, { requestBoundaryAttempts }) => total + requestBoundaryAttempts,
        0
      ),
      physicalHttpAttemptCeiling:
        [...this.reservations.values()].filter(
          ({ requestBoundaryConfirmed }) => requestBoundaryConfirmed
        ).length *
        (this.pricing.maximumSdkRetries + 1),
      completedCalls: this.completedCalls,
      reservedWorstCaseCostUsd: nanoUsdToUsd(this.cumulativeReservedNanoUsd),
      reconciledActualCostUsd: nanoUsdToUsd(this.reconciledActualNanoUsd),
      unreconciledReservedCostUsd: nanoUsdToUsd(this.unresolvedReservedNanoUsd),
      estimatedCommittedCostUsd: nanoUsdToUsd(
        this.reconciledActualNanoUsd + this.unresolvedReservedNanoUsd
      ),
      actualCostComplete: this.unresolvedReservedNanoUsd === 0,
      spendCapBreached:
        this.reconciledActualNanoUsd > CALIBRATION_MAX_SPEND_NANO_USD,
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
    if (!reservation.requestBoundaryConfirmed) {
      this.stopReason = "physical_request_boundary_not_confirmed";
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
    const actualNanoUsd = calculateActualNanoUsd(usage, this.pricing);
    if (
      usage.inputTokens > reservation.inputTokenCeiling ||
      usage.outputTokens > reservation.outputTokenCeiling ||
      actualNanoUsd > reservation.worstCaseNanoUsd
    ) {
      reservation.settled = true;
      this.unresolvedReservedNanoUsd -= reservation.worstCaseNanoUsd;
      this.reconciledActualNanoUsd += actualNanoUsd;
      this.stopReason =
        this.reconciledActualNanoUsd > CALIBRATION_MAX_SPEND_NANO_USD
          ? "actual_spend_cap_breached"
          : "provider_usage_exceeded_reservation";
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

  private hydrate(state: CalibrationPersistedSpendState): void {
    this.attemptedCalls = state.attemptedCalls;
    this.completedCalls = state.completedCalls;
    this.cumulativeReservedNanoUsd = state.cumulativeReservedNanoUsd;
    this.reconciledActualNanoUsd = state.reconciledActualNanoUsd;
    this.unresolvedReservedNanoUsd = state.unresolvedReservedNanoUsd;
    this.stopReason = state.stopReason;
    this.observedUsage = { ...state.observedUsage };
    this.reservations = new Map(
      state.reservations.map((reservation) => [
        reservation.callKey,
        { ...reservation },
      ])
    );
    const reservationIds = state.reservations
      .map(({ id }) => id)
      .sort((left, right) => left - right);
    const cumulativeReservedNanoUsd = state.reservations.reduce(
      (total, reservation) => total + reservation.worstCaseNanoUsd,
      0
    );
    const unresolvedReservedNanoUsd = state.reservations
      .filter(({ settled }) => !settled)
      .reduce((total, reservation) => total + reservation.worstCaseNanoUsd, 0);
    const settledReservations = state.reservations.filter(
      ({ settled }) => settled
    );
    if (
      this.reservations.size !== state.reservations.length ||
      this.attemptedCalls !== state.reservations.length ||
      reservationIds.some((id, index) => id !== index + 1) ||
      this.completedCalls > this.attemptedCalls ||
      this.completedCalls > settledReservations.length ||
      settledReservations.some(
        ({ requestBoundaryConfirmed, usageRecorded }) =>
          !requestBoundaryConfirmed || !usageRecorded
      ) ||
      state.reservations.some(
        ({ requestBoundaryAttempts, requestBoundaryConfirmed }) =>
          !Number.isSafeInteger(requestBoundaryAttempts) ||
          requestBoundaryAttempts < 0 ||
          requestBoundaryAttempts > 2 ||
          (requestBoundaryConfirmed && requestBoundaryAttempts !== 1)
      ) ||
      this.cumulativeReservedNanoUsd !== cumulativeReservedNanoUsd ||
      this.unresolvedReservedNanoUsd !== unresolvedReservedNanoUsd ||
      this.unresolvedReservedNanoUsd < 0 ||
      this.reconciledActualNanoUsd < 0 ||
      this.cumulativeReservedNanoUsd < 0
    ) {
      throw new Error("calibration_spend_state_is_inconsistent");
    }
    // Even in-process state is terminal once a deliberate stop reason exists.
    if (this.stopReason !== null) {
      throw new Error("calibration_authorized_run_is_already_terminal");
    }
  }

  private persist(): void {
    if (!this.persistence) return;
    this.persistence.saveSpendState({
      attemptedCalls: this.attemptedCalls,
      completedCalls: this.completedCalls,
      cumulativeReservedNanoUsd: this.cumulativeReservedNanoUsd,
      reconciledActualNanoUsd: this.reconciledActualNanoUsd,
      unresolvedReservedNanoUsd: this.unresolvedReservedNanoUsd,
      stopReason: this.stopReason,
      observedUsage: { ...this.observedUsage },
      reservations: [...this.reservations.values()].map((reservation) => ({
        ...reservation,
      })),
    });
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
    projectEvaluationTranscriptAliases(fixture.transcript).transcript,
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

export function structuredCalibrationInputTokenCeiling(
  fixture: EvaluationCalibrationCase
): number {
  const state = fixture.expectedCompletionState;
  if (state !== "full" && state !== "partial") {
    throw new Error("insufficient_fixture_cannot_reserve_provider_spend");
  }
  return (
    calibrationInputTokenCeiling(fixture) +
    Buffer.byteLength(serializeFeedbackProviderResponseFormat(state), "utf8")
  );
}

export function calculateWorstCaseNanoUsd(
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
