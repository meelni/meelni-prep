import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
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

import { evaluationCalibrationCases } from "@meelni/test-fixtures";

import {
  DELEGATED_AGENT_AUTHORIZATION_CONTRACT,
  verifyDelegatedAgentAuthorization,
} from "@/lib/operations/delegated-agent-authorization";
import { buildDelegatedEvaluationAdjudicationApproval } from "./calibration-approval";
import {
  CALIBRATION_OWNER_APPROVAL_DECISION,
  CALIBRATION_OWNER_AUTHORIZATION_CONTRACT,
  CALIBRATION_OWNER_ID,
  CALIBRATION_OWNER_KEY_REGISTRY_CONTRACT,
  CALIBRATION_OWNER_ROLE,
  SAV_248_V23_PREDECESSOR_AUTHORITIES,
  calibrationOwnerAuthorizationSignatureMessage,
  verifyCalibrationOwnerAuthorization,
  type ApprovedCalibrationSpendAuthorization,
  type CalibrationOwnerAuthorizationPayload,
} from "./calibration-owner-authorization";
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
  SAV_248_V23_ACTOR_RULESET_NAME,
  SAV_248_V23_APPROVED_RUN_ID,
  SAV_248_V23_EMPTY_TREE_OID,
  SAV_248_V23_GENESIS_COMMIT_OID,
  SAV_248_V23_GENESIS_DATE,
  SAV_248_V23_GITHUB_ACTIVATION_ACTOR_ID,
  SAV_248_V23_GITHUB_ACTIVATION_ACTOR_LOGIN,
  SAV_248_V23_GITHUB_OWNER,
  SAV_248_V23_GITHUB_OWNER_ID,
  SAV_248_V23_GITHUB_REPOSITORY,
  SAV_248_V23_GITHUB_REPOSITORY_ID,
  SAV_248_V23_GIT_LEDGER_REF,
  SAV_248_V23_IMMUTABLE_RULESET_NAME,
  SAV_248_V23_REBASED_PLAN_PROPOSED_AT,
  SAV_248_V23_SPEND_AUTHORIZATION,
  SAV_248_V23_REBASED_PLAN_HASH,
  SAV_248_V23_REBASED_PLAN_WORST_CASE_NANO_USD,
  activateCalibrationRun,
  buildCalibrationAuthorizationGenesis,
  buildSAV248V23PlanProposal,
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

const NOW = new Date(SAV_248_V23_REBASED_PLAN_PROPOSED_AT);

test("authorization pre-reserves one exact approved aggregate plan", () => {
  assert.deepEqual(
    parseCalibrationSpendAuthorization(SAV_248_V23_SPEND_AUTHORIZATION),
    SAV_248_V23_SPEND_AUTHORIZATION
  );
  assert.throws(
    () =>
      parseCalibrationSpendAuthorization({
        ...SAV_248_V23_SPEND_AUTHORIZATION,
        runId: "mint-another-budget",
      }),
    /runId_mismatch/
  );

  const plan = buildCalibrationActivatedPlan({
    authorization: SAV_248_V23_SPEND_AUTHORIZATION,
    adjudicationApproval: approvalFixture(),
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 2,
    now: NOW,
  });
  assert.equal(plan.runId, SAV_248_V23_APPROVED_RUN_ID);
  assert.equal(plan.plannedCalls, 64);
  assert.equal(plan.calls.length, 64);
  assert.equal(
    plan.plannedWorstCaseNanoUsd,
    SAV_248_V23_REBASED_PLAN_WORST_CASE_NANO_USD
  );
  assert.ok(plan.plannedWorstCaseNanoUsd <= CALIBRATION_MAX_SPEND_NANO_USD);
  assert.equal(plan.planHash.length, 64);
  assert.equal(plan.corpusHash.length, 64);
  assert.equal(plan.approvalHash.length, 64);
  assert.equal(plan.pricingHash.length, 64);
  assert.equal(new Set(plan.calls.map(({ callKey }) => callKey)).size, 64);
  assert.equal(deterministicGenesisOid(), SAV_248_V23_GENESIS_COMMIT_OID);
});

