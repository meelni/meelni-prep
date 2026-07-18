import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parsePlanCallKey,
  prepareCalibrationSemanticReviewPaths,
  readSemanticPanel,
  waitForSemanticReviewArtifacts,
} from "./calibration-live-semantic-review";
import {
  buildSemanticReviewExecutionReceipt,
  buildTrustedSemanticExecutionAuthority,
} from "./calibration-semantic-capture";

test("operator paths are canonical, distinct, absent, and outside private capture", async () => {
  const root = mkdtempSync(join(tmpdir(), "meelni-sav248-live-paths-"));
  try {
    const paths = await prepare(root);
    const canonicalRoot = realpathSync(root);
    assert.equal(
      paths.captureDirectory,
      join(canonicalRoot, "private", "capture")
    );
    assert.equal(paths.output, join(canonicalRoot, "public", "automated.json"));

    await assert.rejects(
      () =>
        prepareCalibrationSemanticReviewPaths({
          ...input(root),
          panelB: join(root, "panel-a.json"),
        }),
      /paths_must_be_distinct/
    );
    await assert.rejects(
      () =>
        prepareCalibrationSemanticReviewPaths({
          ...input(root),
          reviewRequest: join(root, "private", "capture", "request.json"),
        }),
      /files_must_be_outside_capture/
    );

    writeFileSync(paths.panelA, "occupied", { mode: 0o600 });
    await assert.rejects(() => prepare(root), /review_file_already_exists/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preflight rejects a Git-contained file parent before creating it", async () => {
  const root = mkdtempSync(join(tmpdir(), "meelni-sav248-live-git-path-"));
  const repository = join(root, "repository");
  const forbiddenParent = join(repository, "new-private-parent");
  mkdirSync(join(repository, ".git"), { recursive: true });
  try {
    await assert.rejects(
      () =>
        prepareCalibrationSemanticReviewPaths({
          ...input(root),
          semanticPublicReport: join(forbiddenParent, "semantic.json"),
        }),
      /cannot be inside a Git worktree/
    );
    assert.equal(existsSync(forbiddenParent), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan call keys reject negative, missing, and non-integer run indexes", () => {
  assert.deepEqual(parsePlanCallKey("product-sense-case:1"), {
    caseRef: "product-sense-case",
    runIndex: 1,
  });
  for (const value of ["case:-1", "case:1.5", "case:nope", ":1", "case"]) {
    assert.throws(() => parsePlanCallKey(value), /plan_call_key_invalid/);
  }
});

test("panel decisions and operator authority are private, separate, and hash bound", async () => {
  const root = mkdtempSync(join(tmpdir(), "meelni-sav248-panel-"));
  const panelAPath = join(root, "panel-a.json");
  const panelBPath = join(root, "panel-b.json");
  const authorityPath = join(root, "authority.json");
  const reviewInputSha256 = "a".repeat(64);
  const decisions = [
    {
      sanitizedOutputId: `out_${"1".repeat(32)}`,
      sanitizedCaseId: `case_${"2".repeat(32)}`,
      runIndex: 0,
      responseSha256: "3".repeat(64),
      evidenceRelevance: "relevant" as const,
      observationAccuracy: "accurate" as const,
      nextStepUsefulness: "useful" as const,
      dimensionFit: "fits" as const,
      alternativeDisposition: "not_applicable" as const,
      overallDecision: "accept" as const,
    },
  ];
  const panel = {
    reviewInputSha256,
    decisions,
  };
  const receipts = [
    buildSemanticReviewExecutionReceipt({
      taskPath: "/root/sav248/panel_a",
      executionId: `exec_${"b".repeat(32)}`,
      completedAt: "2026-07-18T20:00:00.000Z",
      reviewInputSha256,
      decisions,
    }),
    buildSemanticReviewExecutionReceipt({
      taskPath: "/root/sav248/panel_b",
      executionId: `exec_${"c".repeat(32)}`,
      completedAt: "2026-07-18T20:01:00.000Z",
      reviewInputSha256,
      decisions,
    }),
  ] as const;
  const authority = buildTrustedSemanticExecutionAuthority({
    reviewInputSha256,
    verifiedExecutions: [...receipts],
  });
  try {
    writeFileSync(panelAPath, `${JSON.stringify(panel)}\n`, { mode: 0o600 });
    writeFileSync(panelBPath, `${JSON.stringify(panel)}\n`, { mode: 0o600 });
    writeFileSync(authorityPath, `${JSON.stringify(authority)}\n`, {
      mode: 0o600,
    });
    assert.deepEqual(
      await waitForSemanticReviewArtifacts({
        panelA: panelAPath,
        panelB: panelBPath,
        executionAuthority: authorityPath,
        reviewInputSha256,
        timeoutSeconds: 1,
      }),
      { panels: [panel, panel], executionAuthority: authority }
    );
    await assert.rejects(
      () => readSemanticPanel(panelAPath, "d".repeat(64)),
      /panel_binding_mismatch/
    );

    const hardLink = join(root, "panel-a-hard-link.json");
    linkSync(panelAPath, hardLink);
    await assert.rejects(
      () => readSemanticPanel(panelAPath, reviewInputSha256),
      /review_file_is_unsafe/
    );
    unlinkSync(hardLink);

    chmodSync(panelAPath, 0o644);
    await assert.rejects(
      () => readSemanticPanel(panelAPath, reviewInputSha256),
      /review_file_is_unsafe/
    );
    chmodSync(panelAPath, 0o600);
    writeFileSync(
      panelAPath,
      `${JSON.stringify({ ...panel, extra: true })}\n`,
      { mode: 0o600 }
    );
    await assert.rejects(
      () => readSemanticPanel(panelAPath, reviewInputSha256),
      /panel_shape_invalid/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("operator authority CLI binds independently observed executions to panel decisions", () => {
  const root = mkdtempSync(join(tmpdir(), "meelni-sav248-authority-cli-"));
  const reviewInputSha256 = "e".repeat(64);
  const reviewRequest = join(root, "review-request.json");
  const panelA = join(root, "panel-a.json");
  const panelB = join(root, "panel-b.json");
  const output = join(root, "authority.json");
  const decisions = [
    {
      sanitizedOutputId: `out_${"4".repeat(32)}`,
      sanitizedCaseId: `case_${"5".repeat(32)}`,
      runIndex: 0,
      responseSha256: "6".repeat(64),
      evidenceRelevance: "relevant",
      observationAccuracy: "accurate",
      nextStepUsefulness: "useful",
      dimensionFit: "fits",
      alternativeDisposition: "not_applicable",
      overallDecision: "accept",
    },
  ];
  try {
    for (const [path, value] of [
      [reviewRequest, { reviewInputSha256 }],
      [panelA, { reviewInputSha256, decisions }],
      [panelB, { reviewInputSha256, decisions }],
    ] as const) {
      writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    }
    const result = spawnSync(
      process.execPath,
      [
        join(process.cwd(), "node_modules/tsx/dist/cli.mjs"),
        join(process.cwd(), "scripts/write-evaluation-semantic-authority.ts"),
        "--review-request",
        reviewRequest,
        "--panel-a",
        panelA,
        "--panel-b",
        panelB,
        "--task-a",
        "/root/sav248/review_a",
        "--task-b",
        "/root/sav248/review_b",
        "--execution-a",
        `exec_${"7".repeat(32)}`,
        "--execution-b",
        `exec_${"8".repeat(32)}`,
        "--completed-a",
        "2026-07-18T20:10:00.000Z",
        "--completed-b",
        "2026-07-18T20:11:00.000Z",
        "--output",
        output,
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const authority = JSON.parse(readFileSync(output, "utf8")) as {
      reviewInputSha256: string;
      verifiedExecutions: Array<{ taskPath: string }>;
      authoritySha256: string;
    };
    assert.equal(authority.reviewInputSha256, reviewInputSha256);
    assert.deepEqual(
      authority.verifiedExecutions.map(({ taskPath }) => taskPath),
      ["/root/sav248/review_a", "/root/sav248/review_b"]
    );
    assert.match(authority.authoritySha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("operator authority CLI rejects an output parent symlinked into Git", () => {
  const root = mkdtempSync(join(tmpdir(), "meelni-sav248-authority-git-"));
  const repository = join(root, "repository");
  const privateParent = join(repository, "private");
  const linkedParent = join(root, "linked-private");
  const reviewInputSha256 = "9".repeat(64);
  const decisions = [
    {
      sanitizedOutputId: `out_${"1".repeat(32)}`,
      sanitizedCaseId: `case_${"2".repeat(32)}`,
      runIndex: 0,
      responseSha256: "3".repeat(64),
      evidenceRelevance: "relevant",
      observationAccuracy: "accurate",
      nextStepUsefulness: "useful",
      dimensionFit: "fits",
      alternativeDisposition: "not_applicable",
      overallDecision: "accept",
    },
  ];
  try {
    mkdirSync(join(repository, ".git"), { recursive: true });
    mkdirSync(privateParent, { mode: 0o700 });
    symlinkSync(privateParent, linkedParent, "dir");
    const reviewRequest = join(root, "request.json");
    const panelA = join(root, "a.json");
    const panelB = join(root, "b.json");
    for (const [path, value] of [
      [reviewRequest, { reviewInputSha256 }],
      [panelA, { reviewInputSha256, decisions }],
      [panelB, { reviewInputSha256, decisions }],
    ] as const) {
      writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    }
    const result = spawnSync(
      process.execPath,
      [
        join(process.cwd(), "node_modules/tsx/dist/cli.mjs"),
        join(process.cwd(), "scripts/write-evaluation-semantic-authority.ts"),
        "--review-request",
        reviewRequest,
        "--panel-a",
        panelA,
        "--panel-b",
        panelB,
        "--task-a",
        "/root/sav248/a",
        "--task-b",
        "/root/sav248/b",
        "--execution-a",
        `exec_${"4".repeat(32)}`,
        "--execution-b",
        `exec_${"5".repeat(32)}`,
        "--completed-a",
        "2026-07-18T20:10:00.000Z",
        "--completed-b",
        "2026-07-18T20:11:00.000Z",
        "--output",
        join(linkedParent, "authority.json"),
      ],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /inside a Git worktree/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function input(root: string) {
  return {
    cwd: root,
    captureDirectory: join(root, "private", "capture"),
    semanticPublicReport: join(root, "public", "semantic.json"),
    reviewRequest: join(root, "review-request.json"),
    panelA: join(root, "panel-a.json"),
    panelB: join(root, "panel-b.json"),
    executionAuthority: join(root, "execution-authority.json"),
    output: join(root, "public", "automated.json"),
    timeoutSeconds: 60,
  };
}

async function prepare(root: string) {
  return await prepareCalibrationSemanticReviewPaths(input(root));
}
