import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import {
  createServer as createHttpsServer,
  request as nodeHttpsRequest,
  type RequestOptions,
} from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import test from "node:test";

import {
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  evaluationCalibrationCases,
} from "@meelni/test-fixtures";

import {
  buildDelegatedEvaluationAdjudicationApproval,
  getEvaluationAdjudicationHashes,
} from "./calibration-approval";
import {
  assertCalibrationLiveStartupState,
  CALIBRATION_LIVE_DISALLOWED_ENV,
  CALIBRATION_LIVE_RUNTIME_EXEC_ARGV,
} from "./calibration-live-startup.mjs";
import {
  CalibrationSpendGuard,
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
  SAV_198_REBASED_PLAN_HASH,
  SAV_198_REBASED_PLAN_WORST_CASE_NANO_USD,
  buildSAV198RebasedPlanAcceptance,
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
  assert.equal(
    plan.plannedWorstCaseNanoUsd,
    SAV_198_REBASED_PLAN_WORST_CASE_NANO_USD
  );
  assert.ok(plan.plannedWorstCaseNanoUsd <= CALIBRATION_MAX_SPEND_NANO_USD);
  assert.equal(plan.planHash.length, 64);
  assert.equal(plan.corpusHash.length, 64);
  assert.equal(plan.approvalHash.length, 64);
  assert.equal(plan.pricingHash.length, 64);
  assert.equal(new Set(plan.calls.map(({ callKey }) => callKey)).size, 96);
  assert.equal(deterministicGenesisOid(), SAV_198_GENESIS_COMMIT_OID);
});

test("delegated product owner accepts the exact conservative rebased plan within the existing cap", () => {
  const acceptance = buildSAV198RebasedPlanAcceptance(
    buildDelegatedEvaluationAdjudicationApproval()
  );
  assert.equal(acceptance.existingAuthorization.authorizationChanged, false);
  assert.equal(acceptance.existingAuthorization.maximumProviderCalls, 96);
  assert.equal(acceptance.existingAuthorization.maximumSpendUsd, 3);
  assert.equal(acceptance.acceptedPlan.planHash, SAV_198_REBASED_PLAN_HASH);
  assert.equal(
    acceptance.acceptedPlan.plannedWorstCaseNanoUsd,
    SAV_198_REBASED_PLAN_WORST_CASE_NANO_USD
  );
  assert.equal(acceptance.acceptedPlan.plannedWorstCaseUsd, 2.7544875);
  assert.equal(acceptance.authorityScope.providerCallsExecuted, false);
  assert.equal(acceptance.authorityScope.ledgerActivated, false);
  assert.equal(acceptance.authorityScope.launchAuthorized, false);
});

test("canonical repository and activation actor identities are immutable", async () => {
  for (const mutate of [
    (state: FakeGitHubState) => (state.repository.id += 1),
    (state: FakeGitHubState) =>
      (state.repository.fullName = "attacker/meelni-prep"),
    (state: FakeGitHubState) => (state.viewer.id += 1),
    (state: FakeGitHubState) => (state.viewer.login = "not-saviii"),
  ]) {
    const state = createCanonicalState();
    mutate(state);
    await assert.rejects(
      () => activate(new FakeGitHubClient(state)),
      /repository_identity_mismatch|activation_actor_mismatch/
    );
    assert.equal(state.refSha, SAV_198_GENESIS_COMMIT_OID);
  }
});

test("activation requires the exact deterministic pinned genesis OID and payload", async () => {
  const missingRef = createCanonicalState();
  missingRef.refSha = "";
  await assert.rejects(
    () => activate(new FakeGitHubClient(missingRef)),
    /fake_ref_missing/
  );

  const wrongOid = createCanonicalState();
  wrongOid.refSha = "1".repeat(40);
  wrongOid.commits.set(
    wrongOid.refSha,
    genesisCommit({ sha: wrongOid.refSha })
  );
  await assert.rejects(
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
    await assert.rejects(
      () => activate(new FakeGitHubClient(state)),
      /authorization_commit_invalid/
    );
  }
});

test("activation refuses absent, inactive, bypassable, or incomplete protection", async () => {
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
    await assert.rejects(
      () => activate(new FakeGitHubClient(state)),
      /ruleset|protection/
    );
    assert.equal(state.refSha, SAV_198_GENESIS_COMMIT_OID);
  }
});

