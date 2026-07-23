import { createHash, randomUUID } from "node:crypto";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { checkServerIdentity, rootCertificates } from "node:tls";

import {
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  evaluationCalibrationCases,
} from "@meelni/test-fixtures";
import { FEEDBACK_PROMPT_VERSION } from "@meelni/core";

import {
  getEvaluationAdjudicationHashes,
  parseEvaluationAdjudicationApproval,
} from "./calibration-approval";
import {
  CALIBRATION_MAX_COMPLETION_TOKENS,
  CALIBRATION_MAX_PROVIDER_CALLS,
  CALIBRATION_MAX_SPEND_NANO_USD,
  CALIBRATION_PRICING_CONTRACT,
  calculateWorstCaseNanoUsd,
  createEmptyCalibrationSpendState,
  structuredCalibrationInputTokenCeiling,
  validateCalibrationPricingFreshness,
  type CalibrationPersistedSpendState,
  type CalibrationSpendPersistence,
} from "./calibration-budget";
import {
  assertCalibrationLiveStartupState,
  CALIBRATION_LIVE_DISALLOWED_ENV,
} from "./calibration-live-startup.mjs";
import { EVALUATION_SYSTEM_PROMPT, getEvaluationPrompt } from "./prompts";
import { projectEvaluationTranscriptAliases } from "./transcript-aliases";
import {
  FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION,
  getFeedbackProviderResponseFormatContractHash,
} from "./provider-response-format";
import {
  FEEDBACK_CALIBRATION_REQUEST_POLICY_VERSION,
  getFeedbackCalibrationRequestPolicyHash,
} from "./calibration-request-policy";
import {
  SAV_248_V4_APPROVED_RUN_ID,
  SAV_248_V4_PREDECESSOR_AUTHORITIES,
  assertCalibrationOwnerAuthorizationMatchesPlan,
  assertCalibrationOwnerAuthorizationWasVerified,
  type ApprovedCalibrationSpendAuthorization,
  type VerifiedCalibrationOwnerAuthorization,
} from "./calibration-owner-authorization";
import type { VerifiedDelegatedAgentAuthorization } from "@/lib/operations/delegated-agent-authorization";

export {
  SAV_248_V4_APPROVED_RUN_ID,
  SAV_248_V4_PREDECESSOR_AUTHORITIES,
} from "./calibration-owner-authorization";
export const SAV_248_V4_AUTHORIZATION_ID =
  "sav-248-pending-paid-calibration-authorization.v4";
export const SAV_248_V4_GITHUB_OWNER = "meelni";
export const SAV_248_V4_GITHUB_REPOSITORY = "meelni-prep";
export const SAV_248_V4_GITHUB_REPOSITORY_ID = 1_089_904_588;
export const SAV_248_V4_GITHUB_OWNER_ID = 302_571_838;
export const SAV_248_V4_GITHUB_ACTIVATION_ACTOR_LOGIN = "saviii";
export const SAV_248_V4_GITHUB_ACTIVATION_ACTOR_ID = 24_397_508;
export const SAV_248_V4_GIT_LEDGER_BRANCH =
  "meelni-ledger/sav-248-authorized-paid-calibration.v4";
export const SAV_248_V4_GIT_LEDGER_REF =
  `refs/heads/${SAV_248_V4_GIT_LEDGER_BRANCH}` as const;
export const SAV_248_V4_GIT_LEDGER_API_REF =
  `heads/${SAV_248_V4_GIT_LEDGER_BRANCH}` as const;
export const SAV_248_V4_EMPTY_TREE_OID =
  "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
export const SAV_248_V4_GENESIS_DATE = "2026-07-18T19:10:00.000Z";
export const SAV_248_V4_GENESIS_COMMIT_OID =
  "f93c43859d7b8ccd4990c7933ea139fdf9356a2c";
export const SAV_248_V4_IMMUTABLE_RULESET_NAME =
  "Meelni SAV-248 v4 calibration ledger immutable";
export const SAV_248_V4_ACTOR_RULESET_NAME =
  "Meelni SAV-248 v4 calibration activation actor";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_HOST = "api.github.com";
const GITHUB_API_PORT = 443;
const GITHUB_API_TIMEOUT_MS = 10_000;
const GITHUB_API_MAX_RESPONSE_BYTES = 1_048_576;
const GITHUB_USER_AGENT = "meelni-sav-248-v4-calibration-authority";
const SAV_248_V4_GITHUB_REPOSITORY_API_PATH =
  `/repos/${SAV_248_V4_GITHUB_OWNER}/${SAV_248_V4_GITHUB_REPOSITORY}` as const;
const COMMIT_IDENTITY = {
  name: "Meelni Calibration Authorization",
  email: "calibration-ledger@meelni.invalid",
} as const;

export interface PendingCalibrationSpendAuthorization {
  contractVersion: "evaluation-calibration-spend-authorization.v2";
  authorizationId: typeof SAV_248_V4_AUTHORIZATION_ID;
  runId: typeof SAV_248_V4_APPROVED_RUN_ID;
  authorizationStatus: "pending_explicit_product_owner_approval";
  authorizedOn: null;
  authorizationSource: null;
  reviewedSourceCommit: null;
  singleAggregateRun: true;
  maximumProviderCalls: 96;
  maximumPhysicalHttpAttempts: 96;
  maximumSpendUsd: 3;
  fixturePolicy: "synthetic_or_separately_approved_only";
  customerTranscriptsAllowed: false;
  productionDataAllowed: false;
  historicalAuthoritiesReusable: false;
  predecessorAuthorities: typeof SAV_248_V4_PREDECESSOR_AUTHORITIES;
}

