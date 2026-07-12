import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

import {
  createEmptyCalibrationSpendState,
  type CalibrationBudgetStopReason,
  type CalibrationPersistedSpendState,
  type CalibrationProviderUsage,
  type CalibrationSpendPersistence,
  type CalibrationSpendReservation,
} from "./calibration-budget";

export const SAV_198_APPROVED_RUN_ID = "sav-198-authorized-paid-calibration.v1";
export const SAV_198_AUTHORIZATION_ID =
  "sav-198-user-authorization-2026-07-12.v1";
export const CALIBRATION_LEDGER_LEASE_TTL_MS = 20 * 60 * 1_000;

export interface CalibrationSpendAuthorization {
  contractVersion: "evaluation-calibration-spend-authorization.v1";
  authorizationId: typeof SAV_198_AUTHORIZATION_ID;
  runId: typeof SAV_198_APPROVED_RUN_ID;
  authorizedOn: "2026-07-12";
  authorizationSource: "explicit_product_owner_chat_approval";
  singleAggregateRun: true;
  maximumProviderCalls: 96;
  maximumPhysicalHttpAttempts: 96;
  maximumSpendUsd: 3;
  fixturePolicy: "synthetic_or_separately_approved_only";
  customerTranscriptsAllowed: false;
  productionDataAllowed: false;
}

export const SAV_198_SPEND_AUTHORIZATION: CalibrationSpendAuthorization = {
  contractVersion: "evaluation-calibration-spend-authorization.v1",
  authorizationId: SAV_198_AUTHORIZATION_ID,
  runId: SAV_198_APPROVED_RUN_ID,
  authorizedOn: "2026-07-12",
  authorizationSource: "explicit_product_owner_chat_approval",
  singleAggregateRun: true,
  maximumProviderCalls: 96,
  maximumPhysicalHttpAttempts: 96,
  maximumSpendUsd: 3,
  fixturePolicy: "synthetic_or_separately_approved_only",
  customerTranscriptsAllowed: false,
  productionDataAllowed: false,
};

interface CalibrationRunCheckpoint {
  contractVersion: "evaluation-calibration-run-checkpoint.v1";
  runId: typeof SAV_198_APPROVED_RUN_ID;
  authorizationId: typeof SAV_198_AUTHORIZATION_ID;
  authorizationHash: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  spend: CalibrationPersistedSpendState;
}

interface CalibrationRunLease {
  contractVersion: "evaluation-calibration-run-lease.v1";
  runId: typeof SAV_198_APPROVED_RUN_ID;
  ownerId: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface OpenCalibrationRunLedgerOptions {
  authorization: unknown;
  clock?: () => Date;
  ownerId?: string;
  /** Tests use an isolated directory. The production CLI never exposes it. */
  stateDirectory?: string;
}

export class DurableCalibrationRunLedger
  implements CalibrationSpendPersistence
{
  readonly durable = true as const;
  readonly runId = SAV_198_APPROVED_RUN_ID;
  readonly authorizationId = SAV_198_AUTHORIZATION_ID;
  readonly authorization: CalibrationSpendAuthorization;
  readonly authorizationHash: string;
  readonly checkpointPath: string;
  readonly leasePath: string;

  private checkpoint!: CalibrationRunCheckpoint;
  private released = false;

  private constructor(
    authorization: CalibrationSpendAuthorization,
    private readonly ownerId: string,
    private readonly clock: () => Date,
    stateDirectory: string
  ) {
    this.authorization = authorization;
    this.authorizationHash = hashAuthorization(authorization);
    this.checkpointPath = join(
      stateDirectory,
      `${SAV_198_APPROVED_RUN_ID}.checkpoint.json`
    );
    this.leasePath = join(
      stateDirectory,
      `${SAV_198_APPROVED_RUN_ID}.lease.json`
    );
    mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
    this.acquireLease();
    try {
      this.checkpoint = this.loadOrCreateCheckpoint();
    } catch (error) {
      this.release();
      throw error;
    }
  }

  static open(
    options: OpenCalibrationRunLedgerOptions
  ): DurableCalibrationRunLedger {
    const authorization = parseCalibrationSpendAuthorization(
      options.authorization
    );
    return new DurableCalibrationRunLedger(
      authorization,
      options.ownerId ?? randomUUID(),
      options.clock ?? (() => new Date()),
      options.stateDirectory ?? approvedCalibrationStateDirectory()
    );
  }

  assertExclusiveLease(): void {
    if (this.released) throw new Error("calibration_run_lease_released");
    const lease = this.readLease();
    const now = this.clock();
    assertValidDate(now, "calibration_run_lease_clock_invalid");
    if (
      lease.ownerId !== this.ownerId ||
      lease.runId !== this.runId ||
      new Date(lease.expiresAt).getTime() <= now.getTime()
    ) {
      throw new Error("calibration_run_exclusive_lease_lost");
    }
    this.writeLease({
      ...lease,
      heartbeatAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + CALIBRATION_LEDGER_LEASE_TTL_MS
      ).toISOString(),
    });
  }

