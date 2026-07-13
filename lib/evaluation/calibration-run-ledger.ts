import { createHash, randomUUID } from "node:crypto";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { checkServerIdentity, rootCertificates } from "node:tls";

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
import {
  assertCalibrationLiveStartupState,
  CALIBRATION_LIVE_DISALLOWED_ENV,
} from "./calibration-live-startup.mjs";

export const SAV_198_APPROVED_RUN_ID = "sav-198-authorized-paid-calibration.v1";
export const SAV_198_AUTHORIZATION_ID =
  "sav-198-user-authorization-2026-07-12.v1";
export const SAV_198_GITHUB_OWNER = "saviii";
export const SAV_198_GITHUB_REPOSITORY = "meelni-prep";
export const SAV_198_GITHUB_REPOSITORY_ID = 1_089_904_588;
export const SAV_198_GITHUB_ACTIVATION_ACTOR_LOGIN = "saviii";
export const SAV_198_GITHUB_ACTIVATION_ACTOR_ID = 24_397_508;
export const SAV_198_GIT_LEDGER_BRANCH =
  "meelni-ledger/sav-198-authorized-paid-calibration.v1";
export const SAV_198_GIT_LEDGER_REF =
  `refs/heads/${SAV_198_GIT_LEDGER_BRANCH}` as const;
export const SAV_198_GIT_LEDGER_API_REF =
  `heads/${SAV_198_GIT_LEDGER_BRANCH}` as const;
export const SAV_198_EMPTY_TREE_OID =
  "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
export const SAV_198_GENESIS_DATE = "2026-07-12T08:00:00.000Z";
export const SAV_198_GENESIS_COMMIT_OID =
  "5db3fdc9a4d9bd8b57619db03f4a4193d1b9637a";
export const SAV_198_IMMUTABLE_RULESET_NAME =
  "Meelni SAV-198 calibration ledger immutable";
export const SAV_198_ACTOR_RULESET_NAME =
  "Meelni SAV-198 calibration activation actor";

const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_HOST = "api.github.com";
const GITHUB_API_PORT = 443;
const GITHUB_API_TIMEOUT_MS = 10_000;
const GITHUB_API_MAX_RESPONSE_BYTES = 1_048_576;
const GITHUB_USER_AGENT = "meelni-sav-198-calibration-authority";
const COMMIT_IDENTITY = {
  name: "Meelni Calibration Authorization",
  email: "calibration-ledger@meelni.invalid",
} as const;

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

export const SAV_198_REBASED_PLAN_WORST_CASE_NANO_USD = 2_754_487_500;
export const SAV_198_REBASED_PLAN_HASH =
  "22a0f4da11a7dd5c618f39fdd187b40fe8d17807b0404407c95c5dec16172804";
export const SAV_198_REBASED_PLAN_ACCEPTED_AT = "2026-07-13T11:14:00.000Z";

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

export function buildSAV198RebasedPlanAcceptance(
  adjudicationApproval: unknown
) {
  const plan = buildCalibrationActivatedPlan({
    authorization: SAV_198_SPEND_AUTHORIZATION,
    adjudicationApproval,
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 3,
    now: new Date(SAV_198_REBASED_PLAN_ACCEPTED_AT),
  });
  if (
    plan.plannedCalls !== 96 ||
    plan.plannedWorstCaseNanoUsd !== SAV_198_REBASED_PLAN_WORST_CASE_NANO_USD ||
    plan.planHash !== SAV_198_REBASED_PLAN_HASH
  ) {
    throw new Error("sav_198_rebased_plan_acceptance_mismatch");
  }
  return {
    contractVersion: "evaluation-calibration-plan-acceptance.v1" as const,
    decision: "accepted" as const,
    decisionSource: "product_owner_task_thread_delegation" as const,
    humanReviewerIdentity: null,
    acceptedAt: SAV_198_REBASED_PLAN_ACCEPTED_AT,
    acceptanceBasis:
      "conservative_rebased_exact_plan_within_existing_authorization" as const,
    existingAuthorization: {
      authorizationId: SAV_198_SPEND_AUTHORIZATION.authorizationId,
      runId: SAV_198_SPEND_AUTHORIZATION.runId,
      maximumProviderCalls: SAV_198_SPEND_AUTHORIZATION.maximumProviderCalls,
      maximumPhysicalHttpAttempts:
        SAV_198_SPEND_AUTHORIZATION.maximumPhysicalHttpAttempts,
      maximumSpendUsd: SAV_198_SPEND_AUTHORIZATION.maximumSpendUsd,
      authorizationChanged: false as const,
    },
    acceptedPlan: {
      planHash: plan.planHash,
      plannedCalls: plan.plannedCalls,
      plannedWorstCaseNanoUsd: plan.plannedWorstCaseNanoUsd,
      plannedWorstCaseUsd: plan.plannedWorstCaseNanoUsd / 1_000_000_000,
      candidateArtifactHash: plan.candidateArtifactHash,
      corpusHash: plan.corpusHash,
      approvalHash: plan.approvalHash,
      model: plan.model,
      endpoint: plan.endpoint,
      serviceTier: plan.serviceTier,
      repetitions: plan.repetitions,
      pricingHash: plan.pricingHash,
    },
    unchangedControls: {
      model: true,
      fixtures: true,
      maximumCalls: true,
      maximumSpend: true,
      semanticApproval: true,
    },
    authorityScope: {
      providerCallsExecuted: false,
      ledgerActivated: false,
      launchAuthorized: false,
    },
  };
}

