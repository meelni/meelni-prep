import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTION_ACTIONS } from "./production-action-authorization.mjs";
import {
  applyVercelProductionWebShadowCanaryConfig,
  parseVercelProductionWebShadowCanaryConfig,
  VERCEL_PRODUCTION_WEB_SHADOW_CANARY_CONFIG_CONTRACT,
  VERCEL_PRODUCTION_WEB_SHADOW_CANARY_MAX_BYTES,
  vercelProductionWebShadowCanaryAuthorizationInput,
} from "./vercel-production-web-shadow-canary.mjs";

const NOW = new Date("2026-08-21T05:00:00.000Z");
const WEB_CANDIDATE = "1".repeat(40);
const WORKER_CANDIDATE = "2".repeat(40);
const RUN_ID = "3".repeat(64);
const OWNER_ID = "123e4567-e89b-42d3-a456-426614174000";
const SOURCE_DEPLOYMENT = "dpl_abcdefghijklmnopqrstuvwxyz123456";

function config(overrides = {}) {
  return {
    contract: VERCEL_PRODUCTION_WEB_SHADOW_CANARY_CONFIG_CONTRACT,
    expires_at: "2026-08-21T05:45:00.000Z",
    operation: "enable",
    owner_user_id: OWNER_ID,
    run_id: RUN_ID,
    source_deployment_id: SOURCE_DEPLOYMENT,
    web_candidate_sha: WEB_CANDIDATE,
    worker_candidate_sha: WORKER_CANDIDATE,
    ...overrides,
  };
}

test("Production web canary deployment config is closed, bounded, and exact", () => {
  const parsed = parseVercelProductionWebShadowCanaryConfig(
    JSON.stringify(config()),
    { now: NOW }
  );
  assert.deepEqual(parsed, config());
  assert.equal(Object.isFrozen(parsed), true);
  const input = vercelProductionWebShadowCanaryAuthorizationInput(parsed);
  assert.equal(
    input.action,
    PRODUCTION_ACTIONS.VERCEL_PRODUCTION_WEB_SHADOW_CANARY
  );
  assert.equal(input.provider, "vercel");
  assert.match(input.configurationSha256, /^[a-f0-9]{64}$/);
  assert.match(input.targetFingerprint, /^[a-f0-9]{64}$/);
  assert.throws(
    () => vercelProductionWebShadowCanaryAuthorizationInput(config()),
    /production_web_shadow_config_invalid/
  );

  for (const candidate of [
    { ...config(), extra: true },
    { ...config(), operation: "promote" },
    { ...config(), owner_user_id: "owner" },
    { ...config(), run_id: "run" },
    { ...config(), source_deployment_id: "production" },
    { ...config(), web_candidate_sha: "main" },
    { ...config(), worker_candidate_sha: "worker" },
    { ...config(), expires_at: "2026-08-21T06:00:01.000Z" },
  ]) {
    assert.throws(
      () =>
        parseVercelProductionWebShadowCanaryConfig(JSON.stringify(candidate), {
          now: NOW,
        }),
      /production_web_shadow_config_invalid/
    );
  }

  const duplicate = JSON.stringify(config()).replace(
    `"run_id":"${RUN_ID}"`,
    `"run_id":"${RUN_ID}","run_id":"${RUN_ID}"`
  );
  for (const contents of [
    duplicate,
    "null",
    "[]",
    " ".repeat(VERCEL_PRODUCTION_WEB_SHADOW_CANARY_MAX_BYTES + 1),
  ]) {
    assert.throws(
      () => parseVercelProductionWebShadowCanaryConfig(contents, { now: NOW }),
      /production_web_shadow_config_invalid/
    );
  }
});

test("disable remains available after the canary expiry", () => {
  const parsed = parseVercelProductionWebShadowCanaryConfig(
    JSON.stringify(
      config({
        expires_at: "2026-08-21T04:00:00.000Z",
        operation: "disable",
      })
    ),
    { now: NOW }
  );
  assert.equal(parsed.operation, "disable");
});

