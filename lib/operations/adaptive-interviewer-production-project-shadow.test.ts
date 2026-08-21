import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCTION_PROJECT_SHADOW_ACTION,
  PRODUCTION_PROJECT_SHADOW_AGENT_ID,
  assertCurrentProductionProjectShadowDeployment,
  buildProductionProjectShadowRuntimeSecrets,
  consumeProductionProjectShadowCellAuthorization,
  productionProjectShadowCellAuthorizationInput,
} from "./adaptive-interviewer-production-project-shadow";

const BASE = {
  runId: "a".repeat(64),
  candidateGitSha: "b".repeat(40),
  expectedRevision: 1,
  sessionBindingSha256: "c".repeat(64),
  expiresAt: "2026-08-21T02:00:00.000Z",
  round: "product_sense",
  voiceCondition: "baseline_final_turn",
  controlPlaneUrl:
    "https://meelni-env-staging-meelni.vercel.app/api/internal/preview-shadow",
  deploymentVersion: "47knCxxJQEi4",
};

const ORDINARY_SECRETS = [
  `MEELNI_TRANSCRIPT_INGEST_SECRET=${"t".repeat(32)}`,
  "OPIK_TRACING_ENABLED=true",
  `OPIK_API_KEY=${"k".repeat(25)}`,
  "OPIK_WORKSPACE=savi-singh",
  "OPIK_PROJECT_NAME=meelni",
  "OPIK_CAPTURE_CONTENT=true",
  `OPENAI_API_KEY=${"o".repeat(25)}`,
  "",
].join("\n");