export interface ActivateCalibrationRunOptions {
  authorization: unknown;
  adjudicationApproval: unknown;
  model: string;
  repetitions: number;
  now?: Date;
  activationId?: string;
}

export interface GitHubRepositoryIdentity {
  id: number;
  fullName: string;
  owner: { id: number; login: string };
  private: boolean;
}

export interface GitHubViewerIdentity {
  id: number;
  login: string;
}

export interface GitHubRef {
  ref: string;
  sha: string;
}

export interface GitHubCommitIdentity {
  name: string;
  email: string;
  date: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  treeSha: string;
  parents: string[];
  author: GitHubCommitIdentity;
  committer: GitHubCommitIdentity;
}

export interface GitHubRulesetBypassActor {
  actorId: number | null;
  actorType: string;
  bypassMode: string;
}

export interface GitHubRuleset {
  name: string;
  source: string;
  sourceType: string;
  target: string;
  enforcement: string;
  bypassActors: GitHubRulesetBypassActor[];
  includeRefs: string[];
  excludeRefs: string[];
  ruleTypes: string[];
}

export interface CalibrationGitHubCasClient {
  getRepository(): GitHubRepositoryIdentity | Promise<GitHubRepositoryIdentity>;
  getViewer(): GitHubViewerIdentity | Promise<GitHubViewerIdentity>;
  getRulesets(): GitHubRuleset[] | Promise<GitHubRuleset[]>;
  getEffectiveBranchRuleTypes(): string[] | Promise<string[]>;
  getRef(): GitHubRef | Promise<GitHubRef>;
  getCommit(sha: string): GitHubCommit | Promise<GitHubCommit>;
  createCommit(input: {
    message: string;
    treeSha: string;
    parents: string[];
    date: string;
  }): GitHubCommit | Promise<GitHubCommit>;
  updateRef(input: {
    sha: string;
    force: false;
  }): GitHubRef | Promise<GitHubRef>;
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
    private readonly github: CalibrationGitHubCasClient
  ) {
    this.authorizationHash = plan.authorizationHash;
    this.planHash = plan.planHash;
    this.plannedCalls = plan.plannedCalls;
    this.plannedWorstCaseNanoUsd = plan.plannedWorstCaseNanoUsd;
    this.callsByKey = new Map(plan.calls.map((call) => [call.callKey, call]));
  }

  async assertRequestAuthority(): Promise<void> {
    if (!this.active) throw new Error("calibration_git_activation_released");
    await assertCanonicalGitHubAuthority(this.github);
    const current = await this.github.getRef();
    if (current.ref !== SAV_198_GIT_LEDGER_REF) {
      this.active = false;
      throw new Error("calibration_github_ledger_ref_invalid");
    }
    if (current.sha !== this.activationCommit) {
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

export async function activateCalibrationRun(
  options: ActivateCalibrationRunOptions,
  credentials: { githubToken: string }
): Promise<ActivatedCalibrationRunAuthority> {
  return await activateCalibrationRunWithClient(
    options,
    createProductionGitHubCasClient(credentials.githubToken)
  );
}

async function activateCalibrationRunWithClient(
  options: ActivateCalibrationRunOptions,
  github: CalibrationGitHubCasClient
): Promise<ActivatedCalibrationRunAuthority> {
  const now = options.now ?? new Date();
  const plan = buildCalibrationActivatedPlan({
    authorization: options.authorization,
    adjudicationApproval: options.adjudicationApproval,
    model: options.model,
    repetitions: options.repetitions,
    now,
  });
  await assertCanonicalGitHubAuthority(github);

  const currentRef = await github.getRef();
  if (currentRef.ref !== SAV_198_GIT_LEDGER_REF) {
    throw new Error("calibration_github_ledger_ref_invalid");
  }
  if (currentRef.sha !== SAV_198_GENESIS_COMMIT_OID) {
    const current = await github.getCommit(currentRef.sha);
    if (isValidActivationCommit(current)) {
      throw new Error("calibration_authorized_run_is_already_activated");
    }
    throw new Error("calibration_git_authorization_genesis_oid_mismatch");
  }
  assertPinnedGenesisCommit(await github.getCommit(currentRef.sha));

  const activationId = options.activationId ?? randomUUID();
  const activationMessage = stableJson({
    contractVersion: "evaluation-calibration-git-activation.v1",
    runId: SAV_198_APPROVED_RUN_ID,
    authorizationId: SAV_198_AUTHORIZATION_ID,
    authorizationHash: plan.authorizationHash,
    planHash: plan.planHash,
    activationId,
  });
  const activationDate = toGitHubCommitTimestamp(now);
  const activation = await github.createCommit({
    message: activationMessage,
    treeSha: SAV_198_EMPTY_TREE_OID,
    parents: [SAV_198_GENESIS_COMMIT_OID],
    date: activationDate,
  });
  if (
    !isValidActivationCommit(activation) ||
    activation.message !== activationMessage ||
    !isCommitIdentity(activation.author, activationDate) ||
    !isCommitIdentity(activation.committer, activationDate)
  ) {
    throw new Error("calibration_github_activation_commit_invalid");
  }

  // Protection is re-read immediately before the one non-force ref update.
  await assertCanonicalGitHubAuthority(github);
  try {
    await github.updateRef({ sha: activation.sha, force: false });
  } catch (error) {
    throw new Error("calibration_git_activation_lost_concurrent_cas", {
      cause: error,
    });
  }
  await assertCanonicalGitHubAuthority(github);
  const durable = await github.getRef();
  if (
    durable.ref !== SAV_198_GIT_LEDGER_REF ||
    durable.sha !== activation.sha
  ) {
    throw new Error("calibration_git_activation_not_durable");
  }
  return new ActivatedCalibrationRunAuthority(activation.sha, plan, github);
}

export const calibrationRunLedgerTestSeam = {
  activateWithClient: activateCalibrationRunWithClient,
  createGitHubClient: createTestGitHubCasClient,
  nodeRequestOptions: buildNodeGitHubRequestOptions,
};

export function calibrationAuthorizationCommitMessage(): string {
  return stableJson({
    contractVersion: "evaluation-calibration-git-authorization.v1",
    runId: SAV_198_APPROVED_RUN_ID,
    authorizationId: SAV_198_AUTHORIZATION_ID,
    authorizationHash: sha256(stableJson(SAV_198_SPEND_AUTHORIZATION)),
  });
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

async function assertCanonicalGitHubAuthority(
  github: CalibrationGitHubCasClient
): Promise<void> {
  const repository = await github.getRepository();
  if (
    repository.id !== SAV_198_GITHUB_REPOSITORY_ID ||
    repository.fullName !==
      `${SAV_198_GITHUB_OWNER}/${SAV_198_GITHUB_REPOSITORY}` ||
    repository.owner.id !== SAV_198_GITHUB_ACTIVATION_ACTOR_ID ||
    repository.owner.login !== SAV_198_GITHUB_OWNER ||
    repository.private !== true
  ) {
    throw new Error("calibration_github_repository_identity_mismatch");
  }
  const viewer = await github.getViewer();
  if (
    viewer.id !== SAV_198_GITHUB_ACTIVATION_ACTOR_ID ||
    viewer.login !== SAV_198_GITHUB_ACTIVATION_ACTOR_LOGIN
  ) {
    throw new Error("calibration_github_activation_actor_mismatch");
  }
  assertCanonicalProtection(
    await github.getRulesets(),
    await github.getEffectiveBranchRuleTypes()
  );
}

function assertCanonicalProtection(
  rulesets: GitHubRuleset[],
  effectiveRuleTypes: string[]
): void {
  if (
    rulesets.length !== 2 ||
    rulesets.filter(({ name }) => name === SAV_198_IMMUTABLE_RULESET_NAME)
      .length !== 1 ||
    rulesets.filter(({ name }) => name === SAV_198_ACTOR_RULESET_NAME)
      .length !== 1
  ) {
    throw new Error("calibration_github_ruleset_set_invalid");
  }
  const immutable = rulesets.find(
    ({ name }) => name === SAV_198_IMMUTABLE_RULESET_NAME
  );
  if (!immutable || !isExactRepositoryRuleset(immutable)) {
    throw new Error("calibration_github_immutable_ruleset_missing");
  }
  if (
    immutable.bypassActors.length !== 0 ||
    !hasExactStrings(immutable.ruleTypes, ["deletion", "non_fast_forward"])
  ) {
    throw new Error("calibration_github_immutable_ruleset_unsafe");
  }

  const actor = rulesets.find(
    ({ name }) => name === SAV_198_ACTOR_RULESET_NAME
  );
  if (!actor || !isExactRepositoryRuleset(actor)) {
    throw new Error("calibration_github_actor_ruleset_missing");
  }
  if (
    !hasExactStrings(actor.ruleTypes, ["creation", "update"]) ||
    actor.bypassActors.length !== 1 ||
    actor.bypassActors[0]?.actorId !== SAV_198_GITHUB_ACTIVATION_ACTOR_ID ||
    actor.bypassActors[0]?.actorType !== "User" ||
    actor.bypassActors[0]?.bypassMode !== "always"
  ) {
    throw new Error("calibration_github_actor_ruleset_unsafe");
  }
  const effective = new Set(effectiveRuleTypes);
  for (const required of [
    "creation",
    "non_fast_forward",
    "deletion",
    "update",
  ]) {
    if (!effective.has(required)) {
      throw new Error("calibration_github_effective_protection_missing");
    }
  }
}

function isExactRepositoryRuleset(ruleset: GitHubRuleset): boolean {
  return (
    ruleset.source === `${SAV_198_GITHUB_OWNER}/${SAV_198_GITHUB_REPOSITORY}` &&
    ruleset.sourceType === "Repository" &&
    ruleset.target === "branch" &&
    ruleset.enforcement === "active" &&
    ruleset.includeRefs.length === 1 &&
    ruleset.includeRefs[0] === SAV_198_GIT_LEDGER_REF &&
    ruleset.excludeRefs.length === 0
  );
}

function hasExactStrings(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

function assertPinnedGenesisCommit(commit: GitHubCommit): void {
  if (
    commit.sha !== SAV_198_GENESIS_COMMIT_OID ||
    commit.message !== calibrationAuthorizationCommitMessage() ||
    commit.treeSha !== SAV_198_EMPTY_TREE_OID ||
    commit.parents.length !== 0 ||
    !isCommitIdentity(commit.author, SAV_198_GENESIS_DATE) ||
    !isCommitIdentity(commit.committer, SAV_198_GENESIS_DATE)
  ) {
    throw new Error("calibration_git_authorization_commit_invalid");
  }
}

function isValidActivationCommit(commit: GitHubCommit): boolean {
  if (
    commit.treeSha !== SAV_198_EMPTY_TREE_OID ||
    commit.parents.length !== 1 ||
    commit.parents[0] !== SAV_198_GENESIS_COMMIT_OID ||
    !isCommitIdentity(commit.author, commit.author.date) ||
    !isCommitIdentity(commit.committer, commit.author.date)
  ) {
    return false;
  }
  try {
    const parsed = JSON.parse(commit.message) as Record<string, unknown>;
    return (
      parsed.contractVersion === "evaluation-calibration-git-activation.v1" &&
      parsed.runId === SAV_198_APPROVED_RUN_ID &&
      parsed.authorizationId === SAV_198_AUTHORIZATION_ID &&
      typeof parsed.authorizationHash === "string" &&
      typeof parsed.planHash === "string" &&
      typeof parsed.activationId === "string" &&
      parsed.activationId.length > 0
    );
  } catch {
    return false;
  }
}

function isCommitIdentity(
  identity: GitHubCommitIdentity,
  date: string
): boolean {
  return (
    identity.name === COMMIT_IDENTITY.name &&
    identity.email === COMMIT_IDENTITY.email &&
    normalizeTimestamp(identity.date) === normalizeTimestamp(date)
  );
}

interface GitHubHttpsResponse {
  statusCode: number;
  body: AsyncIterable<Uint8Array>;
}

interface GitHubHttpsTransport {
  request(input: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string | undefined;
    signal: AbortSignal;
  }): Promise<GitHubHttpsResponse>;
}

interface GitHubClientLimits {
  timeoutMs: number;
  maximumResponseBytes: number;
}

type CalibrationGitHubEnvironment = Record<string, string | undefined> & {
  GITHUB_TOKEN?: string;
};

class DirectCalibrationGitHubCasClient implements CalibrationGitHubCasClient {
  readonly #env: CalibrationGitHubEnvironment;
  readonly #token: string;
  readonly #transport: GitHubHttpsTransport;
  readonly #limits: GitHubClientLimits;

  constructor(
    env: CalibrationGitHubEnvironment,
    token: string,
    transport: GitHubHttpsTransport,
    limits: GitHubClientLimits,
    private readonly attestStartup: () => void
  ) {
    this.#env = env;
    this.#token = token;
    this.#transport = transport;
    this.#limits = limits;
  }

  async getRepository(): Promise<GitHubRepositoryIdentity> {
    const response = await this.api("GET", "/repos/saviii/meelni-prep");
    const record = requireRecord(response, "repository");
    const owner = requireRecord(record.owner, "repository.owner");
    return {
      id: requireNumber(record.id, "repository.id"),
      fullName: requireString(record.full_name, "repository.full_name"),
      owner: {
        id: requireNumber(owner.id, "repository.owner.id"),
        login: requireString(owner.login, "repository.owner.login"),
      },
      private: record.private === true,
    };
  }

  async getViewer(): Promise<GitHubViewerIdentity> {
    const record = requireRecord(await this.api("GET", "/user"), "viewer");
    return {
      id: requireNumber(record.id, "viewer.id"),
      login: requireString(record.login, "viewer.login"),
    };
  }

  async getRulesets(): Promise<GitHubRuleset[]> {
    const listed = await this.api(
      "GET",
      "/repos/saviii/meelni-prep/rulesets?includes_parents=true&targets=branch&per_page=100"
    );
    if (!Array.isArray(listed)) {
      throw new Error("calibration_github_rulesets_invalid");
    }
    const rulesets: GitHubRuleset[] = [];
    for (const item of listed) {
      const summary = requireRecord(item, "ruleset.summary");
      if (
        summary.name !== SAV_198_IMMUTABLE_RULESET_NAME &&
        summary.name !== SAV_198_ACTOR_RULESET_NAME
      ) {
        continue;
      }
      const id = requireNumber(summary.id, "ruleset.id");
      rulesets.push(
        parseGitHubRuleset(
          await this.api(
            "GET",
            `/repos/saviii/meelni-prep/rulesets/${id}?includes_parents=true`
          )
        )
      );
    }
    return rulesets;
  }

  async getEffectiveBranchRuleTypes(): Promise<string[]> {
    const branch = encodeURIComponent(SAV_198_GIT_LEDGER_BRANCH);
    const response = await this.api(
      "GET",
      `/repos/saviii/meelni-prep/rules/branches/${branch}`
    );
    if (!Array.isArray(response)) {
      throw new Error("calibration_github_effective_rules_invalid");
    }
    return response.map((rule) =>
      requireString(requireRecord(rule, "effective.rule").type, "rule.type")
    );
  }

  async getRef(): Promise<GitHubRef> {
    const record = requireRecord(
      await this.api(
        "GET",
        `/repos/saviii/meelni-prep/git/ref/${SAV_198_GIT_LEDGER_API_REF}`
      ),
      "ref"
    );
    const object = requireRecord(record.object, "ref.object");
    if (object.type !== "commit") {
      throw new Error("calibration_github_ledger_ref_not_commit");
    }
    return {
      ref: requireString(record.ref, "ref.ref"),
      sha: requireOid(object.sha, "ref.object.sha"),
    };
  }

  async getCommit(sha: string): Promise<GitHubCommit> {
    return parseGitHubCommit(
      await this.api("GET", `/repos/saviii/meelni-prep/git/commits/${sha}`)
    );
  }

  async createCommit(input: {
    message: string;
    treeSha: string;
    parents: string[];
    date: string;
  }): Promise<GitHubCommit> {
    return parseGitHubCommit(
      await this.api("POST", "/repos/saviii/meelni-prep/git/commits", {
        message: input.message,
        tree: input.treeSha,
        parents: input.parents,
        author: { ...COMMIT_IDENTITY, date: input.date },
        committer: { ...COMMIT_IDENTITY, date: input.date },
      })
    );
  }

  async updateRef(input: { sha: string; force: false }): Promise<GitHubRef> {
    const record = requireRecord(
      await this.api(
        "PATCH",
        `/repos/saviii/meelni-prep/git/refs/${SAV_198_GIT_LEDGER_API_REF}`,
        input
      ),
      "updatedRef"
    );
    const object = requireRecord(record.object, "updatedRef.object");
    return {
      ref: requireString(record.ref, "updatedRef.ref"),
      sha: requireOid(object.sha, "updatedRef.object.sha"),
    };
  }

  private async api(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    this.attestStartup();
    assertGitHubTransportEnvironment(this.#env);
    if (this.#env.GITHUB_TOKEN?.trim() !== this.#token) {
      throw new Error("calibration_github_token_changed");
    }
    const serializedBody =
      body === undefined ? undefined : JSON.stringify(body);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.#limits.timeoutMs
    );
    try {
      const response = await this.#transport.request({
        method,
        path,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.#token}`,
          "User-Agent": GITHUB_USER_AGENT,
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
          ...(serializedBody === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": String(Buffer.byteLength(serializedBody)),
              }),
        },
        body: serializedBody,
        signal: controller.signal,
      });
      if (response.statusCode >= 300 && response.statusCode < 400) {
        throw new Error("calibration_github_api_redirect_rejected");
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error("calibration_github_api_status_invalid");
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > this.#limits.maximumResponseBytes) {
          throw new Error("calibration_github_api_response_too_large");
        }
        chunks.push(buffer);
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
      } catch {
        throw new Error("calibration_github_api_response_invalid");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("calibration_github_")
      ) {
        throw error;
      }
      throw new Error(
        controller.signal.aborted
          ? "calibration_github_api_request_timed_out"
          : "calibration_github_api_request_failed"
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function createProductionGitHubCasClient(
  githubToken: string
): CalibrationGitHubCasClient {
  assertCalibrationLiveStartupState();
  return createDirectGitHubCasClient(
    { GITHUB_TOKEN: githubToken },
    new NodeGitHubHttpsTransport(),
    {
      timeoutMs: GITHUB_API_TIMEOUT_MS,
      maximumResponseBytes: GITHUB_API_MAX_RESPONSE_BYTES,
    },
    assertCalibrationLiveStartupState
  );
}

function createTestGitHubCasClient(
  env: CalibrationGitHubEnvironment,
  transport: GitHubHttpsTransport,
  limits: Partial<GitHubClientLimits> = {},
  attestStartup: () => void = () => undefined
): CalibrationGitHubCasClient {
  return createDirectGitHubCasClient(
    env,
    transport,
    {
      timeoutMs: limits.timeoutMs ?? GITHUB_API_TIMEOUT_MS,
      maximumResponseBytes:
        limits.maximumResponseBytes ?? GITHUB_API_MAX_RESPONSE_BYTES,
    },
    attestStartup
  );
}

function createDirectGitHubCasClient(
  env: CalibrationGitHubEnvironment,
  transport: GitHubHttpsTransport,
  limits: GitHubClientLimits,
  attestStartup: () => void
): CalibrationGitHubCasClient {
  attestStartup();
  assertGitHubTransportEnvironment(env);
  const token = env.GITHUB_TOKEN?.trim();
  if (!token || /[\r\n]/.test(token)) {
    throw new Error("calibration_github_token_missing_or_invalid");
  }
  if (
    !Number.isSafeInteger(limits.timeoutMs) ||
    limits.timeoutMs <= 0 ||
    !Number.isSafeInteger(limits.maximumResponseBytes) ||
    limits.maximumResponseBytes <= 0
  ) {
    throw new Error("calibration_github_transport_limits_invalid");
  }
  return new DirectCalibrationGitHubCasClient(
    env,
    token,
    transport,
    limits,
    attestStartup
  );
}

function assertGitHubTransportEnvironment(
  env: CalibrationGitHubEnvironment
): void {
  for (const name of CALIBRATION_LIVE_DISALLOWED_ENV) {
    if (env[name] !== undefined) {
      throw new Error(`calibration_github_transport_env_${name}_rejected`);
    }
  }
}

class NodeGitHubHttpsTransport implements GitHubHttpsTransport {
  request(input: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string | undefined;
    signal: AbortSignal;
  }): Promise<GitHubHttpsResponse> {
    return new Promise((resolve, reject) => {
      const request = httpsRequest(
        buildNodeGitHubRequestOptions(input),
        (response) => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body: response,
          });
        }
      );
      request.once("error", reject);
      request.end(input.body);
    });
  }
}