test("v23 plan remains a non-executable proposal until fresh exact owner approval", async () => {
  const proposal = buildSAV248V23PlanProposal(
    buildDelegatedEvaluationAdjudicationApproval()
  );
  assert.equal(proposal.authorization.authorizationChanged, true);
  assert.equal(proposal.authorization.maximumProviderCalls, 96);
  assert.equal(proposal.authorization.maximumSpendUsd, 3);
  assert.equal(proposal.decision, "pending_explicit_product_owner_approval");
  assert.equal(proposal.authorityScope.freshSpendAuthorizationCaptured, false);
  assert.equal(proposal.proposedPlan.reviewedSourceCommit, null);
  assert.equal(proposal.proposedPlan.planHash, SAV_248_V23_REBASED_PLAN_HASH);
  assert.equal(
    proposal.proposedPlan.plannedWorstCaseNanoUsd,
    SAV_248_V23_REBASED_PLAN_WORST_CASE_NANO_USD
  );
  assert.equal(proposal.proposedPlan.plannedWorstCaseUsd, 2.958625);
  assert.equal(proposal.authorityScope.providerCallsExecuted, false);
  assert.equal(proposal.authorityScope.ledgerActivated, false);
  assert.equal(proposal.authorityScope.launchAuthorized, false);
  const authorizationProposal = JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "docs/evidence/sav-248-v23-paid-run-authorization-proposal.json"
      ),
      "utf8"
    )
  );
  assert.deepEqual(
    authorizationProposal.authorization,
    proposal.authorization
  );
  assert.deepEqual(authorizationProposal.proposedPlan, proposal.proposedPlan);
  assert.deepEqual(
    JSON.parse(
      readFileSync(
        join(process.cwd(), "docs/evidence/sav-248-v23-plan-proposal.json"),
        "utf8"
      )
    ),
    proposal
  );
  await assert.rejects(
    () =>
      activateCalibrationRun(activationOptions("must-not-contact-github"), {
        githubToken: "must-not-be-used",
      }),
    /requires_fresh_exact_product_owner_authorization/
  );
});

test("a verified owner handoff activates only the exact signed plan", async () => {
  const ownerAuthorization = buildVerifiedOwnerAuthorization();
  const activationNow = new Date(NOW.getTime() + 524);
  const options: ActivateCalibrationRunOptions = {
    ownerAuthorization,
    authorization: ownerAuthorization.authorization,
    adjudicationApproval: approvalFixture(),
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 2,
    now: activationNow,
    activationId: "verified-owner-activation",
  };
  const plan = buildCalibrationActivatedPlan({
    authorization: ownerAuthorization.authorization,
    adjudicationApproval: options.adjudicationApproval,
    model: options.model,
    repetitions: options.repetitions,
    now: activationNow,
  });
  const genesis = buildCalibrationAuthorizationGenesis(
    plan,
    ownerAuthorization.authorization
  );
  const state = createCanonicalState(genesis);

  const authority =
    await calibrationRunLedgerTestSeam.activateVerifiedOwnerAuthorizationWithClient(
      options,
      new FakeGitHubClient(state)
    );
  assert.equal(authority.planHash, plan.planHash);
  assert.equal(authority.authorizationId, plan.authorizationId);
  assert.equal(state.refSha, authority.activationCommit);
  assert.equal(
    state.commits.get(authority.activationCommit)?.author.date,
    NOW.toISOString()
  );

  await assert.rejects(
    () =>
      calibrationRunLedgerTestSeam.activateVerifiedOwnerAuthorizationWithClient(
        {
          ...options,
          adjudicationApproval: {
            ...approvalFixture(),
            reviewedAt: "2026-07-18T23:59:59.000Z",
          },
        },
        new FakeGitHubClient(createCanonicalState(genesis))
      ),
    /plan_mismatch/
  );
  assert.throws(
    () =>
      calibrationRunLedgerTestSeam.activateVerifiedOwnerAuthorizationWithClient(
        {
          ...options,
          authorization: { ...ownerAuthorization.authorization },
        },
        new FakeGitHubClient(createCanonicalState(genesis))
      ),
    /provenance_unverified/
  );
});

