import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  evaluationCalibrationCases,
} from "@meelni/test-fixtures";

import {
  getEvaluationAdjudicationHashes,
  parseEvaluationAdjudicationApproval,
} from "./calibration-approval";
import {
  CALIBRATION_MAX_COMPLETION_TOKENS,
  CALIBRATION_MAX_PROVIDER_CALLS,
  CALIBRATION_MAX_SPEND_NANO_USD,
  CALIBRATION_PRICING_CONTRACT,
  calibrationInputTokenCeiling,
  calculateWorstCaseNanoUsd,
  createEmptyCalibrationSpendState,
  validateCalibrationPricingFreshness,
  type CalibrationPersistedSpendState,
  type CalibrationSpendPersistence,
} from "./calibration-budget";

export const SAV_198_APPROVED_RUN_ID = "sav-198-authorized-paid-calibration.v1";
export const SAV_198_AUTHORIZATION_ID =
  "sav-198-user-authorization-2026-07-12.v1";
export const SAV_198_GIT_LEDGER_REF =
  "refs/heads/meelni-ledger/sav-198-authorized-paid-calibration.v1";

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

export interface CalibrationActivatedPlanCall {
  callKey: string;
  inputTokenCeiling: number;
  outputTokenCeiling: 2_000;
  worstCaseNanoUsd: number;
}

export interface CalibrationActivatedPlan {
  contractVersion: "evaluation-calibration-activated-plan.v1";
  runId: typeof SAV_198_APPROVED_RUN_ID;
  authorizationId: typeof SAV_198_AUTHORIZATION_ID;
  authorizationHash: string;
  candidateArtifactHash: string;
  corpusHash: string;
  approvalHash: string;
  goldSetVersion: typeof EVALUATION_GOLD_SET_VERSION;
  adjudicationVersion: typeof EVALUATION_ADJUDICATION_VERSION;
  model: typeof CALIBRATION_PRICING_CONTRACT.model;
  endpoint: typeof CALIBRATION_PRICING_CONTRACT.endpoint;
  serviceTier: typeof CALIBRATION_PRICING_CONTRACT.serviceTier;
  pricingHash: string;
  repetitions: 3;
  plannedCalls: number;
  plannedWorstCaseNanoUsd: number;
  calls: CalibrationActivatedPlanCall[];
  planHash: string;
}

export interface ActivateCalibrationRunOptions {
  authorization: unknown;
  adjudicationApproval: unknown;
  model: string;
  repetitions: number;
  remoteUrl: string;
  now?: Date;
  activationId?: string;
  /** Tests use an isolated Git executable wrapper only. */
  gitExecutable?: string;
}

export class ActivatedCalibrationRunAuthority
  implements CalibrationSpendPersistence
{
  readonly durable = true as const;
  readonly runId = SAV_198_APPROVED_RUN_ID;
  readonly authorizationId = SAV_198_AUTHORIZATION_ID;
  readonly authorizationHash: string;
  readonly planHash: string;
  readonly plannedCalls: number;
  readonly plannedWorstCaseNanoUsd: number;
  private active = true;
  private spend = createEmptyCalibrationSpendState();
  private readonly callsByKey: Map<string, CalibrationActivatedPlanCall>;

  constructor(
    readonly activationCommit: string,
    readonly plan: CalibrationActivatedPlan,
    private readonly remoteUrl: string,
    private readonly gitExecutable = "git"
  ) {
    this.authorizationHash = plan.authorizationHash;
    this.planHash = plan.planHash;
    this.plannedCalls = plan.plannedCalls;
    this.plannedWorstCaseNanoUsd = plan.plannedWorstCaseNanoUsd;
    this.callsByKey = new Map(plan.calls.map((call) => [call.callKey, call]));
  }

  assertRequestAuthority(): void {
    if (!this.active) throw new Error("calibration_git_activation_released");
    const current = readRemoteRef(
      this.remoteUrl,
      SAV_198_GIT_LEDGER_REF,
      this.gitExecutable
    );
    if (current !== this.activationCommit) {
      this.active = false;
      throw new Error("calibration_git_activation_is_not_current");
    }
  }

  assertReservationAuthorized(input: CalibrationActivatedPlanCall): void {
    const planned = this.callsByKey.get(input.callKey);
    if (!planned || stableJson(planned) !== stableJson(input)) {
      throw new Error("calibration_reservation_not_in_activated_plan");
    }
  }

  loadSpendState(): CalibrationPersistedSpendState {
    return cloneSpendState(this.spend);
  }

  saveSpendState(state: CalibrationPersistedSpendState): void {
    if (!this.active) throw new Error("calibration_git_activation_released");
    this.spend = cloneSpendState(state);
  }

  release(): void {
    this.active = false;
  }
}

