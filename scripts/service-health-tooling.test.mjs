import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const tsx = path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs");

test("database health preflight fails closed without configuration", () => {
  const result = run("scripts/check-service-health-database.ts", {
    DATABASE_URL: "",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const receipt = JSON.parse(result.stderr);
  assert.equal(receipt.preflight, "meelni_service_health_database");
  assert.equal(receipt.code, "database_evidence_query_failed");
  assert.doesNotMatch(result.stderr, /stack|database_not_configured/i);
});

test("protected Preview CLI cannot send its bypass secret to another origin", () => {
  const secret = "preview-automation-secret";
  const result = run("scripts/check-protected-preview-service-health.ts", {
    HEALTHCHECK_URL: "https://attacker.example/api/health",
    MEELNI_HEALTHCHECK_PREVIEW_ORIGIN:
      "https://meelni-git-codex-safe-meelni.vercel.app",
    VERCEL_AUTOMATION_BYPASS_SECRET: secret,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(result.stderr).code, "health_endpoint_invalid");
  assert.doesNotMatch(result.stderr, new RegExp(secret));
});

test("rehearsal verifier requires an external private evidence file", () => {
  const result = run("scripts/verify-service-health-rehearsal.ts", {
    HEALTH_REHEARSAL_EVIDENCE_PATH: "relative/evidence.json",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    verification: "meelni_service_health_rehearsal",
    version: 1,
    status: "rejected",
    code: "rehearsal_evidence_invalid",
    release: null,
    evidenceSha256: null,
  });
});

function run(script, overrides) {
  return spawnSync(process.execPath, [tsx, path.join(process.cwd(), script)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      ...overrides,
    },
  });
}
