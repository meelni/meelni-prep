import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  evaluationCalibrationCases,
} from "@meelni/test-fixtures";

import { getEvaluationAdjudicationHashes } from "./calibration-approval";
import {
  CALIBRATION_MAX_PROVIDER_CALLS,
  CALIBRATION_MAX_SPEND_NANO_USD,
  CALIBRATION_PRICING_CONTRACT,
} from "./calibration-budget";
import {
  SAV_198_ACTOR_RULESET_NAME,
  SAV_198_APPROVED_RUN_ID,
  SAV_198_EMPTY_TREE_OID,
  SAV_198_GENESIS_COMMIT_OID,
  SAV_198_GENESIS_DATE,
  SAV_198_GITHUB_ACTIVATION_ACTOR_ID,
  SAV_198_GITHUB_ACTIVATION_ACTOR_LOGIN,
  SAV_198_GITHUB_REPOSITORY_ID,
  SAV_198_GIT_LEDGER_REF,
  SAV_198_IMMUTABLE_RULESET_NAME,
  SAV_198_SPEND_AUTHORIZATION,
  buildCalibrationActivatedPlan,
  calibrationAuthorizationCommitMessage,
  calibrationRunLedgerTestSeam,
  parseCalibrationSpendAuthorization,
  type ActivateCalibrationRunOptions,
  type CalibrationGitHubCasClient,
  type GitHubCommit,
  type GitHubRef,
  type GitHubRuleset,
} from "./calibration-run-ledger";

const NOW = new Date("2026-07-12T09:00:00.000Z");

test("authorization pre-reserves one exact approved aggregate plan", () => {
  assert.deepEqual(
    parseCalibrationSpendAuthorization(SAV_198_SPEND_AUTHORIZATION),
    SAV_198_SPEND_AUTHORIZATION
  );
  assert.throws(
    () =>
      parseCalibrationSpendAuthorization({
        ...SAV_198_SPEND_AUTHORIZATION,
        runId: "mint-another-budget",
      }),
    /runId_mismatch/
  );

  const plan = buildCalibrationActivatedPlan({
    authorization: SAV_198_SPEND_AUTHORIZATION,
    adjudicationApproval: approvalFixture(),
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 3,
    now: NOW,
  });
  assert.equal(plan.runId, SAV_198_APPROVED_RUN_ID);
  assert.equal(plan.plannedCalls, 96);
  assert.equal(plan.calls.length, CALIBRATION_MAX_PROVIDER_CALLS);
  assert.equal(plan.plannedWorstCaseNanoUsd, 2_622_997_500);
  assert.ok(plan.plannedWorstCaseNanoUsd <= CALIBRATION_MAX_SPEND_NANO_USD);
  assert.equal(plan.planHash.length, 64);
  assert.equal(plan.corpusHash.length, 64);
  assert.equal(plan.approvalHash.length, 64);
  assert.equal(plan.pricingHash.length, 64);
  assert.equal(new Set(plan.calls.map(({ callKey }) => callKey)).size, 96);
  assert.equal(deterministicGenesisOid(), SAV_198_GENESIS_COMMIT_OID);
});

test("canonical repository and activation actor identities are immutable", () => {
  for (const mutate of [
    (state: FakeGitHubState) => (state.repository.id += 1),
    (state: FakeGitHubState) =>
      (state.repository.fullName = "attacker/meelni-prep"),
    (state: FakeGitHubState) => (state.viewer.id += 1),
    (state: FakeGitHubState) => (state.viewer.login = "not-saviii"),
  ]) {
    const state = createCanonicalState();
    mutate(state);
    assert.throws(
      () => activate(new FakeGitHubClient(state)),
      /repository_identity_mismatch|activation_actor_mismatch/
    );
    assert.equal(state.refSha, SAV_198_GENESIS_COMMIT_OID);
  }
});

test("activation requires the exact deterministic pinned genesis OID and payload", () => {
  const missingRef = createCanonicalState();
  missingRef.refSha = "";
  assert.throws(
    () => activate(new FakeGitHubClient(missingRef)),
    /fake_ref_missing/
  );

  const wrongOid = createCanonicalState();
  wrongOid.refSha = "1".repeat(40);
  wrongOid.commits.set(
    wrongOid.refSha,
    genesisCommit({ sha: wrongOid.refSha })
  );
  assert.throws(
    () => activate(new FakeGitHubClient(wrongOid)),
    /genesis_oid_mismatch/
  );

  for (const patch of [
    { message: "wrong authorization" },
    { treeSha: "2".repeat(40) },
    { parents: ["3".repeat(40)] },
    { author: { ...commitIdentity(), date: "2026-07-12T08:00:01Z" } },
  ] satisfies Array<Partial<GitHubCommit>>) {
    const state = createCanonicalState();
    state.commits.set(SAV_198_GENESIS_COMMIT_OID, genesisCommit(patch));
    assert.throws(
      () => activate(new FakeGitHubClient(state)),
      /authorization_commit_invalid/
    );
  }
});

