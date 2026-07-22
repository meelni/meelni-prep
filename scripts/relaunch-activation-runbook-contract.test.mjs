import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const RUNBOOK_PATH = "docs/operations/relaunch-activation-runbook.md";
const READINESS_EXECUTION_PATH =
  "docs/operations/relaunch-readiness-execution.md";

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

test("relaunch readiness execution runbook sequences live gates without authorizing launch", async () => {
  const runbook = await readFile(READINESS_EXECUTION_PATH, "utf8");

  for (const required of [
    "human product owner remains the only launch GO/NO-GO authority",
    "`meelni_reactivation_access` disabled",
    "`MEELNI_REACTIVATION_DEFAULT`",
    "SAV-198",
    "SAV-126",
    "SAV-283",
    "SAV-186",
    "SAV-223",
    "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v4",
    "Meelni SAV-248 v4 calibration ledger immutable",
    "Meelni SAV-248 v4 calibration activation actor",
    "GitHub user `saviii`, user ID\n     `24397508`",
    "meelni_interview_pass_usd",
    "meelni_starter_monthly_usd",
    "meelni_pro_monthly_usd",
    "STRIPE_INTERVIEW_PASS_PRICE_ID",
    "STRIPE_STARTER_MONTHLY_PRICE_ID",
    "STRIPE_PRO_MONTHLY_PRICE_ID",
    "keep `meelni_preview_rehearsal_authority` disabled and `active: false`",
    "preserve the single-owner operating model",
  ]) {
    assert.match(runbook, escapeForRegex(required));
  }

  assert.match(
    runbook,
    /Passing this runbook's technical gates is readiness evidence, not a\s+launch decision/i
  );
  assert.match(
    runbook,
    /A broad "looks good" or "signed" message is not enough/i
  );
  assert.match(
    runbook,
    /Do not point Production at test-mode price IDs/i
  );
  assert.match(runbook, /Do not manually create the v4 ledger\s+ref/i);
  assert.match(runbook, /Stop before total spend\s+can exceed \$3/i);
  assert.match(
    runbook,
    /Do not print secret values/i
  );
  assert.match(
    runbook,
    /no customer transcripts;\s+- no Production data/i
  );
  assert.match(
    runbook,
    /Default-off and emergency-disable rollback remain available without launch GO/i
  );
});

function escapeForRegex(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}