  loadSpendState(): CalibrationPersistedSpendState {
    this.assertExclusiveLease();
    return cloneSpendState(this.checkpoint.spend);
  }

  saveSpendState(state: CalibrationPersistedSpendState): void {
    this.assertExclusiveLease();
    const now = this.clock();
    assertValidDate(now, "calibration_checkpoint_clock_invalid");
    const next: CalibrationRunCheckpoint = {
      ...this.checkpoint,
      revision: this.checkpoint.revision + 1,
      updatedAt: now.toISOString(),
      spend: cloneSpendState(state),
    };
    validateCheckpoint(next, this.authorizationHash);
    writeJsonAtomic(this.checkpointPath, next);
    this.checkpoint = next;
  }

  release(): void {
    if (this.released) return;
    try {
      const lease = this.readLease();
      if (lease.ownerId === this.ownerId) rmSync(this.leasePath);
    } catch {
      // A lost or corrupt lock is already fail-closed for further writes.
    }
    this.released = true;
  }

  private acquireLease(): void {
    const now = this.clock();
    assertValidDate(now, "calibration_run_lease_clock_invalid");
    const lease: CalibrationRunLease = {
      contractVersion: "evaluation-calibration-run-lease.v1",
      runId: this.runId,
      ownerId: this.ownerId,
      acquiredAt: now.toISOString(),
      heartbeatAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + CALIBRATION_LEDGER_LEASE_TTL_MS
      ).toISOString(),
    };

    try {
      createExclusiveJson(this.leasePath, lease);
      return;
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }

    const stat = statSync(this.leasePath);
    const existing = readLeaseBestEffort(this.leasePath);
    const leaseExpired =
      existing === null ||
      new Date(existing.expiresAt).getTime() <= now.getTime();
    const fileStale =
      stat.mtimeMs + CALIBRATION_LEDGER_LEASE_TTL_MS <= now.getTime();
    if (!leaseExpired || !fileStale) {
      throw new Error("calibration_run_already_has_active_process");
    }

    const stalePath = `${this.leasePath}.stale.${this.ownerId}`;
    try {
      renameSync(this.leasePath, stalePath);
      createExclusiveJson(this.leasePath, lease);
    } catch (error) {
      throw new Error("calibration_run_stale_lease_recovery_lost_race", {
        cause: error,
      });
    } finally {
      if (existsSync(stalePath)) rmSync(stalePath);
    }
  }

  private readLease(): CalibrationRunLease {
    const lease = readLeaseBestEffort(this.leasePath);
    if (!lease) throw new Error("calibration_run_lease_invalid");
    return lease;
  }

  private writeLease(lease: CalibrationRunLease): void {
    validateLease(lease);
    writeJsonAtomic(this.leasePath, lease);
  }

  private loadOrCreateCheckpoint(): CalibrationRunCheckpoint {
    if (existsSync(this.checkpointPath)) {
      const raw = JSON.parse(readFileSync(this.checkpointPath, "utf8"));
      return validateCheckpoint(raw, this.authorizationHash);
    }
    const now = this.clock();
    assertValidDate(now, "calibration_checkpoint_clock_invalid");
    const checkpoint: CalibrationRunCheckpoint = {
      contractVersion: "evaluation-calibration-run-checkpoint.v1",
      runId: this.runId,
      authorizationId: this.authorization.authorizationId,
      authorizationHash: this.authorizationHash,
      revision: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      spend: createEmptyCalibrationSpendState(),
    };
    writeJsonAtomic(this.checkpointPath, checkpoint);
    return checkpoint;
  }
}