function buildNodeGitHubRequestOptions(input: {
  method: string;
  path: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}): RequestOptions {
  return {
    protocol: "https:",
    hostname: GITHUB_API_HOST,
    port: GITHUB_API_PORT,
    servername: GITHUB_API_HOST,
    method: input.method,
    path: input.path,
    headers: input.headers,
    ca: [...rootCertificates],
    checkServerIdentity,
    rejectUnauthorized: true,
    agent: false,
    signal: input.signal,
  };
}

function parseGitHubRuleset(value: unknown): GitHubRuleset {
  const record = requireRecord(value, "ruleset");
  const conditions = requireRecord(record.conditions, "ruleset.conditions");
  const refName = requireRecord(conditions.ref_name, "ruleset.ref_name");
  if (!Array.isArray(record.bypass_actors) || !Array.isArray(record.rules)) {
    throw new Error("calibration_github_ruleset_shape_invalid");
  }
  return {
    name: requireString(record.name, "ruleset.name"),
    source: requireString(record.source, "ruleset.source"),
    sourceType: requireString(record.source_type, "ruleset.source_type"),
    target: requireString(record.target, "ruleset.target"),
    enforcement: requireString(record.enforcement, "ruleset.enforcement"),
    bypassActors: record.bypass_actors.map((value) => {
      const actor = requireRecord(value, "ruleset.bypassActor");
      return {
        actorId:
          actor.actor_id === null
            ? null
            : requireNumber(actor.actor_id, "ruleset.actor_id"),
        actorType: requireString(actor.actor_type, "ruleset.actor_type"),
        bypassMode: requireString(actor.bypass_mode, "ruleset.bypass_mode"),
      };
    }),
    includeRefs: requireStringArray(refName.include, "ruleset.include"),
    excludeRefs: requireStringArray(refName.exclude, "ruleset.exclude"),
    ruleTypes: record.rules.map((value) =>
      requireString(requireRecord(value, "ruleset.rule").type, "rule.type")
    ),
  };
}