test("concurrent sibling activation CAS permits exactly one winner", async () => {
  const state = createCanonicalState();
  let winner: Awaited<ReturnType<typeof activate>> | undefined;
  const first = new FakeGitHubClient(state, async () => {
    winner = await activate(new FakeGitHubClient(state), "activation-two");
  });

  await assert.rejects(
    () => activate(first, "activation-one"),
    /lost_concurrent_cas/
  );
  assert.ok(winner);
  assert.equal(state.refSha, winner.activationCommit);
  await assert.rejects(
    () => activate(new FakeGitHubClient(state), "activation-three"),
    /already_activated/
  );
  assertPayloadFreeActivation(state, winner.activationCommit);
});

test("an activated crash and local Git configuration cannot reopen authority", async () => {
  const state = createCanonicalState();
  const first = await activate(new FakeGitHubClient(state), "activation-one");
  first.release();

  await assert.rejects(
    () => activate(new FakeGitHubClient(state), "activation-two"),
    /already_activated/
  );
  assert.equal(state.refSha, first.activationCommit);
});

test("request authority fails closed when protection or activated ref changes", async () => {
  const state = createCanonicalState();
  const authority = await activate(new FakeGitHubClient(state));
  state.effectiveRuleTypes = ["deletion", "update"];
  await assert.rejects(
    () => authority.assertRequestAuthority(),
    /effective_protection_missing/
  );

  const secondState = createCanonicalState();
  const second = await activate(new FakeGitHubClient(secondState));
  secondState.refSha = SAV_198_GENESIS_COMMIT_OID;
  await assert.rejects(
    () => second.assertRequestAuthority(),
    /activation_is_not_current/
  );
});

test("direct GitHub transport ignores PATH and accepts only canonical API data", async () => {
  const requests: Array<{ path: string; authorization: string | undefined }> =
    [];
  const client = calibrationRunLedgerTestSeam.createGitHubClient(
    {
      GITHUB_TOKEN: "test-github-token",
      PATH: "/tmp/fake-gh-that-must-never-run",
    },
    {
      async request(input) {
        requests.push({
          path: input.path,
          authorization: input.headers.Authorization,
        });
        return jsonResponse({
          id: SAV_198_GITHUB_REPOSITORY_ID,
          full_name: "saviii/meelni-prep",
          owner: {
            id: SAV_198_GITHUB_ACTIVATION_ACTOR_ID,
            login: SAV_198_GITHUB_ACTIVATION_ACTOR_LOGIN,
          },
          private: true,
        });
      },
    }
  );

  assert.deepEqual(
    await client.getRepository(),
    createCanonicalState().repository
  );
  assert.deepEqual(requests, [
    {
      path: "/repos/saviii/meelni-prep",
      authorization: "Bearer test-github-token",
    },
  ]);
});

test("production HTTPS options pin GitHub, bundled roots, SNI, and no agent or DNS seam", () => {
  const options = calibrationRunLedgerTestSeam.nodeRequestOptions({
    method: "GET",
    path: "/user",
    headers: {},
    signal: new AbortController().signal,
  });

  assert.equal(options.protocol, "https:");
  assert.equal(options.hostname, "api.github.com");
  assert.equal(options.port, 443);
  assert.equal(options.servername, "api.github.com");
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.agent, false);
  assert.equal(options.lookup, undefined);
  assert.equal(typeof options.checkServerIdentity, "function");
  assert.deepEqual(options.ca, [...rootCertificates]);
});