export type CalibrationSpendAuthorization =
  | PendingCalibrationSpendAuthorization
  | ApprovedCalibrationSpendAuthorization;

export const SAV_248_V4_SPEND_AUTHORIZATION: PendingCalibrationSpendAuthorization =
  {
    contractVersion: "evaluation-calibration-spend-authorization.v2",
    authorizationId: SAV_248_V4_AUTHORIZATION_ID,
    runId: SAV_248_V4_APPROVED_RUN_ID,
    authorizationStatus: "pending_explicit_product_owner_approval",
    authorizedOn: null,
    authorizationSource: null,
    reviewedSourceCommit: null,
    singleAggregateRun: true,
    maximumProviderCalls: 96,
    maximumPhysicalHttpAttempts: 96,
    maximumSpendUsd: 3,
    fixturePolicy: "synthetic_or_separately_approved_only",
    customerTranscriptsAllowed: false,
    productionDataAllowed: false,
    historicalAuthoritiesReusable: false,
    predecessorAuthorities: SAV_248_V4_PREDECESSOR_AUTHORITIES,
  };

export const SAV_248_V4_REBASED_PLAN_WORST_CASE_NANO_USD = 2_247_265_000;
export const SAV_248_V4_REBASED_PLAN_HASH =
  "4ec2affcbfe24d3f4a0de311fe6871ab37fb255de2cc3f29ab08e561f25483da";
export const SAV_248_V4_REBASED_PLAN_PROPOSED_AT = "2026-07-23T05:13:31.000Z";

export interface CalibrationActivatedPlanCall {
  callKey: string;
  inputTokenCeiling: number;
  outputTokenCeiling: 2_000;
  worstCaseNanoUsd: number;
}

export interface CalibrationRunSpendPlan {
  runId: typeof SAV_248_V4_APPROVED_RUN_ID;
  authorizationId: string;
  authorizationHash: string;
  plannedCalls: number;
  plannedWorstCaseNanoUsd: number;
  calls: CalibrationActivatedPlanCall[];
  planHash: string;
}

export interface CalibrationActivatedPlan extends CalibrationRunSpendPlan {
  contractVersion: "evaluation-calibration-activated-plan.v2";
  candidateArtifactHash: string;
  corpusHash: string;
  approvalHash: string;
  goldSetVersion: typeof EVALUATION_GOLD_SET_VERSION;
  adjudicationVersion: typeof EVALUATION_ADJUDICATION_VERSION;
  model: typeof CALIBRATION_PRICING_CONTRACT.model;
  endpoint: typeof CALIBRATION_PRICING_CONTRACT.endpoint;
  serviceTier: typeof CALIBRATION_PRICING_CONTRACT.serviceTier;
  pricingHash: string;
  promptVersion: typeof FEEDBACK_PROMPT_VERSION;
  promptHash: string;
  responseFormatVersion: typeof FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION;
  responseFormatHash: string;
  requestPolicyVersion: typeof FEEDBACK_CALIBRATION_REQUEST_POLICY_VERSION;
  requestPolicyHash: string;
  reviewedSourceCommit: string | null;
  repetitions: 2;
}

export function buildSAV248V4PlanProposal(adjudicationApproval: unknown) {
  const plan = buildCalibrationActivatedPlan({
    authorization: SAV_248_V4_SPEND_AUTHORIZATION,
    adjudicationApproval,
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 2,
    now: new Date(SAV_248_V4_REBASED_PLAN_PROPOSED_AT),
  });
  if (
    plan.plannedCalls !== 64 ||
    plan.plannedWorstCaseNanoUsd !==
      SAV_248_V4_REBASED_PLAN_WORST_CASE_NANO_USD ||
    plan.planHash !== SAV_248_V4_REBASED_PLAN_HASH
  ) {
    throw new Error("sav_248_v4_plan_acceptance_mismatch");
  }
  return {
    contractVersion: "evaluation-calibration-plan-proposal.v1" as const,
    decision: "pending_explicit_product_owner_approval" as const,
    decisionSource: null,
    humanReviewerIdentity: null,
    proposedAt: SAV_248_V4_REBASED_PLAN_PROPOSED_AT,
    acceptanceBasis:
      "fresh_v4_authorization_and_exact_source_commit_still_required" as const,
    authorization: {
      authorizationId: SAV_248_V4_SPEND_AUTHORIZATION.authorizationId,
      runId: SAV_248_V4_SPEND_AUTHORIZATION.runId,
      authorizationStatus: SAV_248_V4_SPEND_AUTHORIZATION.authorizationStatus,
      authorizedOn: SAV_248_V4_SPEND_AUTHORIZATION.authorizedOn,
      authorizationSource: SAV_248_V4_SPEND_AUTHORIZATION.authorizationSource,
      reviewedSourceCommit: SAV_248_V4_SPEND_AUTHORIZATION.reviewedSourceCommit,
      maximumProviderCalls: SAV_248_V4_SPEND_AUTHORIZATION.maximumProviderCalls,
      maximumPhysicalHttpAttempts:
        SAV_248_V4_SPEND_AUTHORIZATION.maximumPhysicalHttpAttempts,
      maximumSpendUsd: SAV_248_V4_SPEND_AUTHORIZATION.maximumSpendUsd,
      authorizationChanged: true as const,
      historicalAuthoritiesReusable:
        SAV_248_V4_SPEND_AUTHORIZATION.historicalAuthoritiesReusable,
      predecessorAuthorities: SAV_248_V4_PREDECESSOR_AUTHORITIES,
    },
    proposedPlan: {
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
      promptVersion: plan.promptVersion,
      promptHash: plan.promptHash,
      responseFormatVersion: plan.responseFormatVersion,
      responseFormatHash: plan.responseFormatHash,
      requestPolicyVersion: plan.requestPolicyVersion,
      requestPolicyHash: plan.requestPolicyHash,
      reviewedSourceCommit: plan.reviewedSourceCommit,
    },
    unchangedControls: {
      model: true,
      fixtures: true,
      maximumCalls: true,
      maximumSpend: true,
      semanticApproval: true,
    },
    authorityScope: {
      freshSpendAuthorizationCaptured: false,
      providerCallsExecuted: false,
      ledgerActivated: false,
      launchAuthorized: false,
    },
  };
}

