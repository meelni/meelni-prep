import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertCalibrationReviewedSourceState,
  readCalibrationSourceCheckoutState,
} from "./calibration-source-attestation";

test("reviewed source attestation requires the exact clean canonical checkout", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "meelni-source-")));
  const commit = "a".repeat(40);
  try {
    assert.doesNotThrow(() =>
      assertCalibrationReviewedSourceState(
        commit,
        {
          repositoryRoot: root,
          headCommit: commit,
          porcelainStatus: "",
          trackedTreeMatchesHead: true,
        },
        root
      )
    );
    for (const state of [
      {
        repositoryRoot: root,
        headCommit: "b".repeat(40),
        porcelainStatus: "",
        trackedTreeMatchesHead: true,
      },
      {
        repositoryRoot: root,
        headCommit: commit,
        porcelainStatus: " M file.ts",
        trackedTreeMatchesHead: true,
      },
      {
        repositoryRoot: root,
        headCommit: commit,
        porcelainStatus: "",
        trackedTreeMatchesHead: false,
      },
    ]) {
      assert.throws(
        () => assertCalibrationReviewedSourceState(commit, state, root),
        /reviewed_source_checkout_mismatch/
      );
    }
    assert.throws(
      () =>
        assertCalibrationReviewedSourceState(
          null,
          {
            repositoryRoot: root,
            headCommit: commit,
            porcelainStatus: "",
            trackedTreeMatchesHead: true,
          },
          root
        ),
      /reviewed_source_checkout_mismatch/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reviewed source attestation ignores index flags and hashes tracked bytes", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "meelni-source-git-")));
  const git = (...args: string[]) =>
    execFileSync("/usr/bin/git", ["-C", root, ...args], {
      encoding: "utf8",
      env: { NODE_ENV: "test", PATH: "/usr/bin:/bin" },
    }).trim();
  try {
    git("init", "--quiet");
    git("config", "user.name", "Calibration Test");
    git("config", "user.email", "calibration@example.invalid");
    writeFileSync(join(root, "runtime.ts"), "export const value = 1;\n");
    git("add", "runtime.ts");
    git("commit", "--quiet", "-m", "fixture");
    const commit = git("rev-parse", "HEAD");

    assert.doesNotThrow(() =>
      assertCalibrationReviewedSourceState(
        commit,
        readCalibrationSourceCheckoutState(root),
        root
      )
    );

    for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
      writeFileSync(join(root, "runtime.ts"), "export const value = 1;\n");
      git("update-index", "--no-assume-unchanged", "runtime.ts");
      git("update-index", "--no-skip-worktree", "runtime.ts");
      git("update-index", flag, "runtime.ts");
      writeFileSync(join(root, "runtime.ts"), "export const value = 2;\n");
      const state = readCalibrationSourceCheckoutState(root);
      assert.equal(state.porcelainStatus, "");
      assert.equal(state.trackedTreeMatchesHead, false);
      assert.throws(
        () => assertCalibrationReviewedSourceState(commit, state, root),
        /reviewed_source_checkout_mismatch/
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reviewed source attestation ignores local Git replacement objects", () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "meelni-source-replace-"))
  );
  const git = (...args: string[]) =>
    execFileSync("/usr/bin/git", ["-C", root, ...args], {
      encoding: "utf8",
      env: { NODE_ENV: "test", PATH: "/usr/bin:/bin" },
    }).trim();
  try {
    git("init", "--quiet");
    git("config", "user.name", "Calibration Test");
    git("config", "user.email", "calibration@example.invalid");
    writeFileSync(join(root, "runtime.ts"), "export const value = 1;\n");
    git("add", "runtime.ts");
    git("commit", "--quiet", "-m", "reviewed");
    const reviewedCommit = git("rev-parse", "HEAD");
    writeFileSync(join(root, "runtime.ts"), "export const value = 2;\n");
    git("add", "runtime.ts");
    git("commit", "--quiet", "-m", "replacement");
    const replacementCommit = git("rev-parse", "HEAD");
    git("replace", reviewedCommit, replacementCommit);
    git("reset", "--quiet", "--hard", reviewedCommit);

    assert.equal(git("rev-parse", "HEAD"), reviewedCommit);
    assert.match(readFileSync(join(root, "runtime.ts"), "utf8"), /value = 2/);
    assert.throws(
      () =>
        assertCalibrationReviewedSourceState(
          reviewedCommit,
          readCalibrationSourceCheckoutState(root),
          root
        ),
      /reviewed_source_checkout_mismatch/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