test("a real fake TLS peer cannot bypass bundled roots, hostname checks, or redirects", async () => {
  const directory = mkdtempSync(join(tmpdir(), "meelni-calibration-tls-"));
  const keyPath = join(directory, "localhost.key");
  const certificatePath = join(directory, "localhost.crt");
  const generated = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certificatePath,
      "-subj",
      "/CN=localhost",
      "-days",
      "1",
    ],
    { encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr);
  const certificate = readFileSync(certificatePath);
  const server = createHttpsServer(
    { key: readFileSync(keyPath), cert: certificate },
    (_request, response) => {
      response.writeHead(302, { Location: "https://attacker.invalid/" });
      response.end("redirect");
    }
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  const canonical = calibrationRunLedgerTestSeam.nodeRequestOptions({
    method: "GET",
    path: "/user",
    headers: {},
    signal: new AbortController().signal,
  });
  try {
    await assert.rejects(
      () => requestLocalTls({ ...canonical, hostname: "127.0.0.1", port }),
      /self-signed certificate/
    );
    await assert.rejects(
      () =>
        requestLocalTls({
          ...canonical,
          hostname: "127.0.0.1",
          port,
          ca: certificate,
        }),
      /Hostname\/IP does not match certificate/
    );

    const client = calibrationRunLedgerTestSeam.createGitHubClient(
      { GITHUB_TOKEN: "test-github-token" },
      {
        request: ({ method, path, headers, body, signal }) =>
          requestLocalTls(
            {
              ...canonical,
              method,
              path,
              headers,
              signal,
              hostname: "127.0.0.1",
              port,
              servername: "localhost",
              ca: certificate,
            },
            body
          ),
      }
    );
    await assert.rejects(
      async () => await client.getViewer(),
      /redirect_rejected/
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    rmSync(directory, { recursive: true, force: true });
  }
});

test("GitHub config, Unix-socket, proxy, and custom TLS env fail before request", () => {
  let requests = 0;
  for (const name of CALIBRATION_LIVE_DISALLOWED_ENV) {
    assert.throws(
      () =>
        calibrationRunLedgerTestSeam.createGitHubClient(
          { GITHUB_TOKEN: "test-github-token", [name]: "unsafe" },
          {
            async request() {
              requests += 1;
              return jsonResponse({});
            },
          }
        ),
      new RegExp(`transport_env_${name}_rejected`)
    );
  }
  assert.equal(requests, 0);
});

test("startup attestation accepts only the pinned empty-argv Node runtime", () => {
  assert.doesNotThrow(() =>
    assertCalibrationLiveStartupState({
      env: { PATH: "/irrelevant" },
      execArgv: [],
      releaseName: "node",
      nodeVersion: "22.22.0",
      invocation: "bootstrap",
    })
  );
  assert.doesNotThrow(() =>
    assertCalibrationLiveStartupState({
      env: { PATH: "/irrelevant" },
      execArgv: [...CALIBRATION_LIVE_RUNTIME_EXEC_ARGV],
      releaseName: "node",
      nodeVersion: "22.22.0",
      invocation: "runtime",
    })
  );
  for (const execArgv of [
    ["--require", "/tmp/preload.cjs"],
    ["--import", "file:///tmp/preload.mjs"],
    ["--inspect=127.0.0.1:0"],
    ["--debug-port=0"],
    ["--tls-keylog=/tmp/keys"],
    ["--openssl-config=/tmp/openssl.cnf"],
    ["--prof"],
  ]) {
    assert.throws(
      () =>
        assertCalibrationLiveStartupState({
          env: {},
          execArgv,
          releaseName: "node",
          nodeVersion: "22.22.0",
          invocation: "bootstrap",
        }),
      /startup_exec_argv_rejected/
    );
  }
  assert.throws(
    () =>
      assertCalibrationLiveStartupState({
        env: {},
        execArgv: [],
        releaseName: "node",
        nodeVersion: "20.10.0",
        invocation: "bootstrap",
      }),
    /startup_runtime_rejected/
  );
  assert.throws(
    () =>
      assertCalibrationLiveStartupState({
        env: {},
        execArgv: [],
        releaseName: "node",
        nodeVersion: "22.21.1",
        invocation: "bootstrap",
      }),
    /startup_runtime_rejected/
  );
});

test("startup environment fails before any token property is read", () => {
  for (const name of CALIBRATION_LIVE_DISALLOWED_ENV) {
    let tokenReads = 0;
    const env = new Proxy<Record<string, string | undefined>>(
      { [name]: "unsafe" },
      {
        get(target, property, receiver) {
          if (property === "GITHUB_TOKEN" || property === "OPENAI_API_KEY") {
            tokenReads += 1;
          }
          return Reflect.get(target, property, receiver);
        },
      }
    );
    assert.throws(
      () =>
        assertCalibrationLiveStartupState({
          env,
          execArgv: [],
          releaseName: "node",
          nodeVersion: "22.22.0",
          invocation: "bootstrap",
        }),
      new RegExp(`startup_env_${name}_rejected`)
    );
    assert.equal(tokenReads, 0);
  }
});

test("startup attestation runs before client token reads and again before every request", async () => {
  let tokenReads = 0;
  let attestations = 0;
  let requests = 0;
  let rejected = true;
  const env = new Proxy<Record<string, string | undefined>>(
    { GITHUB_TOKEN: "test-github-token" },
    {
      get(target, property, receiver) {
        if (property === "GITHUB_TOKEN") tokenReads += 1;
        return Reflect.get(target, property, receiver);
      },
    }
  );
  const attest = () => {
    attestations += 1;
    if (rejected) throw new Error("test_startup_rejected");
  };
  assert.throws(
    () =>
      calibrationRunLedgerTestSeam.createGitHubClient(
        env,
        {
          async request() {
            requests += 1;
            return jsonResponse({});
          },
        },
        {},
        attest
      ),
    /test_startup_rejected/
  );
  assert.equal(tokenReads, 0);
  assert.equal(requests, 0);

  rejected = false;
  const client = calibrationRunLedgerTestSeam.createGitHubClient(
    env,
    {
      async request() {
        requests += 1;
        return jsonResponse({ id: 1, login: "viewer" });
      },
    },
    {},
    attest
  );
  assert.equal(tokenReads, 1);
  rejected = true;
  await assert.rejects(
    async () => await client.getViewer(),
    /test_startup_rejected/
  );
  assert.equal(requests, 0);
  assert.equal(attestations, 3);
});

test("direct GitHub transport rejects redirects, malformed and oversized bodies, and timeouts", async () => {
  const scenarios = [
    {
      expected: /redirect_rejected/,
      response: async () => textResponse("{}", 302),
    },
    {
      expected: /response_invalid/,
      response: async () => textResponse("not-json"),
    },
    {
      expected: /response_too_large/,
      response: async () => textResponse("12345"),
      maximumResponseBytes: 4,
    },
    {
      expected: /request_timed_out/,
      response: async (signal: AbortSignal) =>
        await new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("transport aborted")),
            { once: true }
          );
        }),
      timeoutMs: 5,
    },
  ];

  for (const scenario of scenarios) {
    const client = calibrationRunLedgerTestSeam.createGitHubClient(
      { GITHUB_TOKEN: "test-github-token" },
      {
        request: (input) => scenario.response(input.signal),
      },
      {
        timeoutMs: scenario.timeoutMs,
        maximumResponseBytes: scenario.maximumResponseBytes,
      }
    );
    await assert.rejects(
      async () => await client.getViewer(),
      scenario.expected
    );
  }
});