test("delegated retry resumes only an already owner-activated ledger plan", async () => {
  const ownerAuthorization = buildVerifiedOwnerAuthorization();
  const activationNow = new Date(NOW.getTime() + 524);
  const options: ActivateCalibrationRunOptions = {
    ownerAuthorization,
    authorization: ownerAuthorization.authorization,
    adjudicationApproval: approvalFixture(),
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 2,
    now: activationNow,
    activationId: "verified-owner-activation",
  };
  const plan = buildCalibrationActivatedPlan({
    authorization: ownerAuthorization.authorization,
    adjudicationApproval: options.adjudicationApproval,
    model: options.model,
    repetitions: options.repetitions,
    now: activationNow,
  });
  const state = createCanonicalState(
    buildCalibrationAuthorizationGenesis(plan, ownerAuthorization.authorization)
  );
  const ownerActivated =
    await calibrationRunLedgerTestSeam.activateVerifiedOwnerAuthorizationWithClient(
      options,
      new FakeGitHubClient(state)
    );
  ownerActivated.release();

  const resumed =
    await calibrationRunLedgerTestSeam.resumeDelegatedActivatedCalibrationRunWithClient(
      {
        delegatedAuthorization: delegatedCalibrationRetryAuthorization(),
        model: CALIBRATION_PRICING_CONTRACT.model,
        repetitions: 2,
        now: activationNow,
      },
      new FakeGitHubClient(state)
    );

  assert.equal(resumed.activationCommit, ownerActivated.activationCommit);
  assert.equal(resumed.authorizationId, ownerActivated.authorizationId);
  assert.equal(resumed.planHash, ownerActivated.planHash);
  const firstCall = resumed.plan.calls[0]!;
  assert.doesNotThrow(() => resumed.assertReservationAuthorized(firstCall));
  assert.throws(
    () =>
      resumed.assertReservationAuthorized({
        ...firstCall,
        callKey: "forged-call",
      }),
    /not_in_activated_plan/
  );
});

test("delegated retry cannot activate, broaden caps, or resume malformed ledgers", async () => {
  const ownerAuthorization = buildVerifiedOwnerAuthorization();
  const activationNow = new Date(NOW.getTime() + 524);
  const plan = buildCalibrationActivatedPlan({
    authorization: ownerAuthorization.authorization,
    adjudicationApproval: approvalFixture(),
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 2,
    now: activationNow,
  });
  const state = createCanonicalState(
    buildCalibrationAuthorizationGenesis(plan, ownerAuthorization.authorization)
  );
  await calibrationRunLedgerTestSeam.activateVerifiedOwnerAuthorizationWithClient(
    {
      ownerAuthorization,
      authorization: ownerAuthorization.authorization,
      adjudicationApproval: approvalFixture(),
      model: CALIBRATION_PRICING_CONTRACT.model,
      repetitions: 2,
      now: activationNow,
      activationId: "verified-owner-activation",
    },
    new FakeGitHubClient(state)
  );

  await assert.rejects(
    () =>
      calibrationRunLedgerTestSeam.resumeDelegatedActivatedCalibrationRunWithClient(
        {
          delegatedAuthorization: delegatedCalibrationRetryAuthorization({
            actionClass: "repo_only_guardrail_repair",
          }),
          model: CALIBRATION_PRICING_CONTRACT.model,
          repetitions: 2,
          now: activationNow,
        },
        new FakeGitHubClient(state)
      ),
    /action_invalid/
  );
  await assert.rejects(
    () =>
      calibrationRunLedgerTestSeam.resumeDelegatedActivatedCalibrationRunWithClient(
        {
          delegatedAuthorization: delegatedCalibrationRetryAuthorization({
            maximumProviderCalls: 63,
          }),
          model: CALIBRATION_PRICING_CONTRACT.model,
          repetitions: 2,
          now: activationNow,
        },
        new FakeGitHubClient(state)
      ),
    /exceeds_authority/
  );

  const malformedState = structuredCloneState(state);
  const activation = malformedState.commits.get(malformedState.refSha!)!;
  const authorization = malformedState.commits.get(activation.parents[0]!)!;
  authorization.message = JSON.stringify({
    ...JSON.parse(authorization.message),
    planHash: "0".repeat(64),
  });
  await assert.rejects(
    () =>
      calibrationRunLedgerTestSeam.resumeDelegatedActivatedCalibrationRunWithClient(
        {
          delegatedAuthorization: delegatedCalibrationRetryAuthorization(),
          model: CALIBRATION_PRICING_CONTRACT.model,
          repetitions: 2,
          now: activationNow,
        },
        new FakeGitHubClient(malformedState)
      ),
    /ledger_mismatch/
  );
});

