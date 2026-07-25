import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const RUNBOOK_PATH = "docs/operations/relaunch-activation-runbook.md";
const READINESS_EXECUTION_PATH =
  "docs/operations/relaunch-readiness-execution.md";
const EVALUATION_CALIBRATION_RUNBOOK_PATH =
  "docs/operations/evaluation-calibration.md";
const PRODUCTION_ACTION_AUTHORIZATION_RUNBOOK_PATH =
  "docs/operations/production-action-authorization.md";
const STATSIG_GOVERNANCE_RUNBOOK_PATH =
  "docs/operations/statsig-relaunch-governance.md";

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
    /SAV-198\/SAV-248 v10 terminal calibration evidence is recorded truthfully/i
  );
  assert.match(
    runbook,
    /consumed v3 through v7 lanes are historical failure evidence, not the\s+current\s+terminal calibration path/i
  );
  assert.doesNotMatch(
    runbook,
    /SAV-198\/SAV-285 terminal calibration evidence/i
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
    "npm run --silent relaunch:readiness-snapshot",
    "SAV-198",
    "SAV-126",
    "SAV-283",
    "SAV-186",
    "SAV-223",
    "refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v10",
    "Meelni SAV-248 v10 calibration ledger immutable",
    "Meelni SAV-248 v10 calibration activation actor",
    "GitHub user `saviii`, actor type\n     `User`, user ID `24397508`",
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
    /does not mutate GitHub, providers, Linear, feature\s+flags, ledger refs, or owner authorization artifacts/i
  );
  assert.match(
    runbook,
    /A broad "looks good" or "signed" message is not enough/i
  );
  assert.match(runbook, /Do not point Production at test-mode price IDs/i);
  assert.match(runbook, /Do not manually create the v10 ledger\s+ref/i);
  assert.match(runbook, /Stop before total spend\s+can exceed \$3/i);
  assert.match(runbook, /Do not print secret values/i);
  assert.match(runbook, /no customer transcripts;\s+- no Production data/i);
  assert.match(
    runbook,
    /Default-off and emergency-disable rollback remain available without launch GO/i
  );
});

test("evaluation calibration runbook uses v10 owner authorization artifact names", async () => {
  const runbook = await readFile(EVALUATION_CALIBRATION_RUNBOOK_PATH, "utf8");

  for (const required of [
    "sav-248-v10-owner-authorization-request.json",
    "sav-248-v10-owner-authorization.json",
    "sav-248-v10-owner-authorization-report.json",
    "GitHub user `saviii`, actor type `User`, user ID `24397508`",
    "proposal commit: 048420635d9103314488320171f153732738666c",
  ]) {
    assert.match(runbook, escapeForRegex(required));
  }

  for (const stale of [
    "sav-248-v3-owner-authorization-request.json",
    "sav-248-v3-owner-authorization.json",
    "sav-248-v3-owner-authorization-report.json",
    "proposal commit: f197794dd0962d30ed00e72715795f9a854a859d",
  ]) {
    assert.doesNotMatch(runbook, escapeForRegex(stale));
  }
});

test("Statsig governance runbook records owner-only eligibility and required-review caveat", async () => {
  const runbook = await readFile(STATSIG_GOVERNANCE_RUNBOOK_PATH, "utf8");

  for (const required of [
    "Statsig checks on 2026-07-23 returned",
    "Gate `meelni_reactivation_access`",
    "Dynamic config `meelni_preview_rehearsal_authority`",
    "`reviewSettings.requiredReview: false`",
    "`everyone_eligible: false`",
    "`6Uip5thkTs2D7ascrYKYkQ`",
    "`QHCBMD2kK9ZIwA4hXmdzP`",
    "`defaultValue.active: false`",
    "retained historical rehearsal metadata",
    "inactive and expired",
    "required-review enforcement is not yet\nproven",
    "preserving the\n  owner-only reviewer constraint",
    "do not activate Preview rehearsal authority",
    "do not change enabled state,\n> dynamic config active state",
    "defaultValue.active: false",
  ]) {
    assert.match(runbook, escapeForRegex(required));
  }

  assert.match(
    runbook,
    /both controls are safely off[\s\S]*limits\s+eligible reviewers for both controls to the owner account/i
  );
  assert.match(runbook, /required-review enforcement is not yet\s+proven/i);
  assert.match(
    runbook,
    /Do not propose `is_enabled: true` or `default_value\.active: true`/i
  );
  assert.match(runbook, /self-commit for the single-operator workflow/i);
});

test("production action runbook uses the active owner key", async () => {
  const runbook = await readFile(
    PRODUCTION_ACTION_AUTHORIZATION_RUNBOOK_PATH,
    "utf8"
  );

  for (const required of [
    "active owner\npublic key `meelni-owner-2026-07`",
    "valid from `2026-07-21T00:00:00.000Z` through\n`2027-07-21T00:00:00.000Z`",
    "--key-id meelni-owner-2026-07",
    "--not-before 2026-07-21T00:00:00.000Z",
    "--not-after 2027-07-21T00:00:00.000Z",
  ]) {
    assert.match(runbook, escapeForRegex(required));
  }

  assert.doesNotMatch(runbook, /meelni-owner-2026-01/);
  assert.doesNotMatch(runbook, /2026-07-01T00:00:00\.000Z/);
  assert.doesNotMatch(runbook, /2027-07-01T00:00:00\.000Z/);
});

function escapeForRegex(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}