export function buildCalibrationActivatedPlan(input: {
  authorization: unknown;
  adjudicationApproval: unknown;
  model: string;
  repetitions: number;
  now: Date;
}): CalibrationActivatedPlan {
  const authorization = parseCalibrationSpendAuthorization(input.authorization);
  const approval = parseEvaluationAdjudicationApproval(
    input.adjudicationApproval
  );
  if (approval.decisions.some(({ decision }) => decision !== "approved")) {
    throw new Error("calibration_git_activation_requires_full_adjudication");
  }
  if (input.model !== CALIBRATION_PRICING_CONTRACT.model) {
    throw new Error("calibration_git_activation_model_mismatch");
  }
  if (input.repetitions !== 3) {
    throw new Error("calibration_git_activation_repetitions_mismatch");
  }
  validateCalibrationPricingFreshness(input.now);

  const scoredCases = evaluationCalibrationCases.filter(
    ({ expectedCompletionState }) =>
      expectedCompletionState === "full" ||
      expectedCompletionState === "partial"
  );
  const calls = scoredCases.flatMap<CalibrationActivatedPlanCall>((fixture) => {
    const inputTokenCeiling = calibrationInputTokenCeiling(fixture);
    const worstCaseNanoUsd = calculateWorstCaseNanoUsd(
      inputTokenCeiling,
      CALIBRATION_MAX_COMPLETION_TOKENS,
      CALIBRATION_PRICING_CONTRACT
    );
    return Array.from({ length: input.repetitions }, (_, runIndex) => ({
      callKey: `${fixture.id}:${runIndex}`,
      inputTokenCeiling,
      outputTokenCeiling: CALIBRATION_MAX_COMPLETION_TOKENS,
      worstCaseNanoUsd,
    }));
  });
  const plannedWorstCaseNanoUsd = calls.reduce(
    (total, call) => total + call.worstCaseNanoUsd,
    0
  );
  if (
    calls.length > CALIBRATION_MAX_PROVIDER_CALLS ||
    calls.length > authorization.maximumProviderCalls ||
    calls.length > authorization.maximumPhysicalHttpAttempts ||
    plannedWorstCaseNanoUsd > CALIBRATION_MAX_SPEND_NANO_USD
  ) {
    throw new Error("calibration_git_activation_plan_exceeds_authorization");
  }

  const adjudicationHashes = getEvaluationAdjudicationHashes();
  const authorizationHash = sha256(stableJson(authorization));
  const pricingHash = sha256(stableJson(CALIBRATION_PRICING_CONTRACT));
  const approvalHash = sha256(
    stableJson({
      ...approval,
      decisions: [...approval.decisions].sort((left, right) =>
        left.caseId.localeCompare(right.caseId)
      ),
    })
  );
  const withoutHash = {
    contractVersion: "evaluation-calibration-activated-plan.v1" as const,
    runId: SAV_198_APPROVED_RUN_ID as typeof SAV_198_APPROVED_RUN_ID,
    authorizationId:
      SAV_198_AUTHORIZATION_ID as typeof SAV_198_AUTHORIZATION_ID,
    authorizationHash,
    ...adjudicationHashes,
    approvalHash,
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    model: CALIBRATION_PRICING_CONTRACT.model,
    endpoint: CALIBRATION_PRICING_CONTRACT.endpoint,
    serviceTier: CALIBRATION_PRICING_CONTRACT.serviceTier,
    pricingHash,
    repetitions: 3 as const,
    plannedCalls: calls.length,
    plannedWorstCaseNanoUsd,
    calls,
  };
  return { ...withoutHash, planHash: sha256(stableJson(withoutHash)) };
}

