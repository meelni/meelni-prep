import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  evaluationCalibrationCases,
} from "@meelni/test-fixtures";

import { getEvaluationAdjudicationHashes } from "./calibration-approval";
import {
  CALIBRATION_MAX_PROVIDER_CALLS,
  CALIBRATION_MAX_SPEND_NANO_USD,
  CALIBRATION_PRICING_CONTRACT,
} from "./calibration-budget";
import {
  SAV_198_APPROVED_RUN_ID,
  SAV_198_GIT_LEDGER_REF,
  SAV_198_SPEND_AUTHORIZATION,
  activateCalibrationRun,
  buildCalibrationActivatedPlan,
  calibrationAuthorizationCommitMessage,
  parseCalibrationSpendAuthorization,
} from "./calibration-run-ledger";

const NOW = new Date("2026-07-12T07:00:00.000Z");
const TEST_ROOT = mkdtempSync(join(tmpdir(), "meelni-sav198-git-ledger-"));

test.after(() => rmSync(TEST_ROOT, { recursive: true, force: true }));

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
  assert.ok(plan.plannedWorstCaseNanoUsd <= CALIBRATION_MAX_SPEND_NANO_USD);
  assert.equal(plan.planHash.length, 64);
  assert.equal(plan.approvalHash.length, 64);
  assert.equal(new Set(plan.calls.map(({ callKey }) => callKey)).size, 96);
});

test("two concurrent processes race one non-force activation and only one wins", async () => {
  const remote = createAuthorizedRemote("concurrent");
  const approvalPath = join(TEST_ROOT, "approval.json");
  writeFileSync(approvalPath, `${JSON.stringify(approvalFixture())}\n`, {
    mode: 0o600,
  });

  const results = await Promise.all([
    runActivationWorker(remote, approvalPath, "activation-one"),
    runActivationWorker(remote, approvalPath, "activation-two"),
  ]);
  assert.equal(results.filter(({ code }) => code === 0).length, 1);
  assert.equal(results.filter(({ code }) => code !== 0).length, 1);
  assert.match(
    results.find(({ code }) => code !== 0)!.stderr,
    /already_activated|lost_concurrent_cas/
  );
  assertPayloadFreeActivation(remote);
});

test("an activated crash burns the plan and local resets cannot mint another budget", () => {
  const remote = createAuthorizedRemote("crash-burn");
  const first = activate(remote, "first-activation");
  const activationCommit = first.activationCommit;
  first.release();

  const unrelatedLocalDirectory = mkdtempSync(
    join(TEST_ROOT, "deleted-local-cache-")
  );
  rmSync(unrelatedLocalDirectory, { recursive: true, force: true });
  assert.throws(
    () => activate(remote, "second-activation"),
    /already_activated/
  );
  assert.equal(readRemoteRef(remote), activationCommit);
  assertPayloadFreeActivation(remote);
});

test("activation refuses malformed or payload-bearing authorization state", () => {
  const malformed = createAuthorizedRemote("malformed", "not authorized");
  assert.throws(() => activate(malformed, "malformed"), /commit_invalid/);

  const payload = createAuthorizedRemote(
    "payload",
    calibrationAuthorizationCommitMessage(),
    "forbidden payload"
  );
  assert.throws(() => activate(payload, "payload"), /payload_free/);
});

test("request authority fails closed when the protected activation ref changes", () => {
  const remote = createAuthorizedRemote("changed-ref");
  const authority = activate(remote, "activation-current");
  git([`--git-dir=${remote}`, "update-ref", "-d", SAV_198_GIT_LEDGER_REF]);
  assert.throws(
    () => authority.assertRequestAuthority(),
    /ledger_ref_unavailable|activation_is_not_current/
  );
});

function activate(remote: string, activationId: string) {
  return activateCalibrationRun({
    authorization: SAV_198_SPEND_AUTHORIZATION,
    adjudicationApproval: approvalFixture(),
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 3,
    remoteUrl: remote,
    now: NOW,
    activationId,
  });
}

function createAuthorizedRemote(
  name: string,
  message = calibrationAuthorizationCommitMessage(),
  payload?: string
): string {
  const remote = join(TEST_ROOT, `${name}.git`);
  git(["init", "--bare", "--quiet", remote]);
  let tree: string;
  if (payload === undefined) {
    tree = git([`--git-dir=${remote}`, "mktree"], "").trim();
  } else {
    const blob = git(
      [`--git-dir=${remote}`, "hash-object", "-w", "--stdin"],
      payload
    ).trim();
    tree = git(
      [`--git-dir=${remote}`, "mktree"],
      `100644 blob ${blob}\tpayload.txt\n`
    ).trim();
  }
  const commit = git(
    [`--git-dir=${remote}`, "commit-tree", tree],
    `${message}\n`
  ).trim();
  git([`--git-dir=${remote}`, "update-ref", SAV_198_GIT_LEDGER_REF, commit]);
  return remote;
}

function assertPayloadFreeActivation(remote: string): void {
  const head = readRemoteRef(remote);
  const tree = git([
    `--git-dir=${remote}`,
    "show",
    "-s",
    "--format=%T",
    head,
  ]).trim();
  const emptyTree = git([`--git-dir=${remote}`, "mktree"], "").trim();
  assert.equal(tree, emptyTree);
  const message = git([
    `--git-dir=${remote}`,
    "show",
    "-s",
    "--format=%B",
    head,
  ]);
  assert.equal(
    message.includes(evaluationCalibrationCases[0].transcript[0].text),
    false
  );
  assert.equal(message.includes("OPENAI_API_KEY"), false);
}

function readRemoteRef(remote: string): string {
  return git([
    `--git-dir=${remote}`,
    "rev-parse",
    SAV_198_GIT_LEDGER_REF,
  ]).trim();
}

function runActivationWorker(
  remote: string,
  approvalPath: string,
  activationId: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const worker = join(
    process.cwd(),
    "scripts",
    "test-evaluation-calibration-git-activation.ts"
  );
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [tsxCli, worker, remote, approvalPath, activationId],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function approvalFixture() {
  return {
    contractVersion: "evaluation-adjudication-approval.v1",
    ...getEvaluationAdjudicationHashes(),
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    reviewer: { identity: "test-reviewer", role: "pm_reviewer" },
    reviewedAt: NOW.toISOString(),
    decisions: evaluationCalibrationCases
      .filter(({ expectedQuality }) => expectedQuality !== null)
      .map(({ id }) => ({ caseId: id, decision: "approved" })),
  };
}

function git(args: string[], input?: string): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test Calibration",
      GIT_AUTHOR_EMAIL: "test@meelni.invalid",
      GIT_COMMITTER_NAME: "Test Calibration",
      GIT_COMMITTER_EMAIL: "test@meelni.invalid",
      GIT_AUTHOR_DATE: NOW.toISOString(),
      GIT_COMMITTER_DATE: NOW.toISOString(),
    },
  });
}