export function parseCalibrationSpendAuthorization(
  value: unknown
): CalibrationSpendAuthorization {
  if (!isRecord(value)) {
    throw new Error("calibration_spend_authorization_invalid");
  }
  assertExactKeys(value, Object.keys(SAV_198_SPEND_AUTHORIZATION));
  for (const [key, expected] of Object.entries(SAV_198_SPEND_AUTHORIZATION)) {
    if (value[key] !== expected) {
      throw new Error(`calibration_spend_authorization_${key}_mismatch`);
    }
  }
  return { ...SAV_198_SPEND_AUTHORIZATION };
}

function approvedCalibrationStateDirectory(): string {
  return join(homedir(), ".local", "state", "meelni", "evaluation-calibration");
}

function hashAuthorization(value: CalibrationSpendAuthorization): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateCheckpoint(
  value: unknown,
  expectedAuthorizationHash: string
): CalibrationRunCheckpoint {
  if (!isRecord(value)) throw new Error("calibration_checkpoint_invalid");
  assertExactKeys(value, [
    "contractVersion",
    "runId",
    "authorizationId",
    "authorizationHash",
    "revision",
    "createdAt",
    "updatedAt",
    "spend",
  ]);
  if (
    value.contractVersion !== "evaluation-calibration-run-checkpoint.v1" ||
    value.runId !== SAV_198_APPROVED_RUN_ID ||
    value.authorizationId !== SAV_198_AUTHORIZATION_ID ||
    value.authorizationHash !== expectedAuthorizationHash ||
    !isNonnegativeInteger(value.revision) ||
    !isCanonicalDate(value.createdAt) ||
    !isCanonicalDate(value.updatedAt)
  ) {
    throw new Error("calibration_checkpoint_identity_invalid");
  }
  return {
    contractVersion: "evaluation-calibration-run-checkpoint.v1",
    runId: SAV_198_APPROVED_RUN_ID,
    authorizationId: SAV_198_AUTHORIZATION_ID,
    authorizationHash: expectedAuthorizationHash,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    spend: parseSpendState(value.spend),
  };
}

function parseSpendState(value: unknown): CalibrationPersistedSpendState {
  if (!isRecord(value)) throw new Error("calibration_spend_state_invalid");
  assertExactKeys(value, [
    "attemptedCalls",
    "completedCalls",
    "cumulativeReservedNanoUsd",
    "reconciledActualNanoUsd",
    "unresolvedReservedNanoUsd",
    "stopReason",
    "observedUsage",
    "reservations",
    "resumedSkippedCalls",
  ]);
  if (
    !isNonnegativeInteger(value.attemptedCalls) ||
    !isNonnegativeInteger(value.completedCalls) ||
    !isNonnegativeInteger(value.cumulativeReservedNanoUsd) ||
    !isNonnegativeInteger(value.reconciledActualNanoUsd) ||
    !isNonnegativeInteger(value.unresolvedReservedNanoUsd) ||
    !isNonnegativeInteger(value.resumedSkippedCalls) ||
    !Array.isArray(value.reservations)
  ) {
    throw new Error("calibration_spend_state_numbers_invalid");
  }
  return {
    attemptedCalls: value.attemptedCalls,
    completedCalls: value.completedCalls,
    cumulativeReservedNanoUsd: value.cumulativeReservedNanoUsd,
    reconciledActualNanoUsd: value.reconciledActualNanoUsd,
    unresolvedReservedNanoUsd: value.unresolvedReservedNanoUsd,
    stopReason: parseStopReason(value.stopReason),
    observedUsage: parseUsage(value.observedUsage),
    reservations: value.reservations.map(parseReservation),
    resumedSkippedCalls: value.resumedSkippedCalls,
  };
}

function parseReservation(value: unknown): CalibrationSpendReservation {
  if (!isRecord(value)) throw new Error("calibration_reservation_invalid");
  assertExactKeys(value, [
    "id",
    "callKey",
    "inputTokenCeiling",
    "outputTokenCeiling",
    "worstCaseNanoUsd",
    "settled",
    "usageRecorded",
    "requestBoundaryConfirmed",
  ]);
  if (
    !isNonnegativeInteger(value.id) ||
    typeof value.callKey !== "string" ||
    value.callKey.length < 1 ||
    value.callKey.length > 300 ||
    !isNonnegativeInteger(value.inputTokenCeiling) ||
    !isNonnegativeInteger(value.outputTokenCeiling) ||
    !isNonnegativeInteger(value.worstCaseNanoUsd) ||
    typeof value.settled !== "boolean" ||
    typeof value.usageRecorded !== "boolean" ||
    typeof value.requestBoundaryConfirmed !== "boolean"
  ) {
    throw new Error("calibration_reservation_fields_invalid");
  }
  return {
    id: value.id,
    callKey: value.callKey,
    inputTokenCeiling: value.inputTokenCeiling,
    outputTokenCeiling: value.outputTokenCeiling,
    worstCaseNanoUsd: value.worstCaseNanoUsd,
    settled: value.settled,
    usageRecorded: value.usageRecorded,
    requestBoundaryConfirmed: value.requestBoundaryConfirmed,
  };
}