test("a verified owner handoff seeds an absent genesis ledger ref before activation", async () => {
  const ownerAuthorization = buildVerifiedOwnerAuthorization();
  const activationNow = new Date(NOW.getTime() + 524);
  const options: ActivateCalibrationRunOptions = {
    ownerAuthorization,
    authorization: ownerAuthorization.authorization,
    adjudicationApproval: approvalFixture(),
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 2,
    now: activationNow,
    activationId: "verified-owner-activation",
  };
  const plan = buildCalibrationActivatedPlan({
    authorization: ownerAuthorization.authorization,
    adjudicationApproval: options.adjudicationApproval,
    model: options.model,
    repetitions: options.repetitions,
    now: activationNow,
  });
  const genesis = buildCalibrationAuthorizationGenesis(
    plan,
    ownerAuthorization.authorization
  );
  const state = createUnseededCanonicalState(genesis);

  const authority =
    await calibrationRunLedgerTestSeam.activateVerifiedOwnerAuthorizationWithClient(
      options,
      new FakeGitHubClient(state)
    );

  assertPinnedFakeGenesis(state, genesis);
  assert.equal(state.refSha, authority.activationCommit);
  assert.deepEqual(state.commits.get(authority.activationCommit)?.parents, [
    genesis.oid,
  ]);
});

test("canonical repository and activation actor identities are immutable", async () => {
  for (const mutate of [
    (state: FakeGitHubState) => (state.repository.id += 1),
    (state: FakeGitHubState) =>
      (state.repository.fullName = "attacker/meelni-prep"),
    (state: FakeGitHubState) => (state.repository.owner.id += 1),
    (state: FakeGitHubState) => (state.repository.owner.login = "not-meelni"),
    (state: FakeGitHubState) => (state.viewer.id += 1),
    (state: FakeGitHubState) => (state.viewer.login = "not-saviii"),
  ]) {
    const state = createCanonicalState();
    mutate(state);
    await assert.rejects(
      () => activate(new FakeGitHubClient(state)),
      /repository_identity_mismatch|activation_actor_mismatch/
    );
    assert.equal(state.refSha, SAV_248_V23_GENESIS_COMMIT_OID);
  }
});