test("GitHub token never appears in transport errors", async () => {
  const token = "secret-token-must-not-leak";
  const client = calibrationRunLedgerTestSeam.createGitHubClient(
    { GITHUB_TOKEN: token },
    {
      async request() {
        throw new Error(`upstream exposed ${token}`);
      },
    }
  );
  assert.equal(JSON.stringify(client).includes(token), false);

  const error = await Promise.resolve(client.getViewer()).catch(
    (cause: unknown) => cause
  );
  assert.ok(error instanceof Error);
  assert.equal(error.message, "calibration_github_api_request_failed");
  assert.equal(JSON.stringify(error).includes(token), false);
});

test("direct HTTPS activation preserves CAS behavior without exposing its token in reports", async () => {
  const token = "report-secret-token-must-not-leak";
  const state = createCanonicalState();
  const client = calibrationRunLedgerTestSeam.createGitHubClient(
    { GITHUB_TOKEN: token },
    fakeGitHubApiTransport(state)
  );
  const authority = await activate(client, "direct-https-activation");
  const guard = new CalibrationSpendGuard(
    CALIBRATION_PRICING_CONTRACT.model,
    NOW,
    authority
  );

  assert.equal(state.refSha, authority.activationCommit);
  assert.equal(JSON.stringify(guard.report()).includes(token), false);
  authority.release();
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
  private beforeUpdate: (() => void | Promise<void>) | undefined;

  constructor(
    private readonly state: FakeGitHubState,
    beforeUpdate?: () => void | Promise<void>
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

  async updateRef(input: { sha: string; force: false }): Promise<GitHubRef> {
    assert.equal(input.force, false);
    const hook = this.beforeUpdate;
    this.beforeUpdate = undefined;
    await hook?.();
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
    contractVersion: "evaluation-adjudication-approval.v2",
    ...getEvaluationAdjudicationHashes(),
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    reviewer: { identity: "test-reviewer", role: "pm_reviewer" },
    reviewBasis: {
      candidateManifestVersion: "evaluation-adjudication-review.v2",
      independentExactHashReview: true,
    },
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

function jsonResponse(value: unknown, statusCode = 200) {
  return textResponse(JSON.stringify(value), statusCode);
}

function textResponse(value: string, statusCode = 200) {
  return {
    statusCode,
    body: {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(value);
      },
    },
  };
}

function requestLocalTls(
  options: RequestOptions,
  body?: string
): Promise<{ statusCode: number; body: AsyncIterable<Uint8Array> }> {
  return new Promise((resolve, reject) => {
    const request = nodeHttpsRequest(options, (response) => {
      resolve({
        statusCode: response.statusCode ?? 0,
        body: response,
      });
    });
    request.once("error", reject);
    request.end(body);
  });
}

function fakeGitHubApiTransport(state: FakeGitHubState) {
  const client = new FakeGitHubClient(state);
  return {
    async request(input: {
      method: string;
      path: string;
      body: string | undefined;
    }) {
      if (
        input.method === "GET" &&
        input.path === "/repos/saviii/meelni-prep"
      ) {
        return jsonResponse({
          id: state.repository.id,
          full_name: state.repository.fullName,
          owner: state.repository.owner,
          private: state.repository.private,
        });
      }
      if (input.method === "GET" && input.path === "/user") {
        return jsonResponse(state.viewer);
      }
      if (input.method === "GET" && input.path.includes("/rulesets?")) {
        return jsonResponse(
          state.rulesets.map((ruleset, index) => ({
            id: index + 1,
            name: ruleset.name,
          }))
        );
      }
      const rulesetMatch = input.path.match(/\/rulesets\/(\d+)\?/);
      if (input.method === "GET" && rulesetMatch) {
        const ruleset = state.rulesets[Number(rulesetMatch[1]) - 1]!;
        return jsonResponse({
          name: ruleset.name,
          source: ruleset.source,
          source_type: ruleset.sourceType,
          target: ruleset.target,
          enforcement: ruleset.enforcement,
          bypass_actors: ruleset.bypassActors.map((actor) => ({
            actor_id: actor.actorId,
            actor_type: actor.actorType,
            bypass_mode: actor.bypassMode,
          })),
          conditions: {
            ref_name: {
              include: ruleset.includeRefs,
              exclude: ruleset.excludeRefs,
            },
          },
          rules: ruleset.ruleTypes.map((type) => ({ type })),
        });
      }
      if (input.method === "GET" && input.path.includes("/rules/branches/")) {
        return jsonResponse(state.effectiveRuleTypes.map((type) => ({ type })));
      }
      if (input.method === "GET" && input.path.includes("/git/ref/")) {
        const ref = await client.getRef();
        return jsonResponse({
          ref: ref.ref,
          object: { type: "commit", sha: ref.sha },
        });
      }
      const commitMatch = input.path.match(/\/git\/commits\/([0-9a-f]{40})$/);
      if (input.method === "GET" && commitMatch) {
        return jsonResponse(
          gitHubCommitResponse(await client.getCommit(commitMatch[1]!))
        );
      }
      if (input.method === "POST" && input.path.endsWith("/git/commits")) {
        const body = JSON.parse(input.body ?? "null") as {
          message: string;
          tree: string;
          parents: string[];
          author: { date: string };
        };
        const commit = await client.createCommit({
          message: body.message,
          treeSha: body.tree,
          parents: body.parents,
          date: body.author.date,
        });
        return jsonResponse(gitHubCommitResponse(commit), 201);
      }
      if (input.method === "PATCH" && input.path.includes("/git/refs/")) {
        const body = JSON.parse(input.body ?? "null") as {
          sha: string;
          force: false;
        };
        const ref = await client.updateRef(body);
        return jsonResponse({ ref: ref.ref, object: { sha: ref.sha } });
      }
      throw new Error("unexpected fake GitHub API request");
    },
  };
}

function gitHubCommitResponse(commit: GitHubCommit) {
  return {
    sha: commit.sha,
    message: commit.message,
    tree: { sha: commit.treeSha },
    parents: commit.parents.map((sha) => ({ sha })),
    author: commit.author,
    committer: commit.committer,
  };
}