test("activation refuses absent, inactive, bypassable, or incomplete protection", () => {
  const mutations: Array<(state: FakeGitHubState) => void> = [
    (state) => (state.rulesets = []),
    (state) =>
      (state.rulesets.find(
        ({ name }) => name === SAV_198_IMMUTABLE_RULESET_NAME
      )!.enforcement = "disabled"),
    (state) =>
      (state.rulesets.find(
        ({ name }) => name === SAV_198_IMMUTABLE_RULESET_NAME
      )!.ruleTypes = ["non_fast_forward"]),
    (state) =>
      state.rulesets
        .find(({ name }) => name === SAV_198_IMMUTABLE_RULESET_NAME)!
        .bypassActors.push({
          actorId: SAV_198_GITHUB_ACTIVATION_ACTOR_ID,
          actorType: "User",
          bypassMode: "always",
        }),
    (state) =>
      state.rulesets
        .find(({ name }) => name === SAV_198_ACTOR_RULESET_NAME)!
        .bypassActors.push({
          actorId: null,
          actorType: "OrganizationAdmin",
          bypassMode: "always",
        }),
    (state) => (state.effectiveRuleTypes = ["creation", "deletion", "update"]),
    (state) =>
      (state.rulesets.find(
        ({ name }) => name === SAV_198_ACTOR_RULESET_NAME
      )!.includeRefs = ["refs/heads/not-the-ledger"]),
    (state) =>
      (state.rulesets.find(
        ({ name }) => name === SAV_198_ACTOR_RULESET_NAME
      )!.ruleTypes = ["update"]),
  ];

  for (const mutate of mutations) {
    const state = createCanonicalState();
    mutate(state);
    assert.throws(
      () => activate(new FakeGitHubClient(state)),
      /ruleset|protection/
    );
    assert.equal(state.refSha, SAV_198_GENESIS_COMMIT_OID);
  }
});

test("concurrent sibling activation CAS permits exactly one winner", () => {
  const state = createCanonicalState();
  let winner: ReturnType<typeof activate> | undefined;
  const first = new FakeGitHubClient(state, () => {
    winner = activate(new FakeGitHubClient(state), "activation-two");
  });

  assert.throws(() => activate(first, "activation-one"), /lost_concurrent_cas/);
  assert.ok(winner);
  assert.equal(state.refSha, winner.activationCommit);
  assert.throws(
    () => activate(new FakeGitHubClient(state), "activation-three"),
    /already_activated/
  );
  assertPayloadFreeActivation(state, winner.activationCommit);
});

test("an activated crash and local Git configuration cannot reopen authority", () => {
  const state = createCanonicalState();
  const first = activate(new FakeGitHubClient(state), "activation-one");
  first.release();

  assert.throws(
    () => activate(new FakeGitHubClient(state), "activation-two"),
    /already_activated/
  );
  assert.equal(state.refSha, first.activationCommit);
});

test("request authority fails closed when protection or activated ref changes", () => {
  const state = createCanonicalState();
  const authority = activate(new FakeGitHubClient(state));
  state.effectiveRuleTypes = ["deletion", "update"];
  assert.throws(
    () => authority.assertRequestAuthority(),
    /effective_protection_missing/
  );

  const secondState = createCanonicalState();
  const second = activate(new FakeGitHubClient(secondState));
  secondState.refSha = SAV_198_GENESIS_COMMIT_OID;
  assert.throws(
    () => second.assertRequestAuthority(),
    /activation_is_not_current/
  );
});

interface FakeGitHubState {
  repository: {
    id: number;
    fullName: string;
    owner: { id: number; login: string };
    private: boolean;
  };
  viewer: { id: number; login: string };
  rulesets: GitHubRuleset[];
  effectiveRuleTypes: string[];
  refSha: string;
  commits: Map<string, GitHubCommit>;
}

class FakeGitHubClient implements CalibrationGitHubCasClient {
  private beforeUpdate: (() => void) | undefined;

  constructor(
    private readonly state: FakeGitHubState,
    beforeUpdate?: () => void
  ) {
    this.beforeUpdate = beforeUpdate;
  }

  getRepository() {
    return structuredClone(this.state.repository);
  }

  getViewer() {
    return { ...this.state.viewer };
  }

  getRulesets() {
    return structuredClone(this.state.rulesets);
  }

  getEffectiveBranchRuleTypes() {
    return [...this.state.effectiveRuleTypes];
  }

  getRef(): GitHubRef {
    if (!this.state.refSha) throw new Error("fake_ref_missing");
    return { ref: SAV_198_GIT_LEDGER_REF, sha: this.state.refSha };
  }

  getCommit(sha: string): GitHubCommit {
    const commit = this.state.commits.get(sha);
    if (!commit) throw new Error("fake_commit_missing");
    return structuredClone(commit);
  }

  createCommit(input: {
    message: string;
    treeSha: string;
    parents: string[];
    date: string;
  }): GitHubCommit {
    const sha = createHash("sha1").update(JSON.stringify(input)).digest("hex");
    const commit: GitHubCommit = {
      sha,
      message: input.message,
      treeSha: input.treeSha,
      parents: [...input.parents],
      author: commitIdentity(input.date),
      committer: commitIdentity(input.date),
    };
    this.state.commits.set(sha, commit);
    return structuredClone(commit);
  }