function parseUsage(value: unknown): CalibrationProviderUsage {
  if (!isRecord(value)) throw new Error("calibration_usage_invalid");
  assertExactKeys(value, [
    "inputTokens",
    "cachedInputTokens",
    "outputTokens",
    "totalTokens",
  ]);
  if (
    !isNonnegativeInteger(value.inputTokens) ||
    !isNonnegativeInteger(value.cachedInputTokens) ||
    !isNonnegativeInteger(value.outputTokens) ||
    !isNonnegativeInteger(value.totalTokens) ||
    value.cachedInputTokens > value.inputTokens ||
    value.totalTokens !== value.inputTokens + value.outputTokens
  ) {
    throw new Error("calibration_usage_fields_invalid");
  }
  return {
    inputTokens: value.inputTokens,
    cachedInputTokens: value.cachedInputTokens,
    outputTokens: value.outputTokens,
    totalTokens: value.totalTokens,
  };
}

function parseStopReason(value: unknown): CalibrationBudgetStopReason | null {
  if (value === null) return null;
  const supported: readonly CalibrationBudgetStopReason[] = [
    "completed_plan",
    "call_cap_reached",
    "spend_cap_before_next_call",
    "provider_failure",
    "provider_model_mismatch",
    "provider_service_tier_missing",
    "provider_service_tier_mismatch",
    "missing_provider_usage",
    "invalid_provider_usage",
    "provider_usage_exceeded_reservation",
    "actual_spend_cap_breached",
    "physical_request_boundary_not_confirmed",
    "pricing_review_expired_before_request",
    "resumed_run_missing_evaluation_evidence",
    "recovered_unresolved_reservation",
  ];
  if (typeof value !== "string" || !supported.includes(value as never)) {
    throw new Error("calibration_stop_reason_invalid");
  }
  return value as CalibrationBudgetStopReason;
}

function validateLease(value: unknown): CalibrationRunLease {
  if (!isRecord(value)) throw new Error("calibration_run_lease_invalid");
  assertExactKeys(value, [
    "contractVersion",
    "runId",
    "ownerId",
    "acquiredAt",
    "heartbeatAt",
    "expiresAt",
  ]);
  if (
    value.contractVersion !== "evaluation-calibration-run-lease.v1" ||
    value.runId !== SAV_198_APPROVED_RUN_ID ||
    typeof value.ownerId !== "string" ||
    value.ownerId.length < 1 ||
    value.ownerId.length > 200 ||
    !isCanonicalDate(value.acquiredAt) ||
    !isCanonicalDate(value.heartbeatAt) ||
    !isCanonicalDate(value.expiresAt)
  ) {
    throw new Error("calibration_run_lease_fields_invalid");
  }
  return value as unknown as CalibrationRunLease;
}

function readLeaseBestEffort(path: string): CalibrationRunLease | null {
  try {
    return validateLease(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

function cloneSpendState(
  state: CalibrationPersistedSpendState
): CalibrationPersistedSpendState {
  return {
    ...state,
    observedUsage: { ...state.observedUsage },
    reservations: state.reservations.map((reservation) => ({
      ...reservation,
    })),
  };
}

function createExclusiveJson(path: string, value: unknown): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeSync(fd, `${JSON.stringify(value, null, 2)}\n`, undefined, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  fsyncDirectory(dirname(path));
}

function writeJsonAtomic(path: string, value: unknown): void {
  const temp = `${path}.tmp.${process.pid}.${randomUUID()}`;
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    const fd = openSync(temp, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
    fsyncDirectory(dirname(path));
  } finally {
    if (existsSync(temp)) rmSync(temp);
  }
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, i) => key !== wanted[i])
  ) {
    throw new Error("calibration_checkpoint_unknown_or_missing_field");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isCanonicalDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function assertValidDate(value: Date, message: string): void {
  if (!Number.isFinite(value.getTime())) throw new Error(message);
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}
