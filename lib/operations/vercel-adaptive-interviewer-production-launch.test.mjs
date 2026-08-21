import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTION_ACTIONS } from "./production-action-authorization.mjs";
import {
  applyVercelAdaptiveProductionLaunch,
  parseVercelAdaptiveProductionLaunchConfig,
  vercelAdaptiveProductionLaunchAuthorizationInput,
  VERCEL_ADAPTIVE_PRODUCTION_LAUNCH_CONFIG,
} from "./vercel-adaptive-interviewer-production-launch.mjs";

const NOW = new Date("2026-08-21T21:00:00.000Z");
const SHA = "a".repeat(40);
const DEPLOYMENT = `dpl_${"A".repeat(20)}`;

test("launch config and one-use authority bind exact candidate, config, and deployment", () => {
  const config = parsed();
  const input = vercelAdaptiveProductionLaunchAuthorizationInput(config);
  assert.equal(
    input.action,
    PRODUCTION_ACTIONS.VERCEL_ADAPTIVE_INTERVIEWER_PRODUCTION_LAUNCH
  );
  assert.equal(input.provider, "vercel");
  assert.match(input.configurationSha256, /^[a-f0-9]{64}$/u);
  assert.match(input.targetFingerprint, /^[a-f0-9]{64}$/u);
});

test("guarded enable writes only the closed all-five config and redeploys exact source", async () => {
  const calls = [];
  const result = await applyVercelAdaptiveProductionLaunch({
    config: parsed(),
    authorizationPath: "/private/tmp/authorization.json",
    repoRoot: "/repo",
    now: NOW,
    resolveCandidate: () => SHA,
    consumeAuthorization: async ({ expected }) => ({
      authorizationId: "authorization-id",
      candidateSha: SHA,
      expected,
    }),
    runVercel: (args, options = {}) => {
      calls.push({ args, input: options.input });
      if (args[0] === "inspect") {
        return {
          stdout: JSON.stringify({
            id: args[1]?.startsWith("dpl_") ? args[1] : `dpl_${"B".repeat(20)}`,
            name: "meelni",
            contextName: "meelni",
            target: "production",
            readyState: "READY",
          }),
        };
      }
      if (args[0] === "redeploy") {
        return { stdout: "https://meelni-production.vercel.app\n" };
      }
      return { stdout: "" };
    },
  });
  assert.equal(result.operation, "enable");
  const writes = calls.filter(({ args }) => args[0] === "env");
  assert.equal(writes.length, 11);
  assert.ok(
    writes.some(
      ({ args, input }) =>
        args[2] === "MEELNI_ADAPTIVE_INTERVIEWER_CANDIDATE_SHA" &&
        input === `${SHA}\n`
    )
  );
  assert.equal(calls.filter(({ args }) => args[0] === "redeploy").length, 1);
});

test("malformed, expired, and drifted launch config fails closed", () => {
  assert.throws(
    () =>
      parseVercelAdaptiveProductionLaunchConfig(
        JSON.stringify({ ...raw(), configuration_sha256: "0".repeat(64) }),
        { now: NOW }
      ),
    { message: "adaptive_production_config_invalid" }
  );
  assert.throws(
    () =>
      parseVercelAdaptiveProductionLaunchConfig(
        JSON.stringify({ ...raw(), expires_at: NOW.toISOString() }),
        { now: NOW }
      ),
    { message: "adaptive_production_config_invalid" }
  );
  const duplicate = JSON.stringify(raw()).replace(
    `"operation":"enable"`,
    `"operation":"enable","operation":"disable"`
  );
  assert.throws(
    () => parseVercelAdaptiveProductionLaunchConfig(duplicate, { now: NOW }),
    { message: "adaptive_production_config_invalid" }
  );
});

function parsed() {
  return parseVercelAdaptiveProductionLaunchConfig(JSON.stringify(raw()), {
    now: NOW,
  });
}
function raw() {
  return {
    candidate_git_sha: SHA,
    configuration_sha256:
      "21743eb810fed7d64c3564aa194e2f09ab75463e3318fbdc6f33936531ef6423",
    contract: VERCEL_ADAPTIVE_PRODUCTION_LAUNCH_CONFIG,
    expires_at: "2026-08-21T21:30:00.000Z",
    operation: "enable",
    source_deployment_id: DEPLOYMENT,
  };
}