export function activateCalibrationRun(
  options: ActivateCalibrationRunOptions
): ActivatedCalibrationRunAuthority {
  const now = options.now ?? new Date();
  const plan = buildCalibrationActivatedPlan({
    authorization: options.authorization,
    adjudicationApproval: options.adjudicationApproval,
    model: options.model,
    repetitions: options.repetitions,
    now,
  });
  const gitExecutable = options.gitExecutable ?? "git";
  const work = mkdtempSync(join(tmpdir(), "meelni-calibration-git-cas-"));
  try {
    git(gitExecutable, ["init", "--bare", "--quiet", work]);
    let current: string;
    try {
      git(gitExecutable, [
        `--git-dir=${work}`,
        "fetch",
        "--quiet",
        "--no-tags",
        options.remoteUrl,
        SAV_198_GIT_LEDGER_REF,
      ]);
      current = git(gitExecutable, [
        `--git-dir=${work}`,
        "rev-parse",
        "FETCH_HEAD",
      ]).trim();
    } catch (error) {
      throw new Error("calibration_git_authorization_ref_missing", {
        cause: error,
      });
    }

    const message = git(gitExecutable, [
      `--git-dir=${work}`,
      "show",
      "-s",
      "--format=%B",
      current,
    ]).trim();
    const parents = git(gitExecutable, [
      `--git-dir=${work}`,
      "show",
      "-s",
      "--format=%P",
      current,
    ]).trim();
    const tree = git(gitExecutable, [
      `--git-dir=${work}`,
      "show",
      "-s",
      "--format=%T",
      current,
    ]).trim();
    const emptyTree = git(gitExecutable, [
      `--git-dir=${work}`,
      "mktree",
    ]).trim();
    if (tree !== emptyTree) {
      throw new Error("calibration_git_ledger_commit_must_be_payload_free");
    }
    if (message !== calibrationAuthorizationCommitMessage() || parents) {
      if (isActivationMessage(message)) {
        throw new Error("calibration_authorized_run_is_already_activated");
      }
      throw new Error("calibration_git_authorization_commit_invalid");
    }

    const activationId = options.activationId ?? randomUUID();
    const activatedMessage = stableJson({
      contractVersion: "evaluation-calibration-git-activation.v1",
      runId: SAV_198_APPROVED_RUN_ID,
      authorizationId: SAV_198_AUTHORIZATION_ID,
      authorizationHash: plan.authorizationHash,
      planHash: plan.planHash,
      activationId,
    });
    const activationCommit = git(
      gitExecutable,
      [`--git-dir=${work}`, "commit-tree", emptyTree, "-p", current],
      activatedMessage,
      now
    ).trim();
    try {
      git(gitExecutable, [
        `--git-dir=${work}`,
        "push",
        "--porcelain",
        options.remoteUrl,
        `${activationCommit}:${SAV_198_GIT_LEDGER_REF}`,
      ]);
    } catch (error) {
      throw new Error("calibration_git_activation_lost_concurrent_cas", {
        cause: error,
      });
    }
    if (
      readRemoteRef(
        options.remoteUrl,
        SAV_198_GIT_LEDGER_REF,
        gitExecutable
      ) !== activationCommit
    ) {
      throw new Error("calibration_git_activation_not_durable");
    }
    return new ActivatedCalibrationRunAuthority(
      activationCommit,
      plan,
      options.remoteUrl,
      gitExecutable
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function calibrationAuthorizationCommitMessage(): string {
  return stableJson({
    contractVersion: "evaluation-calibration-git-authorization.v1",
    runId: SAV_198_APPROVED_RUN_ID,
    authorizationId: SAV_198_AUTHORIZATION_ID,
    authorizationHash: sha256(stableJson(SAV_198_SPEND_AUTHORIZATION)),
  });
}

export function getCalibrationRepositoryRemoteUrl(
  cwd = process.cwd(),
  gitExecutable = "git"
): string {
  const url = git(gitExecutable, [
    "-C",
    cwd,
    "remote",
    "get-url",
    "--push",
    "origin",
  ]).trim();
  if (!url) throw new Error("calibration_git_origin_remote_missing");
  return url;
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

function readRemoteRef(
  remoteUrl: string,
  ref: string,
  gitExecutable: string
): string {
  try {
    const output = git(gitExecutable, ["ls-remote", "--refs", remoteUrl, ref]);
    const [oid, returnedRef, extra] = output.trim().split(/\s+/);
    if (
      !oid ||
      returnedRef !== ref ||
      extra ||
      !/^[0-9a-f]{40,64}$/.test(oid)
    ) {
      throw new Error("calibration_git_ledger_ref_invalid");
    }
    return oid;
  } catch (error) {
    throw new Error("calibration_git_ledger_ref_unavailable", { cause: error });
  }
}

function git(
  executable: string,
  args: string[],
  input?: string,
  now = new Date()
): string {
  return execFileSync(executable, args, {
    encoding: "utf8",
    input: input === undefined ? undefined : `${input}\n`,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Meelni Calibration Authorization",
      GIT_AUTHOR_EMAIL: "calibration-ledger@meelni.invalid",
      GIT_AUTHOR_DATE: now.toISOString(),
      GIT_COMMITTER_NAME: "Meelni Calibration Authorization",
      GIT_COMMITTER_EMAIL: "calibration-ledger@meelni.invalid",
      GIT_COMMITTER_DATE: now.toISOString(),
    },
  });
}

function isActivationMessage(message: string): boolean {
  try {
    const parsed = JSON.parse(message) as Record<string, unknown>;
    return (
      parsed.contractVersion === "evaluation-calibration-git-activation.v1" &&
      parsed.runId === SAV_198_APPROVED_RUN_ID &&
      parsed.authorizationId === SAV_198_AUTHORIZATION_ID
    );
  } catch {
    return false;
  }
}

function cloneSpendState(
  state: CalibrationPersistedSpendState
): CalibrationPersistedSpendState {
  return {
    ...state,
    observedUsage: { ...state.observedUsage },
    reservations: state.reservations.map((reservation) => ({ ...reservation })),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error("calibration_authorization_unknown_or_missing_field");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