test("binds one Production-project Shadow cell to closed independent hashes", () => {
  const result = productionProjectShadowCellAuthorizationInput(BASE);

  assert.equal(result.action, PRODUCTION_PROJECT_SHADOW_ACTION);
  assert.equal(result.provider, "livekit");
  assert.match(result.configurationSha256, /^[a-f0-9]{64}$/);
  assert.match(result.targetFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(PRODUCTION_PROJECT_SHADOW_AGENT_ID, "CA_yawKG67rCMG4");
  assert.notEqual(result.configurationSha256, result.targetFingerprint);
});

test("binds the first durable cell at activation revision zero", () => {
  const firstCell = productionProjectShadowCellAuthorizationInput({
    ...BASE,
    expectedRevision: 0,
  });

  assert.match(firstCell.configurationSha256, /^[a-f0-9]{64}$/);
  assert.match(firstCell.targetFingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(
    firstCell.targetFingerprint,
    productionProjectShadowCellAuthorizationInput(BASE).targetFingerprint
  );
  assert.throws(
    () =>
      productionProjectShadowCellAuthorizationInput({
        ...BASE,
        expectedRevision: -1,
      }),
    /production_project_shadow_cell_invalid/
  );
});

test("every room intent value changes the target binding", () => {
  const baseline = productionProjectShadowCellAuthorizationInput(BASE);
  const mutations = [
    { runId: "d".repeat(64) },
    { candidateGitSha: "e".repeat(40) },
    { expectedRevision: 2 },
    { sessionBindingSha256: "f".repeat(64) },
    { expiresAt: "2026-08-21T02:00:01.000Z" },
    { round: "behavioral" },
    { voiceCondition: "barge_in_interruption" },
    { deploymentVersion: "AbCdEf123456" },
  ];
  for (const mutation of mutations) {
    const changed = productionProjectShadowCellAuthorizationInput({
      ...BASE,
      ...mutation,
    });
    assert.notEqual(changed.targetFingerprint, baseline.targetFingerprint);
    assert.equal(changed.configurationSha256, baseline.configurationSha256);
  }
  assert.throws(
    () =>
      productionProjectShadowCellAuthorizationInput({
        ...BASE,
        controlPlaneUrl:
          "https://meelni-other-meelni.vercel.app/api/internal/preview-shadow",
      }),
    /production_project_shadow_cell_invalid/
  );
});

test("rejects malformed, extra, accessor and unsafe cell inputs before hashing", () => {
  const extra = { ...BASE, extra: true };
  assert.throws(
    () => productionProjectShadowCellAuthorizationInput(extra as never),
    /production_project_shadow_cell_invalid/
  );
  const accessor = { ...BASE } as Record<string, unknown>;
  let reads = 0;
  Object.defineProperty(accessor, "runId", {
    enumerable: true,
    get() {
      reads += 1;
      return BASE.runId;
    },
  });
  assert.throws(
    () => productionProjectShadowCellAuthorizationInput(accessor as never),
    /production_project_shadow_cell_invalid/
  );
  assert.equal(reads, 0);
  assert.throws(
    () =>
      productionProjectShadowCellAuthorizationInput({
        ...BASE,
        expectedRevision: Number.MAX_SAFE_INTEGER + 1,
      }),
    /production_project_shadow_cell_invalid/
  );
  const hostile = new Proxy(BASE, {
    ownKeys() {
      throw new Error("private-proxy-error");
    },
  });
  assert.throws(
    () => productionProjectShadowCellAuthorizationInput(hostile),
    /production_project_shadow_cell_invalid/
  );
});

test("consumes room authority only through a canonical root-owned executable", async () => {
  const expected = productionProjectShadowCellAuthorizationInput(BASE);
  const authorizationId = `ora_${"1".repeat(32)}`;
  const rootOwnedExecutable = "/usr/bin/true";
  type Invocation = {
    file: string;
    args: string[];
    options: { env: NodeJS.ProcessEnv };
  };
  let invocation: Invocation | undefined;
  const receipt = await consumeProductionProjectShadowCellAuthorization({
    authorizationPath: "/private/tmp/production-room-authorization.json",
    expected,
    repoRoot: process.cwd(),
    nodePath: rootOwnedExecutable,
    execute: ((
      file: string,
      args: string[],
      options: { env: NodeJS.ProcessEnv }
    ) => {
      invocation = { file, args, options };
      return `${JSON.stringify({
        contract: "meelni.production-action-consumption-receipt.v1",
        authorizationId,
        action: PRODUCTION_PROJECT_SHADOW_ACTION,
        candidateSha: BASE.candidateGitSha,
        artifactSha256: "2".repeat(64),
      })}\n`;
    }) as never,
  });

  assert.equal(receipt.authorizationId, authorizationId);
  const call = invocation as Invocation | undefined;
  assert.ok(call);
  assert.equal(call.file, rootOwnedExecutable);
  assert.match(call.args[0], /consume-production-action-authorization\.mjs$/);
  assert.deepEqual(call.args.slice(1), [
    "--action",
    PRODUCTION_PROJECT_SHADOW_ACTION,
    "--provider",
    "livekit",
    "--configuration-sha256",
    expected.configurationSha256,
    "--target-fingerprint",
    expected.targetFingerprint,
  ]);
  const options = call.options;
  assert.equal(options.env.NODE_OPTIONS, undefined);
  assert.equal(options.env.NODE_PATH, undefined);
  assert.equal(
    options.env.MEELNI_PRODUCTION_ACTION_AUTHORIZATION,
    "/private/tmp/production-room-authorization.json"
  );
});

test("builds an exact complete Shadow secret replacement without exposing values", () => {
  const combined = buildProductionProjectShadowRuntimeSecrets({
    ordinarySecrets: ORDINARY_SECRETS,
    runId: BASE.runId,
    candidateGitSha: BASE.candidateGitSha,
    controlPlaneUrl: BASE.controlPlaneUrl,
  });
  assert.equal(combined.trimEnd().split("\n").length, 12);
  assert.match(combined, /MEELNI_PREVIEW_SHADOW_EXECUTION=enabled/);
  assert.match(
    combined,
    new RegExp(`MEELNI_PREVIEW_SHADOW_RUN_ID=${BASE.runId}`)
  );
  assert.throws(
    () =>
      buildProductionProjectShadowRuntimeSecrets({
        ordinarySecrets: ORDINARY_SECRETS.replace("OPENAI_API_KEY", "EXTRA"),
        runId: BASE.runId,
        candidateGitSha: BASE.candidateGitSha,
        controlPlaneUrl: BASE.controlPlaneUrl,
      }),
    /livekit_runtime_secrets_invalid/
  );
});

test("rechecks the current available deployment source before room admission", () => {
  type Invocation = {
    file: string;
    args: string[];
    options: { env: NodeJS.ProcessEnv };
  };
  let invocation: Invocation | undefined;
  const execute = ((
    file: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv }
  ) => {
    invocation = { file, args, options };
    return JSON.stringify({
      versions: [
        {
          version: BASE.deploymentVersion,
          current: true,
          status: "Available",
          active: true,
          attributes: { "meelni.source_sha": BASE.candidateGitSha },
        },
      ],
    });
  }) as never;
  assertCurrentProductionProjectShadowDeployment({
    credentials: {
      url: "wss://meelni-ek4vaisp.livekit.cloud",
      apiKey: "production-key",
      apiSecret: "production-secret",
    },
    expectedCandidateSha: BASE.candidateGitSha,
    expectedVersion: BASE.deploymentVersion,
    execute,
  });
  const call = invocation as Invocation | undefined;
  assert.ok(call);
  assert.equal(call.file, "/opt/homebrew/bin/lk");
  assert.deepEqual(call.args, [
    "--quiet",
    "agent",
    "versions",
    "--id",
    PRODUCTION_PROJECT_SHADOW_AGENT_ID,
    "--json",
  ]);
  assert.deepEqual(Object.keys(call.options.env).sort(), [
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "LIVEKIT_URL",
    "NODE_ENV",
  ]);

  for (const changed of [
    {
      version: "other",
      current: true,
      status: "Available",
      active: true,
      attributes: { "meelni.source_sha": BASE.candidateGitSha },
    },
    {
      version: BASE.deploymentVersion,
      current: true,
      status: "Available",
      active: true,
      attributes: { "meelni.source_sha": "f".repeat(40) },
    },
    {
      version: BASE.deploymentVersion,
      current: true,
      status: "Deploying",
      active: true,
      attributes: { "meelni.source_sha": BASE.candidateGitSha },
    },
  ]) {
    assert.throws(
      () =>
        assertCurrentProductionProjectShadowDeployment({
          credentials: {
            url: "wss://meelni-ek4vaisp.livekit.cloud",
            apiKey: "production-key",
            apiSecret: "production-secret",
          },
          expectedCandidateSha: BASE.candidateGitSha,
          expectedVersion: BASE.deploymentVersion,
          execute: (() => JSON.stringify({ versions: [changed] })) as never,
        }),
      /production_project_shadow_deployment_mismatch/
    );
  }
});
