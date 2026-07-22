import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const RUNBOOK_PATH = "docs/operations/relaunch-activation-runbook.md";

test("relaunch activation runbook keeps owner authority and rollback contract explicit", async () => {
  const runbook = await readFile(RUNBOOK_PATH, "utf8");

  for (const required of [
    "Owner: Product owner `contact@meelni.com`",
    "Statsig gate `meelni_reactivation_access`",
    "`MEELNI_REACTIVATION_DEFAULT=false`",
    "`MEELNI_RELAUNCH_PHASE=prelaunch`",
    "`MEELNI_RELAUNCH_PHASE=rehearsal`",
    "`MEELNI_REHEARSAL_COMMIT_SHA=<40hex>`",
    "`meelni_preview_rehearsal_authority`",
    "Preview flip procedure",
    "Required Preview smoke matrix",
    "Metrics and observability",
    "Rollback thresholds",
    "Rollback path",
    "Evidence packet",
  ]) {
    assert.match(runbook, escapeForRegex(required));
  }

  assert.match(
    runbook,
    /SAV-176 can close only after the Preview flip and rollback are actually\s+exercised/i
  );
  assert.match(
    runbook,
    /only the product owner may create the final Production\s+GO record/i
  );
  assert.match(runbook, /A successful Preview rehearsal is evidence only/i);
  assert.match(
    runbook,
    /Turn off the Statsig gate `meelni_reactivation_access` in Preview/i
  );
  assert.match(
    runbook,
    /Disable or remove `meelni_preview_rehearsal_authority`/i
  );
  assert.match(
    runbook,
    /remove the branch-scoped `MEELNI_REHEARSAL_COMMIT_SHA`/i
  );
  assert.match(
    runbook,
    /Fresh\/declined users do not initialize optional PostHog or browser Statsig/i
  );
  assert.match(
    runbook,
    /Production rollback[\s\S]*must not create automatic refunds,\s+prorations, or compensation/i
  );
});

function escapeForRegex(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}