test("one-use action is consumed before exact Vercel writes and redeploy", async () => {
  const parsed = parseVercelProductionWebShadowCanaryConfig(
    JSON.stringify(config()),
    { now: NOW }
  );
  const events = [];
  const result = await applyVercelProductionWebShadowCanaryConfig({
    config: parsed,
    authorizationPath: "/private/authorization.json",
    repoRoot: "/repo",
    now: NOW,
    consumeAuthorization: async (input) => {
      events.push({ type: "consume", input });
      return {
        authorizationId: "ora_123",
        candidateSha: WEB_CANDIDATE,
      };
    },
    resolveCandidate: () => WEB_CANDIDATE,
    runVercel: (args, options) => {
      events.push({ type: "vercel", args, options });
      if (args[0] === "inspect") {
        const id =
          args[1] === SOURCE_DEPLOYMENT
            ? SOURCE_DEPLOYMENT
            : "dpl_redeployedproduction123456";
        return {
          stdout: JSON.stringify({
            contextName: "meelni",
            id,
            name: "meelni",
            readyState: "READY",
            target: "production",
          }),
        };
      }
      if (args[0] === "redeploy") {
        return { stdout: "https://meelni-canary-meelni.vercel.app\n" };
      }
      return { stdout: "" };
    },
  });

  assert.deepEqual(result, {
    authorizationId: "ora_123",
    candidateSha: WEB_CANDIDATE,
    deploymentId: "dpl_redeployedproduction123456",
    operation: "enable",
  });
  assert.equal(events[0].type, "consume");
  const vercel = events.filter((event) => event.type === "vercel");
  assert.deepEqual(vercel[0].args, ["inspect", SOURCE_DEPLOYMENT, "--json"]);
  const writes = vercel.filter((event) => event.args[0] === "env");
  assert.equal(writes.length, 5);
  assert.equal(
    writes.every(
      (event) =>
        !event.args.includes(event.options.input.trim()) &&
        event.args.includes("--sensitive") &&
        event.args.includes("--force")
    ),
    true
  );
  assert.deepEqual(vercel.at(-2).args, [
    "redeploy",
    SOURCE_DEPLOYMENT,
    "--target",
    "production",
  ]);
});

test("candidate and source deployment mismatches fail before environment writes", async () => {
  const parsed = parseVercelProductionWebShadowCanaryConfig(
    JSON.stringify(config()),
    { now: NOW }
  );
  let providerCalls = 0;
  await assert.rejects(
    applyVercelProductionWebShadowCanaryConfig({
      config: parsed,
      authorizationPath: "/private/authorization.json",
      repoRoot: "/repo",
      now: NOW,
      consumeAuthorization: async () => ({
        authorizationId: "ora_123",
        candidateSha: "f".repeat(40),
      }),
      resolveCandidate: () => "f".repeat(40),
      runVercel: () => {
        providerCalls += 1;
        return { stdout: "" };
      },
    }),
    /production_web_shadow_web_candidate_mismatch/
  );
  assert.equal(providerCalls, 0);

  const calls = [];
  await assert.rejects(
    applyVercelProductionWebShadowCanaryConfig({
      config: parsed,
      authorizationPath: "/private/authorization.json",
      repoRoot: "/repo",
      now: NOW,
      consumeAuthorization: async () => ({
        authorizationId: "ora_123",
        candidateSha: WEB_CANDIDATE,
      }),
      resolveCandidate: () => WEB_CANDIDATE,
      runVercel: (args) => {
        calls.push(args);
        return {
          stdout: JSON.stringify({
            contextName: "other",
            id: SOURCE_DEPLOYMENT,
            name: "other",
            readyState: "READY",
            target: "production",
          }),
        };
      },
    }),
    /production_web_shadow_source_deployment_invalid/
  );
  assert.equal(calls.length, 1);
});