function parseGitHubCommit(value: unknown): GitHubCommit {
  const record = requireRecord(value, "commit");
  const tree = requireRecord(record.tree, "commit.tree");
  if (!Array.isArray(record.parents)) {
    throw new Error("calibration_github_commit_parents_invalid");
  }
  return {
    sha: requireOid(record.sha, "commit.sha"),
    message: requireString(record.message, "commit.message"),
    treeSha: requireOid(tree.sha, "commit.tree.sha"),
    parents: record.parents.map((value) =>
      requireOid(requireRecord(value, "commit.parent").sha, "parent.sha")
    ),
    author: parseGitHubCommitIdentity(record.author, "commit.author"),
    committer: parseGitHubCommitIdentity(record.committer, "commit.committer"),
  };
}

function parseGitHubCommitIdentity(
  value: unknown,
  field: string
): GitHubCommitIdentity {
  const record = requireRecord(value, field);
  return {
    name: requireString(record.name, `${field}.name`),
    email: requireString(record.email, `${field}.email`),
    date: requireString(record.date, `${field}.date`),
  };
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

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`calibration_github_${field}_invalid`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`calibration_github_${field}_invalid`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`calibration_github_${field}_invalid`);
  }
  return [...value];
}

function requireNumber(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`calibration_github_${field}_invalid`);
  }
  return value as number;
}

function requireOid(value: unknown, field: string): string {
  const oid = requireString(value, field);
  if (!/^[0-9a-f]{40}$/.test(oid)) {
    throw new Error(`calibration_github_${field}_invalid`);
  }
  return oid;
}

function normalizeTimestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("calibration_github_commit_date_invalid");
  }
  return parsed.toISOString();
}

function toGitHubCommitTimestamp(value: Date): string {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) {
    throw new Error("calibration_github_commit_date_invalid");
  }
  return new Date(Math.floor(milliseconds / 1_000) * 1_000)
    .toISOString()
    .replace(".000Z", "Z");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
