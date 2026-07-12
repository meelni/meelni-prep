import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

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
  getRepository(): GitHubRepositoryIdentity;
  getViewer(): GitHubViewerIdentity;
  getRulesets(): GitHubRuleset[];
  getEffectiveBranchRuleTypes(): string[];
  getRef(): GitHubRef;
  getCommit(sha: string): GitHubCommit;
  createCommit(input: {
    message: string;
    treeSha: string;
    parents: string[];
    date: string;
  }): GitHubCommit;
  updateRef(input: { sha: string; force: false }): GitHubRef;
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

  assertRequestAuthority(): void {
    if (!this.active) throw new Error("calibration_git_activation_released");
    assertCanonicalGitHubAuthority(this.github);
    const current = this.github.getRef();
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

export function activateCalibrationRun(
  options: ActivateCalibrationRunOptions
): ActivatedCalibrationRunAuthority {
  return activateCalibrationRunWithClient(
    options,
    new GhCalibrationGitHubCasClient()
  );
}

function activateCalibrationRunWithClient(
  options: ActivateCalibrationRunOptions,
  github: CalibrationGitHubCasClient
): ActivatedCalibrationRunAuthority {
  const now = options.now ?? new Date();
  const plan = buildCalibrationActivatedPlan({
    authorization: options.authorization,
    adjudicationApproval: options.adjudicationApproval,
    model: options.model,
    repetitions: options.repetitions,
    now,
  });
  assertCanonicalGitHubAuthority(github);

  const currentRef = github.getRef();
  if (currentRef.ref !== SAV_198_GIT_LEDGER_REF) {
    throw new Error("calibration_github_ledger_ref_invalid");
  }
  if (currentRef.sha !== SAV_198_GENESIS_COMMIT_OID) {
    const current = github.getCommit(currentRef.sha);
    if (isValidActivationCommit(current)) {
      throw new Error("calibration_authorized_run_is_already_activated");
    }
    throw new Error("calibration_git_authorization_genesis_oid_mismatch");
  }
  assertPinnedGenesisCommit(github.getCommit(currentRef.sha));

  const activationId = options.activationId ?? randomUUID();
  const activationMessage = stableJson({
    contractVersion: "evaluation-calibration-git-activation.v1",
    runId: SAV_198_APPROVED_RUN_ID,
    authorizationId: SAV_198_AUTHORIZATION_ID,
    authorizationHash: plan.authorizationHash,
    planHash: plan.planHash,
    activationId,
  });
  const activationDate = now.toISOString();
  const activation = github.createCommit({
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
  assertCanonicalGitHubAuthority(github);
  try {
    github.updateRef({ sha: activation.sha, force: false });
  } catch (error) {
    throw new Error("calibration_git_activation_lost_concurrent_cas", {
      cause: error,
    });
  }
  assertCanonicalGitHubAuthority(github);
  const durable = github.getRef();
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

function assertCanonicalGitHubAuthority(
  github: CalibrationGitHubCasClient
): void {
  const repository = github.getRepository();
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
  const viewer = github.getViewer();
  if (
    viewer.id !== SAV_198_GITHUB_ACTIVATION_ACTOR_ID ||
    viewer.login !== SAV_198_GITHUB_ACTIVATION_ACTOR_LOGIN
  ) {
    throw new Error("calibration_github_activation_actor_mismatch");
  }
  assertCanonicalProtection(
    github.getRulesets(),
    github.getEffectiveBranchRuleTypes()
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

class GhCalibrationGitHubCasClient implements CalibrationGitHubCasClient {
  getRepository(): GitHubRepositoryIdentity {
    const response = this.api("GET", "/repos/saviii/meelni-prep");
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

  getViewer(): GitHubViewerIdentity {
    const record = requireRecord(this.api("GET", "/user"), "viewer");
    return {
      id: requireNumber(record.id, "viewer.id"),
      login: requireString(record.login, "viewer.login"),
    };
  }

  getRulesets(): GitHubRuleset[] {
    const listed = this.api(
      "GET",
      "/repos/saviii/meelni-prep/rulesets?includes_parents=true&targets=branch&per_page=100"
    );
    if (!Array.isArray(listed)) {
      throw new Error("calibration_github_rulesets_invalid");
    }
    return listed.flatMap((item) => {
      const summary = requireRecord(item, "ruleset.summary");
      if (
        summary.name !== SAV_198_IMMUTABLE_RULESET_NAME &&
        summary.name !== SAV_198_ACTOR_RULESET_NAME
      ) {
        return [];
      }
      const id = requireNumber(summary.id, "ruleset.id");
      return [
        parseGitHubRuleset(
          this.api(
            "GET",
            `/repos/saviii/meelni-prep/rulesets/${id}?includes_parents=true`
          )
        ),
      ];
    });
  }

  getEffectiveBranchRuleTypes(): string[] {
    const branch = encodeURIComponent(SAV_198_GIT_LEDGER_BRANCH);
    const response = this.api(
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

  getRef(): GitHubRef {
    const record = requireRecord(
      this.api(
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

  getCommit(sha: string): GitHubCommit {
    return parseGitHubCommit(
      this.api("GET", `/repos/saviii/meelni-prep/git/commits/${sha}`)
    );
  }

  createCommit(input: {
    message: string;
    treeSha: string;
    parents: string[];
    date: string;
  }): GitHubCommit {
    return parseGitHubCommit(
      this.api("POST", "/repos/saviii/meelni-prep/git/commits", {
        message: input.message,
        tree: input.treeSha,
        parents: input.parents,
        author: { ...COMMIT_IDENTITY, date: input.date },
        committer: { ...COMMIT_IDENTITY, date: input.date },
      })
    );
  }

  updateRef(input: { sha: string; force: false }): GitHubRef {
    const record = requireRecord(
      this.api(
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

  private api(method: string, path: string, body?: unknown): unknown {
    try {
      const output = execFileSync(
        "gh",
        [
          "api",
          "--hostname",
          "github.com",
          "--method",
          method,
          "-H",
          "Accept: application/vnd.github+json",
          "-H",
          `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
          path,
          ...(body === undefined ? [] : ["--input", "-"]),
        ],
        {
          encoding: "utf8",
          input: body === undefined ? undefined : `${JSON.stringify(body)}\n`,
          stdio: ["pipe", "pipe", "pipe"],
          env: process.env,
        }
      );
      return JSON.parse(output) as unknown;
    } catch (error) {
      throw new Error("calibration_github_api_request_failed", {
        cause: error,
      });
    }
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
