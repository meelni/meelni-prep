import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

test("health synthetic CLI fails closed without leaking a stack", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs"),
      path.join(process.cwd(), "scripts/check-service-health.ts"),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        HEALTHCHECK_URL: "ftp://user:secret@example.test",
      },
    }
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    synthetic: "meelni_service_health",
    version: 1,
    status: "failed",
    code: "health_endpoint_invalid",
  });
  assert.doesNotMatch(result.stderr, /secret|stack|TransformError/i);
});