  updateRef(input: { sha: string; force: false }): GitHubRef {
    assert.equal(input.force, false);
    const hook = this.beforeUpdate;
    this.beforeUpdate = undefined;
    hook?.();
    const commit = this.state.commits.get(input.sha);
    if (!commit || commit.parents[0] !== this.state.refSha) {
      throw new Error("fake_non_fast_forward");
    }
    this.state.refSha = input.sha;
    return this.getRef();
  }
}

function activate(
  client: CalibrationGitHubCasClient,
  activationId = "activation-test"
) {
  return calibrationRunLedgerTestSeam.activateWithClient(
    activationOptions(activationId),
    client
  );
}

function activationOptions(
  activationId: string
): ActivateCalibrationRunOptions {
  return {
    authorization: SAV_198_SPEND_AUTHORIZATION,
    adjudicationApproval: approvalFixture(),
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 3,
    now: NOW,
    activationId,
  };
}

function createCanonicalState(): FakeGitHubState {
  return {
    repository: {
      id: SAV_198_GITHUB_REPOSITORY_ID,
      fullName: "saviii/meelni-prep",
      owner: {
        id: SAV_198_GITHUB_ACTIVATION_ACTOR_ID,
        login: SAV_198_GITHUB_ACTIVATION_ACTOR_LOGIN,
      },
      private: true,
    },
    viewer: {
      id: SAV_198_GITHUB_ACTIVATION_ACTOR_ID,
      login: SAV_198_GITHUB_ACTIVATION_ACTOR_LOGIN,
    },
    rulesets: canonicalRulesets(),
    effectiveRuleTypes: ["creation", "deletion", "non_fast_forward", "update"],
    refSha: SAV_198_GENESIS_COMMIT_OID,
    commits: new Map([[SAV_198_GENESIS_COMMIT_OID, genesisCommit()]]),
  };
}

function canonicalRulesets(): GitHubRuleset[] {
  const base = {
    source: "saviii/meelni-prep",
    sourceType: "Repository",
    target: "branch",
    enforcement: "active",
    includeRefs: [SAV_198_GIT_LEDGER_REF],
    excludeRefs: [],
  };
  return [
    {
      ...base,
      name: SAV_198_IMMUTABLE_RULESET_NAME,
      bypassActors: [],
      ruleTypes: ["deletion", "non_fast_forward"],
    },
    {
      ...base,
      name: SAV_198_ACTOR_RULESET_NAME,
      bypassActors: [
        {
          actorId: SAV_198_GITHUB_ACTIVATION_ACTOR_ID,
          actorType: "User",
          bypassMode: "always",
        },
      ],
      ruleTypes: ["creation", "update"],
    },
  ];
}

function genesisCommit(patch: Partial<GitHubCommit> = {}): GitHubCommit {
  return {
    sha: SAV_198_GENESIS_COMMIT_OID,
    message: calibrationAuthorizationCommitMessage(),
    treeSha: SAV_198_EMPTY_TREE_OID,
    parents: [],
    author: commitIdentity(SAV_198_GENESIS_DATE),
    committer: commitIdentity(SAV_198_GENESIS_DATE),
    ...patch,
  };
}

function commitIdentity(date = SAV_198_GENESIS_DATE) {
  return {
    name: "Meelni Calibration Authorization",
    email: "calibration-ledger@meelni.invalid",
    date,
  };
}

function assertPayloadFreeActivation(
  state: FakeGitHubState,
  activationCommit: string
): void {
  const commit = state.commits.get(activationCommit)!;
  assert.equal(commit.treeSha, SAV_198_EMPTY_TREE_OID);
  assert.deepEqual(commit.parents, [SAV_198_GENESIS_COMMIT_OID]);
  assert.equal(
    commit.message.includes(evaluationCalibrationCases[0].transcript[0].text),
    false
  );
  assert.equal(commit.message.includes("OPENAI_API_KEY"), false);
}

function approvalFixture() {
  return {
    contractVersion: "evaluation-adjudication-approval.v1",
    ...getEvaluationAdjudicationHashes(),
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    reviewer: { identity: "test-reviewer", role: "pm_reviewer" },
    reviewedAt: NOW.toISOString(),
    decisions: evaluationCalibrationCases
      .filter(({ expectedQuality }) => expectedQuality !== null)
      .map(({ id }) => ({ caseId: id, decision: "approved" })),
  };
}

function deterministicGenesisOid(): string {
  const timestamp = Math.floor(
    new Date(SAV_198_GENESIS_DATE).getTime() / 1_000
  );
  const body = [
    `tree ${SAV_198_EMPTY_TREE_OID}`,
    `author Meelni Calibration Authorization <calibration-ledger@meelni.invalid> ${timestamp} +0000`,
    `committer Meelni Calibration Authorization <calibration-ledger@meelni.invalid> ${timestamp} +0000`,
    "",
    calibrationAuthorizationCommitMessage(),
    "",
  ].join("\n");
  return createHash("sha1")
    .update(`commit ${Buffer.byteLength(body)}\0`)
    .update(body)
    .digest("hex");
}