test("activation requires the exact deterministic pinned genesis OID and payload", async () => {
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
    {
      author: {
        ...commitIdentity(),
        date: new Date(
          new Date(SAV_248_V23_GENESIS_DATE).getTime() + 1_000
        ).toISOString(),
      },
    },
  ] satisfies Array<Partial<GitHubCommit>>) {
    const state = createCanonicalState();
    state.commits.set(SAV_248_V23_GENESIS_COMMIT_OID, genesisCommit(patch));
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
        ({ name }) => name === SAV_248_V23_IMMUTABLE_RULESET_NAME
      )!.enforcement = "disabled"),
    (state) =>
      (state.rulesets.find(
        ({ name }) => name === SAV_248_V23_IMMUTABLE_RULESET_NAME
      )!.ruleTypes = ["non_fast_forward"]),
    (state) =>
      state.rulesets
        .find(({ name }) => name === SAV_248_V23_IMMUTABLE_RULESET_NAME)!
        .bypassActors.push({
          actorId: SAV_248_V23_GITHUB_ACTIVATION_ACTOR_ID,
          actorType: "User",
          bypassMode: "always",
        }),
    (state) =>
      state.rulesets
        .find(({ name }) => name === SAV_248_V23_ACTOR_RULESET_NAME)!
        .bypassActors.push({
          actorId: null,
          actorType: "OrganizationAdmin",
          bypassMode: "always",
        }),
    (state) => (state.effectiveRuleTypes = ["creation", "deletion", "update"]),
    (state) =>
      (state.rulesets.find(
        ({ name }) => name === SAV_248_V23_ACTOR_RULESET_NAME
      )!.includeRefs = ["refs/heads/not-the-ledger"]),
    (state) =>
      (state.rulesets.find(
        ({ name }) => name === SAV_248_V23_ACTOR_RULESET_NAME
      )!.ruleTypes = ["update"]),
  ];

  for (const mutate of mutations) {
    const state = createCanonicalState();
    mutate(state);
    await assert.rejects(
      () => activate(new FakeGitHubClient(state)),
      /ruleset|protection/
    );
    assert.equal(state.refSha, SAV_248_V23_GENESIS_COMMIT_OID);
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
  secondState.refSha = SAV_248_V23_GENESIS_COMMIT_OID;
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
          id: SAV_248_V23_GITHUB_REPOSITORY_ID,
          full_name: `${SAV_248_V23_GITHUB_OWNER}/${SAV_248_V23_GITHUB_REPOSITORY}`,
          owner: {
            id: SAV_248_V23_GITHUB_OWNER_ID,
            login: SAV_248_V23_GITHUB_OWNER,
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
      path: `/repos/${SAV_248_V23_GITHUB_OWNER}/${SAV_248_V23_GITHUB_REPOSITORY}`,
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
  refSha: string | null;
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

  getRefIfPresent(): GitHubRef | null {
    if (!this.state.refSha) return null;
    return { ref: SAV_248_V23_GIT_LEDGER_REF, sha: this.state.refSha };
  }

  getRef(): GitHubRef {
    const ref = this.getRefIfPresent();
    if (!ref) throw new Error("fake_ref_missing");
    return ref;
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
    const normalizedDate = new Date(
      Math.floor(new Date(input.date).getTime() / 1_000) * 1_000
    ).toISOString();
    const sha = fakeCommitSha({ ...input, date: normalizedDate });
    const commit: GitHubCommit = {
      sha,
      message: input.message,
      treeSha: input.treeSha,
      parents: [...input.parents],
      author: commitIdentity(normalizedDate),
      committer: commitIdentity(normalizedDate),
    };
    this.state.commits.set(sha, commit);
    return structuredClone(commit);
  }

  createRef(input: {
    ref: typeof SAV_248_V23_GIT_LEDGER_REF;
    sha: string;
  }): GitHubRef {
    assert.equal(input.ref, SAV_248_V23_GIT_LEDGER_REF);
    if (this.state.refSha) throw new Error("fake_ref_already_exists");
    if (!this.state.commits.has(input.sha)) {
      throw new Error("fake_ref_sha_missing");
    }
    this.state.refSha = input.sha;
    return this.getRef();
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
  return calibrationRunLedgerTestSeam.simulatePendingProposalActivationWithClient(
    activationOptions(activationId),
    client
  );
}

function activationOptions(
  activationId: string
): ActivateCalibrationRunOptions {
  return {
    authorization: SAV_248_V23_SPEND_AUTHORIZATION,
    adjudicationApproval: approvalFixture(),
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 2,
    now: NOW,
    activationId,
  };
}

function createCanonicalState(
  genesis: ReturnType<typeof buildCalibrationAuthorizationGenesis> = {
    date: SAV_248_V23_GENESIS_DATE,
    message: calibrationAuthorizationCommitMessage(),
    oid: SAV_248_V23_GENESIS_COMMIT_OID,
  }
): FakeGitHubState {
  return {
    repository: {
      id: SAV_248_V23_GITHUB_REPOSITORY_ID,
      fullName: `${SAV_248_V23_GITHUB_OWNER}/${SAV_248_V23_GITHUB_REPOSITORY}`,
      owner: {
        id: SAV_248_V23_GITHUB_OWNER_ID,
        login: SAV_248_V23_GITHUB_OWNER,
      },
      private: true,
    },
    viewer: {
      id: SAV_248_V23_GITHUB_ACTIVATION_ACTOR_ID,
      login: SAV_248_V23_GITHUB_ACTIVATION_ACTOR_LOGIN,
    },
    rulesets: canonicalRulesets(),
    effectiveRuleTypes: ["creation", "deletion", "non_fast_forward", "update"],
    refSha: genesis.oid,
    commits: new Map([
      [
        genesis.oid,
        genesisCommit({
          sha: genesis.oid,
          message: genesis.message,
          author: commitIdentity(genesis.date),
          committer: commitIdentity(genesis.date),
        }),
      ],
    ]),
  };
}

function createUnseededCanonicalState(
  genesis: ReturnType<typeof buildCalibrationAuthorizationGenesis>
): FakeGitHubState {
  const state = createCanonicalState(genesis);
  state.refSha = null;
  state.commits.delete(genesis.oid);
  return state;
}

function canonicalRulesets(): GitHubRuleset[] {
  const base = {
    source: `${SAV_248_V23_GITHUB_OWNER}/${SAV_248_V23_GITHUB_REPOSITORY}`,
    sourceType: "Repository",
    target: "branch",
    enforcement: "active",
    includeRefs: [SAV_248_V23_GIT_LEDGER_REF],
    excludeRefs: [],
  };
  return [
    {
      ...base,
      name: SAV_248_V23_IMMUTABLE_RULESET_NAME,
      bypassActors: [],
      ruleTypes: ["deletion", "non_fast_forward"],
    },
    {
      ...base,
      name: SAV_248_V23_ACTOR_RULESET_NAME,
      bypassActors: [
        {
          actorId: SAV_248_V23_GITHUB_ACTIVATION_ACTOR_ID,
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
    sha: SAV_248_V23_GENESIS_COMMIT_OID,
    message: calibrationAuthorizationCommitMessage(),
    treeSha: SAV_248_V23_EMPTY_TREE_OID,
    parents: [],
    author: commitIdentity(SAV_248_V23_GENESIS_DATE),
    committer: commitIdentity(SAV_248_V23_GENESIS_DATE),
    ...patch,
  };
}

function fakeCommitSha(input: {
  message: string;
  treeSha: string;
  parents: string[];
  date: string;
}): string {
  const timestamp = Math.floor(new Date(input.date).getTime() / 1_000);
  const body = [
    `tree ${input.treeSha}`,
    ...input.parents.map((parent) => `parent ${parent}`),
    `author Meelni Calibration Authorization <calibration-ledger@meelni.invalid> ${timestamp} +0000`,
    `committer Meelni Calibration Authorization <calibration-ledger@meelni.invalid> ${timestamp} +0000`,
    "",
    input.message,
  ].join("\n");
  return createHash("sha1")
    .update(`commit ${Buffer.byteLength(body)}\0`)
    .update(body)
    .digest("hex");
}

function commitIdentity(date = SAV_248_V23_GENESIS_DATE) {
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
  assert.equal(commit.treeSha, SAV_248_V23_EMPTY_TREE_OID);
  assert.deepEqual(commit.parents, [SAV_248_V23_GENESIS_COMMIT_OID]);
  assert.equal(
    commit.message.includes(evaluationCalibrationCases[0].transcript[0].text),
    false
  );
  assert.equal(commit.message.includes("OPENAI_API_KEY"), false);
}

function assertPinnedFakeGenesis(
  state: FakeGitHubState,
  genesis: ReturnType<typeof buildCalibrationAuthorizationGenesis>
): void {
  const commit = state.commits.get(genesis.oid);
  assert.ok(commit);
  assert.equal(commit.sha, genesis.oid);
  assert.equal(commit.message, genesis.message);
  assert.equal(commit.treeSha, SAV_248_V23_EMPTY_TREE_OID);
  assert.deepEqual(commit.parents, []);
  assert.deepEqual(commit.author, commitIdentity(genesis.date));
  assert.deepEqual(commit.committer, commitIdentity(genesis.date));
}

function approvalFixture() {
  return buildDelegatedEvaluationAdjudicationApproval();
}

function delegatedCalibrationRetryAuthorization(
  patch: Record<string, unknown> = {}
) {
  return verifyDelegatedAgentAuthorization({
    artifact: {
      contract: DELEGATED_AGENT_AUTHORIZATION_CONTRACT,
      payload: {
        authorizationId:
          "sav303_delegated_agent_1234567890abcdef1234567890abcdef",
        authorizedBy: "human_product_owner_chat_delegation",
        authorizedVia: "codex_thread",
        delegatedTo: "codex",
        actionClass: "synthetic_calibration_retry",
        scope:
          "Resume already activated SAV-198 calibration after zero-cost provider-auth failure",
        reviewedSourcePolicy: "merged_repo_only_guardrail_repairs_allowed",
        maximumProviderCalls: 64,
        maximumPhysicalHttpAttempts: 64,
        maximumSpendNanoUsd: SAV_248_V23_REBASED_PLAN_WORST_CASE_NANO_USD,
        customerTranscriptsAllowed: false,
        productionDataAllowed: false,
        launchDecision: null,
        issuedAt: NOW.toISOString(),
        expiresAt: new Date(NOW.getTime() + 4 * 60 * 60 * 1_000).toISOString(),
        ...patch,
      },
    },
    now: NOW,
  });
}

function structuredCloneState(state: FakeGitHubState): FakeGitHubState {
  return {
    repository: structuredClone(state.repository),
    viewer: structuredClone(state.viewer),
    rulesets: structuredClone(state.rulesets),
    effectiveRuleTypes: [...state.effectiveRuleTypes],
    refSha: state.refSha,
    commits: new Map(
      [...state.commits.entries()].map(([sha, commit]) => [
        sha,
        structuredClone(commit),
      ])
    ),
  };
}

function buildVerifiedOwnerAuthorization() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const keyId = "owner-calibration-test";
  const authorizedOn = NOW.toISOString();
  const authorization: ApprovedCalibrationSpendAuthorization = {
    contractVersion: "evaluation-calibration-spend-authorization.v23",
    authorizationId: "sav248_v23_auth_0123456789abcdef0123456789abcdef",
    runId: SAV_248_V23_APPROVED_RUN_ID,
    authorizationStatus: "approved_by_human_product_owner",
    authorizedOn,
    authorizationSource: "external_product_owner_ed25519",
    ownerId: CALIBRATION_OWNER_ID,
    ownerRole: CALIBRATION_OWNER_ROLE,
    ownerSigningKeyId: keyId,
    reviewedSourceCommit: "b".repeat(40),
    singleAggregateRun: true,
    maximumProviderCalls: 96,
    maximumPhysicalHttpAttempts: 96,
    maximumSpendUsd: 3,
    fixturePolicy: "synthetic_or_separately_approved_only",
    customerTranscriptsAllowed: false,
    productionDataAllowed: false,
    historicalAuthoritiesReusable: false,
    predecessorAuthorities: SAV_248_V23_PREDECESSOR_AUTHORITIES,
  };
  const plan = buildCalibrationActivatedPlan({
    authorization,
    adjudicationApproval: approvalFixture(),
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 2,
    now: NOW,
  });
  const payload: CalibrationOwnerAuthorizationPayload = {
    authorizationId: authorization.authorizationId,
    runId: SAV_248_V23_APPROVED_RUN_ID,
    ownerId: CALIBRATION_OWNER_ID,
    ownerRole: CALIBRATION_OWNER_ROLE,
    approvalDecision: CALIBRATION_OWNER_APPROVAL_DECISION,
    ownerLaunchDecision: null,
    signingKeyId: keyId,
    reviewedSourceCommit: authorization.reviewedSourceCommit,
    planHash: plan.planHash,
    plannedProviderCalls: plan.plannedCalls,
    plannedPhysicalHttpAttempts: plan.plannedCalls,
    plannedWorstCaseNanoUsd: plan.plannedWorstCaseNanoUsd,
    maximumProviderCalls: 96,
    maximumPhysicalHttpAttempts: 96,
    maximumSpendNanoUsd: 3_000_000_000,
    singleAggregateRun: true,
    fixturePolicy: "synthetic_or_separately_approved_only",
    customerTranscriptsAllowed: false,
    productionDataAllowed: false,
    historicalAuthoritiesReusable: false,
    predecessorAuthorities: SAV_248_V23_PREDECESSOR_AUTHORITIES,
    issuedAt: authorizedOn,
    expiresAt: new Date(NOW.getTime() + 15 * 60 * 1_000).toISOString(),
  };
  return verifyCalibrationOwnerAuthorization({
    artifact: {
      contract: CALIBRATION_OWNER_AUTHORIZATION_CONTRACT,
      payload,
      signature: {
        algorithm: "ed25519",
        keyId,
        value: sign(
          null,
          calibrationOwnerAuthorizationSignatureMessage(payload),
          privateKey
        ).toString("base64"),
      },
    },
    keyRegistry: {
      contract: CALIBRATION_OWNER_KEY_REGISTRY_CONTRACT,
      ownerId: CALIBRATION_OWNER_ID,
      keys: [
        {
          algorithm: "ed25519",
          keyId,
          status: "active",
          notBefore: new Date(NOW.getTime() - 60_000).toISOString(),
          notAfter: new Date(NOW.getTime() + 60 * 60 * 1_000).toISOString(),
          publicKeyPem: publicKey
            .export({ type: "spki", format: "pem" })
            .toString(),
        },
      ],
    },
    now: NOW,
  });
}

function deterministicGenesisOid(): string {
  const timestamp = Math.floor(
    new Date(SAV_248_V23_GENESIS_DATE).getTime() / 1_000
  );
  const body = [
    `tree ${SAV_248_V23_EMPTY_TREE_OID}`,
    `author Meelni Calibration Authorization <calibration-ledger@meelni.invalid> ${timestamp} +0000`,
    `committer Meelni Calibration Authorization <calibration-ledger@meelni.invalid> ${timestamp} +0000`,
    "",
    calibrationAuthorizationCommitMessage(),
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
        input.path ===
          `/repos/${SAV_248_V23_GITHUB_OWNER}/${SAV_248_V23_GITHUB_REPOSITORY}`
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
        const ref = await client.getRefIfPresent();
        if (!ref) return jsonResponse({ message: "Not Found" }, 404);
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
      if (input.method === "POST" && input.path.endsWith("/git/refs")) {
        const body = JSON.parse(input.body ?? "null") as {
          ref: typeof SAV_248_V23_GIT_LEDGER_REF;
          sha: string;
        };
        const ref = await client.createRef(body);
        return jsonResponse(
          { ref: ref.ref, object: { type: "commit", sha: ref.sha } },
          201
        );
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