export interface ActivateCalibrationRunOptions {
  authorization: unknown;
  ownerAuthorization?: VerifiedCalibrationOwnerAuthorization;
  adjudicationApproval: unknown;
  model: string;
  repetitions: number;
  now?: Date;
  activationId?: string;
}

export interface ResumeDelegatedCalibrationRunOptions {
  delegatedAuthorization: VerifiedDelegatedAgentAuthorization;
  model: string;
  repetitions: number;
  now?: Date;
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
  getRefIfPresent(): GitHubRef | null | Promise<GitHubRef | null>;
  getRef(): GitHubRef | Promise<GitHubRef>;
  getCommit(sha: string): GitHubCommit | Promise<GitHubCommit>;
  createCommit(input: {
    message: string;
    treeSha: string;
    parents: string[];
    date: string;
  }): GitHubCommit | Promise<GitHubCommit>;
  createRef(input: {
    ref: typeof SAV_248_V4_GIT_LEDGER_REF;
    sha: string;
  }): GitHubRef | Promise<GitHubRef>;
  updateRef(input: {
    sha: string;
    force: false;
  }): GitHubRef | Promise<GitHubRef>;
}

export class ActivatedCalibrationRunAuthority
  implements CalibrationSpendPersistence
{
  readonly durable = true as const;
  readonly runId = SAV_248_V4_APPROVED_RUN_ID;
  readonly authorizationId: string;
  readonly authorizationHash: string;
  readonly planHash: string;
  readonly plannedCalls: number;
  readonly plannedWorstCaseNanoUsd: number;
  private active = true;
  private spend = createEmptyCalibrationSpendState();
  private readonly callsByKey: Map<string, CalibrationActivatedPlanCall>;

  constructor(
    readonly activationCommit: string,
    readonly plan: CalibrationRunSpendPlan,
    private readonly github: CalibrationGitHubCasClient
  ) {
    this.authorizationId = plan.authorizationId;
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
    if (current.ref !== SAV_248_V4_GIT_LEDGER_REF) {
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
  if (input.repetitions !== 2) {
    throw new Error("calibration_git_activation_repetitions_mismatch");
  }
  validateCalibrationPricingFreshness(input.now);

  const scoredCases = evaluationCalibrationCases.filter(
    ({ expectedCompletionState }) =>
      expectedCompletionState === "full" ||
      expectedCompletionState === "partial"
  );
  const calls = buildCalibrationActivatedPlanCalls(input.repetitions);
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
  const promptHash = sha256(
    stableJson({
      system: EVALUATION_SYSTEM_PROMPT,
      cases: scoredCases.map((fixture) => ({
        id: fixture.id,
        prompt: getEvaluationPrompt(
          fixture.roundType,
          projectEvaluationTranscriptAliases(fixture.transcript).transcript,
          fixture.expectedCompletionState as "full" | "partial"
        ),
      })),
    })
  );
  const responseFormatHash = getFeedbackProviderResponseFormatContractHash();
  const requestPolicyHash = getFeedbackCalibrationRequestPolicyHash();
  const approvalHash = sha256(
    stableJson({
      ...approval,
      decisions: [...approval.decisions].sort((left, right) =>
        left.caseId.localeCompare(right.caseId)
      ),
    })
  );
  const withoutHash = {
    contractVersion: "evaluation-calibration-activated-plan.v2" as const,
    runId: SAV_248_V4_APPROVED_RUN_ID as typeof SAV_248_V4_APPROVED_RUN_ID,
    authorizationId: authorization.authorizationId,
    authorizationHash,
    ...adjudicationHashes,
    approvalHash,
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    model: CALIBRATION_PRICING_CONTRACT.model,
    endpoint: CALIBRATION_PRICING_CONTRACT.endpoint,
    serviceTier: CALIBRATION_PRICING_CONTRACT.serviceTier,
    pricingHash,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    promptHash,
    responseFormatVersion: FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION,
    responseFormatHash,
    requestPolicyVersion: FEEDBACK_CALIBRATION_REQUEST_POLICY_VERSION,
    requestPolicyHash,
    reviewedSourceCommit: authorization.reviewedSourceCommit,
    repetitions: 2 as const,
    plannedCalls: calls.length,
    plannedWorstCaseNanoUsd,
    calls,
  };
  return { ...withoutHash, planHash: sha256(stableJson(withoutHash)) };
}

function buildCalibrationActivatedPlanCalls(
  repetitions: number
): CalibrationActivatedPlanCall[] {
  const scoredCases = evaluationCalibrationCases.filter(
    ({ expectedCompletionState }) =>
      expectedCompletionState === "full" ||
      expectedCompletionState === "partial"
  );
  return scoredCases.flatMap<CalibrationActivatedPlanCall>((fixture) => {
    const inputTokenCeiling = structuredCalibrationInputTokenCeiling(fixture);
    const worstCaseNanoUsd = calculateWorstCaseNanoUsd(
      inputTokenCeiling,
      CALIBRATION_MAX_COMPLETION_TOKENS,
      CALIBRATION_PRICING_CONTRACT
    );
    return Array.from({ length: repetitions }, (_, runIndex) => ({
      callKey: `${fixture.id}:${runIndex}`,
      inputTokenCeiling,
      outputTokenCeiling: CALIBRATION_MAX_COMPLETION_TOKENS,
      worstCaseNanoUsd,
    }));
  });
}

export async function activateCalibrationRun(
  options: ActivateCalibrationRunOptions,
  credentials: { githubToken: string }
): Promise<ActivatedCalibrationRunAuthority> {
  assertCalibrationSpendAuthorizationExecutable(options.authorization);
  if (
    !options.ownerAuthorization ||
    options.ownerAuthorization.authorization !== options.authorization
  ) {
    throw new Error("calibration_owner_authorization_handoff_invalid");
  }
  return await activateCalibrationRunWithClient(
    options,
    createProductionGitHubCasClient(credentials.githubToken),
    "executable"
  );
}

export async function resumeDelegatedActivatedCalibrationRun(
  options: ResumeDelegatedCalibrationRunOptions,
  credentials: { githubToken: string }
): Promise<ActivatedCalibrationRunAuthority> {
  return await resumeDelegatedActivatedCalibrationRunWithClient(
    options,
    createProductionGitHubCasClient(credentials.githubToken)
  );
}

export function assertCalibrationSpendAuthorizationExecutable(
  value: unknown
): asserts value is ApprovedCalibrationSpendAuthorization {
  const authorization = parseCalibrationSpendAuthorization(value);
  if (authorization.authorizationStatus !== "approved_by_human_product_owner") {
    throw new Error(
      "calibration_v4_requires_fresh_exact_product_owner_authorization"
    );
  }
  assertCalibrationOwnerAuthorizationWasVerified(authorization);
}

async function activateCalibrationRunWithClient(
  options: ActivateCalibrationRunOptions,
  github: CalibrationGitHubCasClient,
  mode: "executable" | "pending_proposal_test_simulation"
): Promise<ActivatedCalibrationRunAuthority> {
  if (mode === "executable") {
    assertCalibrationSpendAuthorizationExecutable(options.authorization);
  }
  const now = options.now ?? new Date();
  const plan = buildCalibrationActivatedPlan({
    authorization: options.authorization,
    adjudicationApproval: options.adjudicationApproval,
    model: options.model,
    repetitions: options.repetitions,
    now,
  });
  if (mode === "executable") {
    if (
      !options.ownerAuthorization ||
      options.ownerAuthorization.authorization !== options.authorization
    ) {
      throw new Error("calibration_owner_authorization_handoff_invalid");
    }
    assertCalibrationOwnerAuthorizationMatchesPlan(
      options.ownerAuthorization,
      plan,
      now
    );
  }
  const authorization = parseCalibrationSpendAuthorization(
    options.authorization
  );
  const genesis = buildCalibrationAuthorizationGenesis(plan, authorization);
  await assertCanonicalGitHubAuthority(github);

  let currentRef = await github.getRefIfPresent();
  if (!currentRef) {
    const seeded = await github.createCommit({
      message: genesis.message,
      treeSha: SAV_248_V4_EMPTY_TREE_OID,
      parents: [],
      date: genesis.date,
    });
    assertPinnedGenesisCommit(seeded, genesis);
    await assertCanonicalGitHubAuthority(github);
    try {
      currentRef = await github.createRef({
        ref: SAV_248_V4_GIT_LEDGER_REF,
        sha: genesis.oid,
      });
    } catch (error) {
      throw new Error("calibration_git_authorization_seed_lost_concurrent_cas", {
        cause: error,
      });
    }
    await assertCanonicalGitHubAuthority(github);
  }
  if (currentRef.ref !== SAV_248_V4_GIT_LEDGER_REF) {
    throw new Error("calibration_github_ledger_ref_invalid");
  }
  if (currentRef.sha !== genesis.oid) {
    const current = await github.getCommit(currentRef.sha);
    if (isValidActivationCommit(current, plan, genesis)) {
      throw new Error("calibration_authorized_run_is_already_activated");
    }
    throw new Error("calibration_git_authorization_genesis_oid_mismatch");
  }
  assertPinnedGenesisCommit(await github.getCommit(currentRef.sha), genesis);

  const activationId = options.activationId ?? randomUUID();
  const activationMessage = stableJson({
    contractVersion: "evaluation-calibration-git-activation.v1",
    runId: SAV_248_V4_APPROVED_RUN_ID,
    authorizationId: plan.authorizationId,
    authorizationHash: plan.authorizationHash,
    planHash: plan.planHash,
    activationId,
  });
  const activationDate = new Date(
    Math.floor(now.getTime() / 1_000) * 1_000
  ).toISOString();
  const activation = await github.createCommit({
    message: activationMessage,
    treeSha: SAV_248_V4_EMPTY_TREE_OID,
    parents: [genesis.oid],
    date: activationDate,
  });
  if (
    !isValidActivationCommit(activation, plan, genesis) ||
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
    durable.ref !== SAV_248_V4_GIT_LEDGER_REF ||
    durable.sha !== activation.sha
  ) {
    throw new Error("calibration_git_activation_not_durable");
  }
  return new ActivatedCalibrationRunAuthority(activation.sha, plan, github);
}

async function resumeDelegatedActivatedCalibrationRunWithClient(
  options: ResumeDelegatedCalibrationRunOptions,
  github: CalibrationGitHubCasClient
): Promise<ActivatedCalibrationRunAuthority> {
  assertDelegatedCalibrationRetryAuthority(options);
  await assertCanonicalGitHubAuthority(github);
  const currentRef = await github.getRef();
  if (currentRef.ref !== SAV_248_V4_GIT_LEDGER_REF) {
    throw new Error("calibration_github_ledger_ref_invalid");
  }
  const activation = await github.getCommit(currentRef.sha);
  const activationMessage = parseCalibrationActivationMessage(activation);
  const authorization = await github.getCommit(activation.parents[0]!);
  const authorizationMessage =
    parseCalibrationAuthorizationLedgerMessage(authorization);
  if (
    activationMessage.runId !== authorizationMessage.runId ||
    activationMessage.authorizationId !== authorizationMessage.authorizationId ||
    activationMessage.authorizationHash !==
      authorizationMessage.authorizationHash ||
    activationMessage.planHash !== authorizationMessage.planHash
  ) {
    throw new Error("calibration_delegated_resume_ledger_mismatch");
  }
  const calls = buildCalibrationActivatedPlanCalls(options.repetitions);
  const plannedWorstCaseNanoUsd = calls.reduce(
    (total, call) => total + call.worstCaseNanoUsd,
    0
  );
  if (
    authorizationMessage.plannedCalls !== calls.length ||
    authorizationMessage.plannedWorstCaseNanoUsd !== plannedWorstCaseNanoUsd ||
    calls.length > options.delegatedAuthorization.maximumProviderCalls ||
    calls.length > options.delegatedAuthorization.maximumPhysicalHttpAttempts ||
    plannedWorstCaseNanoUsd >
      options.delegatedAuthorization.maximumSpendNanoUsd
  ) {
    throw new Error("calibration_delegated_resume_plan_exceeds_authority");
  }
  await assertCanonicalGitHubAuthority(github);
  return new ActivatedCalibrationRunAuthority(
    activation.sha,
    {
      runId: SAV_248_V4_APPROVED_RUN_ID,
      authorizationId: activationMessage.authorizationId,
      authorizationHash: activationMessage.authorizationHash,
      planHash: activationMessage.planHash,
      plannedCalls: authorizationMessage.plannedCalls,
      plannedWorstCaseNanoUsd: authorizationMessage.plannedWorstCaseNanoUsd,
      calls,
    },
    github
  );
}

export const calibrationRunLedgerTestSeam = {
  simulatePendingProposalActivationWithClient: (
    options: ActivateCalibrationRunOptions,
    github: CalibrationGitHubCasClient
  ) =>
    activateCalibrationRunWithClient(
      options,
      github,
      "pending_proposal_test_simulation"
    ),
  activateVerifiedOwnerAuthorizationWithClient: (
    options: ActivateCalibrationRunOptions,
    github: CalibrationGitHubCasClient
  ) => {
    assertCalibrationSpendAuthorizationExecutable(options.authorization);
    return activateCalibrationRunWithClient(options, github, "executable");
  },
  resumeDelegatedActivatedCalibrationRunWithClient:
    resumeDelegatedActivatedCalibrationRunWithClient,
  createGitHubClient: createTestGitHubCasClient,
  nodeRequestOptions: buildNodeGitHubRequestOptions,
};

export interface CalibrationAuthorizationGenesis {
  date: string;
  message: string;
  oid: string;
}

export function buildCalibrationAuthorizationGenesis(
  plan: CalibrationActivatedPlan,
  authorization: CalibrationSpendAuthorization
): CalibrationAuthorizationGenesis {
  if (
    authorization.authorizationStatus ===
    "pending_explicit_product_owner_approval"
  ) {
    return {
      date: SAV_248_V4_GENESIS_DATE,
      message: calibrationAuthorizationCommitMessage(),
      oid: SAV_248_V4_GENESIS_COMMIT_OID,
    };
  }
  const date = authorization.authorizedOn;
  const message = calibrationAuthorizationCommitMessage(plan, authorization);
  const timestamp = Math.floor(new Date(date).getTime() / 1_000);
  if (!Number.isSafeInteger(timestamp)) {
    throw new Error("calibration_git_authorization_date_invalid");
  }
  const body = [
    `tree ${SAV_248_V4_EMPTY_TREE_OID}`,
    `author ${COMMIT_IDENTITY.name} <${COMMIT_IDENTITY.email}> ${timestamp} +0000`,
    `committer ${COMMIT_IDENTITY.name} <${COMMIT_IDENTITY.email}> ${timestamp} +0000`,
    "",
    message,
  ].join("\n");
  return {
    date,
    message,
    oid: createHash("sha1")
      .update(`commit ${Buffer.byteLength(body)}\0`)
      .update(body)
      .digest("hex"),
  };
}

export function calibrationAuthorizationCommitMessage(
  plan?: CalibrationActivatedPlan,
  authorization?: CalibrationSpendAuthorization
): string {
  if (plan && authorization) {
    return stableJson({
      contractVersion: "evaluation-calibration-git-authorization.v1",
      runId: plan.runId,
      authorizationId: plan.authorizationId,
      authorizationHash: plan.authorizationHash,
      planHash: plan.planHash,
      plannedCalls: plan.plannedCalls,
      plannedWorstCaseNanoUsd: plan.plannedWorstCaseNanoUsd,
      reviewedSourceCommit: plan.reviewedSourceCommit,
      predecessorAuthorities: authorization.predecessorAuthorities,
    });
  }
  return stableJson({
    contractVersion: "evaluation-calibration-git-authorization-proposal.v1",
    runId: SAV_248_V4_APPROVED_RUN_ID,
    authorizationId: SAV_248_V4_AUTHORIZATION_ID,
    authorizationHash: sha256(stableJson(SAV_248_V4_SPEND_AUTHORIZATION)),
    planHash: SAV_248_V4_REBASED_PLAN_HASH,
    plannedCalls: 64,
    plannedWorstCaseNanoUsd: SAV_248_V4_REBASED_PLAN_WORST_CASE_NANO_USD,
    predecessorAuthorities: SAV_248_V4_PREDECESSOR_AUTHORITIES,
  });
}

export function parseCalibrationSpendAuthorization(
  value: unknown
): CalibrationSpendAuthorization {
  if (!isRecord(value)) {
    throw new Error("calibration_spend_authorization_invalid");
  }
  if (value.authorizationStatus === "pending_explicit_product_owner_approval") {
    assertExactKeys(value, Object.keys(SAV_248_V4_SPEND_AUTHORIZATION));
    for (const [key, expected] of Object.entries(
      SAV_248_V4_SPEND_AUTHORIZATION
    )) {
      if (stableJson(value[key]) !== stableJson(expected)) {
        throw new Error(`calibration_spend_authorization_${key}_mismatch`);
      }
    }
    return { ...SAV_248_V4_SPEND_AUTHORIZATION };
  }
  return parseApprovedCalibrationSpendAuthorization(value);
}

function parseApprovedCalibrationSpendAuthorization(
  value: Record<string, unknown>
): ApprovedCalibrationSpendAuthorization {
  const expectedKeys = [
    "authorizationId",
    "authorizationSource",
    "authorizationStatus",
    "authorizedOn",
    "contractVersion",
    "customerTranscriptsAllowed",
    "fixturePolicy",
    "historicalAuthoritiesReusable",
    "maximumPhysicalHttpAttempts",
    "maximumProviderCalls",
    "maximumSpendUsd",
    "ownerId",
    "ownerRole",
    "ownerSigningKeyId",
    "predecessorAuthorities",
    "productionDataAllowed",
    "reviewedSourceCommit",
    "runId",
    "singleAggregateRun",
  ];
  assertExactKeys(value, expectedKeys);
  const authorization =
    value as unknown as ApprovedCalibrationSpendAuthorization;
  if (
    authorization.contractVersion !==
      "evaluation-calibration-spend-authorization.v4" ||
    !/^sav248_v4_auth_[0-9a-f]{32}$/.test(authorization.authorizationId) ||
    authorization.runId !== SAV_248_V4_APPROVED_RUN_ID ||
    authorization.authorizationStatus !== "approved_by_human_product_owner" ||
    authorization.authorizationSource !== "external_product_owner_ed25519" ||
    !Number.isFinite(new Date(authorization.authorizedOn).getTime()) ||
    authorization.ownerId !== "saviii" ||
    authorization.ownerRole !== "human_product_owner" ||
    !/^[A-Za-z0-9._-]{1,80}$/.test(authorization.ownerSigningKeyId) ||
    !/^[0-9a-f]{40}$/.test(authorization.reviewedSourceCommit) ||
    authorization.singleAggregateRun !== true ||
    authorization.maximumProviderCalls !== 96 ||
    authorization.maximumPhysicalHttpAttempts !== 96 ||
    authorization.maximumSpendUsd !== 3 ||
    authorization.fixturePolicy !== "synthetic_or_separately_approved_only" ||
    authorization.customerTranscriptsAllowed !== false ||
    authorization.productionDataAllowed !== false ||
    authorization.historicalAuthoritiesReusable !== false ||
    stableJson(authorization.predecessorAuthorities) !==
      stableJson(SAV_248_V4_PREDECESSOR_AUTHORITIES)
  ) {
    throw new Error("calibration_spend_authorization_approved_invalid");
  }
  return authorization;
}

async function assertCanonicalGitHubAuthority(
  github: CalibrationGitHubCasClient
): Promise<void> {
  const repository = await github.getRepository();
  if (
    repository.id !== SAV_248_V4_GITHUB_REPOSITORY_ID ||
    repository.fullName !==
      `${SAV_248_V4_GITHUB_OWNER}/${SAV_248_V4_GITHUB_REPOSITORY}` ||
    repository.owner.id !== SAV_248_V4_GITHUB_OWNER_ID ||
    repository.owner.login !== SAV_248_V4_GITHUB_OWNER ||
    repository.private !== true
  ) {
    throw new Error("calibration_github_repository_identity_mismatch");
  }
  const viewer = await github.getViewer();
  if (
    viewer.id !== SAV_248_V4_GITHUB_ACTIVATION_ACTOR_ID ||
    viewer.login !== SAV_248_V4_GITHUB_ACTIVATION_ACTOR_LOGIN
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
    rulesets.filter(({ name }) => name === SAV_248_V4_IMMUTABLE_RULESET_NAME)
      .length !== 1 ||
    rulesets.filter(({ name }) => name === SAV_248_V4_ACTOR_RULESET_NAME)
      .length !== 1
  ) {
    throw new Error("calibration_github_ruleset_set_invalid");
  }
  const immutable = rulesets.find(
    ({ name }) => name === SAV_248_V4_IMMUTABLE_RULESET_NAME
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
    ({ name }) => name === SAV_248_V4_ACTOR_RULESET_NAME
  );
  if (!actor || !isExactRepositoryRuleset(actor)) {
    throw new Error("calibration_github_actor_ruleset_missing");
  }
  if (
    !hasExactStrings(actor.ruleTypes, ["creation", "update"]) ||
    actor.bypassActors.length !== 1 ||
    actor.bypassActors[0]?.actorId !== SAV_248_V4_GITHUB_ACTIVATION_ACTOR_ID ||
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
    ruleset.source ===
      `${SAV_248_V4_GITHUB_OWNER}/${SAV_248_V4_GITHUB_REPOSITORY}` &&
    ruleset.sourceType === "Repository" &&
    ruleset.target === "branch" &&
    ruleset.enforcement === "active" &&
    ruleset.includeRefs.length === 1 &&
    ruleset.includeRefs[0] === SAV_248_V4_GIT_LEDGER_REF &&
    ruleset.excludeRefs.length === 0
  );
}

function hasExactStrings(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

function assertPinnedGenesisCommit(
  commit: GitHubCommit,
  genesis: CalibrationAuthorizationGenesis
): void {
  if (
    commit.sha !== genesis.oid ||
    commit.message !== genesis.message ||
    commit.treeSha !== SAV_248_V4_EMPTY_TREE_OID ||
    commit.parents.length !== 0 ||
    !isCommitIdentity(commit.author, genesis.date) ||
    !isCommitIdentity(commit.committer, genesis.date)
  ) {
    throw new Error("calibration_git_authorization_commit_invalid");
  }
}

function isValidActivationCommit(
  commit: GitHubCommit,
  plan: CalibrationActivatedPlan,
  genesis: CalibrationAuthorizationGenesis
): boolean {
  if (
    commit.treeSha !== SAV_248_V4_EMPTY_TREE_OID ||
    commit.parents.length !== 1 ||
    commit.parents[0] !== genesis.oid ||
    !isCommitIdentity(commit.author, commit.author.date) ||
    !isCommitIdentity(commit.committer, commit.author.date)
  ) {
    return false;
  }
  try {
    const parsed = JSON.parse(commit.message) as Record<string, unknown>;
    return (
      parsed.contractVersion === "evaluation-calibration-git-activation.v1" &&
      parsed.runId === SAV_248_V4_APPROVED_RUN_ID &&
      parsed.authorizationId === plan.authorizationId &&
      parsed.authorizationHash === plan.authorizationHash &&
      parsed.planHash === plan.planHash &&
      typeof parsed.activationId === "string" &&
      parsed.activationId.length > 0
    );
  } catch {
    return false;
  }
}

function assertDelegatedCalibrationRetryAuthority(
  options: ResumeDelegatedCalibrationRunOptions
): void {
  if (
    options.delegatedAuthorization.actionClass !==
    "synthetic_calibration_retry"
  ) {
    throw new Error("calibration_delegated_resume_action_invalid");
  }
  if (options.model !== CALIBRATION_PRICING_CONTRACT.model) {
    throw new Error("calibration_git_activation_model_mismatch");
  }
  if (options.repetitions !== 2) {
    throw new Error("calibration_git_activation_repetitions_mismatch");
  }
  validateCalibrationPricingFreshness(options.now ?? new Date());
}

interface CalibrationActivationLedgerMessage {
  contractVersion: "evaluation-calibration-git-activation.v1";
  runId: typeof SAV_248_V4_APPROVED_RUN_ID;
  authorizationId: string;
  authorizationHash: string;
  planHash: string;
  activationId: string;
}

interface CalibrationAuthorizationLedgerMessage {
  contractVersion: "evaluation-calibration-git-authorization.v1";
  runId: typeof SAV_248_V4_APPROVED_RUN_ID;
  authorizationId: string;
  authorizationHash: string;
  planHash: string;
  plannedCalls: number;
  plannedWorstCaseNanoUsd: number;
  reviewedSourceCommit: string;
  predecessorAuthorities: typeof SAV_248_V4_PREDECESSOR_AUTHORITIES;
}

function parseCalibrationActivationMessage(
  commit: GitHubCommit
): CalibrationActivationLedgerMessage {
  if (
    commit.treeSha !== SAV_248_V4_EMPTY_TREE_OID ||
    commit.parents.length !== 1 ||
    !isCommitIdentity(commit.author, commit.author.date) ||
    !isCommitIdentity(commit.committer, commit.author.date)
  ) {
    throw new Error("calibration_delegated_resume_activation_commit_invalid");
  }
  const parsed = parseLedgerMessage(
    commit.message,
    "calibration_delegated_resume_activation_message_invalid"
  );
  assertExactKeys(parsed, [
    "activationId",
    "authorizationHash",
    "authorizationId",
    "contractVersion",
    "planHash",
    "runId",
  ]);
  if (
    parsed.contractVersion !== "evaluation-calibration-git-activation.v1" ||
    parsed.runId !== SAV_248_V4_APPROVED_RUN_ID ||
    typeof parsed.authorizationId !== "string" ||
    typeof parsed.authorizationHash !== "string" ||
    typeof parsed.planHash !== "string" ||
    typeof parsed.activationId !== "string" ||
    parsed.authorizationId.length === 0 ||
    !/^[0-9a-f]{64}$/.test(parsed.authorizationHash) ||
    !/^[0-9a-f]{64}$/.test(parsed.planHash) ||
    parsed.activationId.length === 0
  ) {
    throw new Error("calibration_delegated_resume_activation_message_invalid");
  }
  return parsed as unknown as CalibrationActivationLedgerMessage;
}

function parseCalibrationAuthorizationLedgerMessage(
  commit: GitHubCommit
): CalibrationAuthorizationLedgerMessage {
  if (
    commit.treeSha !== SAV_248_V4_EMPTY_TREE_OID ||
    commit.parents.length !== 0 ||
    !isCommitIdentity(commit.author, commit.author.date) ||
    !isCommitIdentity(commit.committer, commit.author.date)
  ) {
    throw new Error("calibration_delegated_resume_authorization_commit_invalid");
  }
  const parsed = parseLedgerMessage(
    commit.message,
    "calibration_delegated_resume_authorization_message_invalid"
  );
  assertExactKeys(parsed, [
    "authorizationHash",
    "authorizationId",
    "contractVersion",
    "planHash",
    "plannedCalls",
    "plannedWorstCaseNanoUsd",
    "predecessorAuthorities",
    "reviewedSourceCommit",
    "runId",
  ]);
  if (
    parsed.contractVersion !== "evaluation-calibration-git-authorization.v1" ||
    parsed.runId !== SAV_248_V4_APPROVED_RUN_ID ||
    typeof parsed.authorizationId !== "string" ||
    typeof parsed.authorizationHash !== "string" ||
    typeof parsed.planHash !== "string" ||
    !Number.isSafeInteger(parsed.plannedCalls) ||
    !Number.isSafeInteger(parsed.plannedWorstCaseNanoUsd) ||
    typeof parsed.reviewedSourceCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(parsed.reviewedSourceCommit) ||
    !/^[0-9a-f]{64}$/.test(parsed.authorizationHash) ||
    !/^[0-9a-f]{64}$/.test(parsed.planHash) ||
    stableJson(parsed.predecessorAuthorities) !==
      stableJson(SAV_248_V4_PREDECESSOR_AUTHORITIES)
  ) {
    throw new Error("calibration_delegated_resume_authorization_message_invalid");
  }
  return parsed as unknown as CalibrationAuthorizationLedgerMessage;
}

function parseLedgerMessage(
  message: string,
  code: string
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(message);
    if (!isRecord(parsed)) throw new Error(code);
    return parsed;
  } catch {
    throw new Error(code);
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
    const response = await this.api(
      "GET",
      SAV_248_V4_GITHUB_REPOSITORY_API_PATH
    );
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
      `${SAV_248_V4_GITHUB_REPOSITORY_API_PATH}/rulesets?includes_parents=true&targets=branch&per_page=100`
    );
    if (!Array.isArray(listed)) {
      throw new Error("calibration_github_rulesets_invalid");
    }
    const rulesets: GitHubRuleset[] = [];
    for (const item of listed) {
      const summary = requireRecord(item, "ruleset.summary");
      if (
        summary.name !== SAV_248_V4_IMMUTABLE_RULESET_NAME &&
        summary.name !== SAV_248_V4_ACTOR_RULESET_NAME
      ) {
        continue;
      }
      const id = requireNumber(summary.id, "ruleset.id");
      rulesets.push(
        parseGitHubRuleset(
          await this.api(
            "GET",
            `${SAV_248_V4_GITHUB_REPOSITORY_API_PATH}/rulesets/${id}?includes_parents=true`
          )
        )
      );
    }
    return rulesets;
  }

  async getEffectiveBranchRuleTypes(): Promise<string[]> {
    const branch = encodeURIComponent(SAV_248_V4_GIT_LEDGER_BRANCH);
    const response = await this.api(
      "GET",
      `${SAV_248_V4_GITHUB_REPOSITORY_API_PATH}/rules/branches/${branch}`
    );
    if (!Array.isArray(response)) {
      throw new Error("calibration_github_effective_rules_invalid");
    }
    return response.map((rule) =>
      requireString(requireRecord(rule, "effective.rule").type, "rule.type")
    );
  }

  async getRefIfPresent(): Promise<GitHubRef | null> {
    const response = await this.api(
      "GET",
      `${SAV_248_V4_GITHUB_REPOSITORY_API_PATH}/git/ref/${SAV_248_V4_GIT_LEDGER_API_REF}`,
      undefined,
      { allowNotFound: true }
    );
    if (response === null) return null;
    return parseGitHubRef(response, "ref");
  }

  async getRef(): Promise<GitHubRef> {
    const response = await this.getRefIfPresent();
    if (!response) {
      throw new Error("calibration_github_ledger_ref_missing");
    }
    return response;
  }

  async getCommit(sha: string): Promise<GitHubCommit> {
    return parseGitHubCommit(
      await this.api(
        "GET",
        `${SAV_248_V4_GITHUB_REPOSITORY_API_PATH}/git/commits/${sha}`
      )
    );
  }

  async createCommit(input: {
    message: string;
    treeSha: string;
    parents: string[];
    date: string;
  }): Promise<GitHubCommit> {
    return parseGitHubCommit(
      await this.api(
        "POST",
        `${SAV_248_V4_GITHUB_REPOSITORY_API_PATH}/git/commits`,
        {
          message: input.message,
          tree: input.treeSha,
          parents: input.parents,
          author: { ...COMMIT_IDENTITY, date: input.date },
          committer: { ...COMMIT_IDENTITY, date: input.date },
        }
      )
    );
  }

  async createRef(input: {
    ref: typeof SAV_248_V4_GIT_LEDGER_REF;
    sha: string;
  }): Promise<GitHubRef> {
    const record = requireRecord(
      await this.api(
        "POST",
        `${SAV_248_V4_GITHUB_REPOSITORY_API_PATH}/git/refs`,
        input
      ),
      "createdRef"
    );
    return parseGitHubRef(record, "createdRef");
  }

  async updateRef(input: { sha: string; force: false }): Promise<GitHubRef> {
    const record = requireRecord(
      await this.api(
        "PATCH",
        `${SAV_248_V4_GITHUB_REPOSITORY_API_PATH}/git/refs/${SAV_248_V4_GIT_LEDGER_API_REF}`,
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
    body?: unknown,
    options: { allowNotFound?: boolean } = {}
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
      if (options.allowNotFound && response.statusCode === 404) {
        return null;
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

function parseGitHubRef(value: unknown, field: string): GitHubRef {
  const record = requireRecord(value, field);
  const object = requireRecord(record.object, `${field}.object`);
  if (object.type !== "commit") {
    throw new Error("calibration_github_ledger_ref_not_commit");
  }
  return {
    ref: requireString(record.ref, `${field}.ref`),
    sha: requireOid(object.sha, `${field}.object.sha`),
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
