import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const REPOSITORY_ROOT = realpathSync(
  process.env.MEELNI_CALIBRATION_REPOSITORY_ROOT ??
    resolve(dirname(fileURLToPath(import.meta.url)), "../..")
);

export interface CalibrationSourceCheckoutState {
  repositoryRoot: string;
  headCommit: string;
  porcelainStatus: string;
  trackedTreeMatchesHead: boolean;
}

export function assertCalibrationReviewedSourceState(
  reviewedSourceCommit: string | null,
  state: CalibrationSourceCheckoutState,
  expectedRepositoryRoot = REPOSITORY_ROOT
): void {
  if (
    !reviewedSourceCommit ||
    !COMMIT_SHA.test(reviewedSourceCommit) ||
    realpathSync(state.repositoryRoot) !== realpathSync(expectedRepositoryRoot) ||
    state.headCommit !== reviewedSourceCommit ||
    state.porcelainStatus !== "" ||
    !state.trackedTreeMatchesHead
  ) {
    throw new Error("calibration_reviewed_source_checkout_mismatch");
  }
}

export function assertCalibrationReviewedSourceCheckout(
  reviewedSourceCommit: string | null
): void {
  assertCalibrationReviewedSourceState(
    reviewedSourceCommit,
    readCalibrationSourceCheckoutState(),
    REPOSITORY_ROOT
  );
}

interface GitTreeEntry {
  mode: string;
  type: string;
  objectId: string;
  path: string;
}

export function readCalibrationSourceCheckoutState(
  repositoryRoot = REPOSITORY_ROOT
): CalibrationSourceCheckoutState {
  const git = "/usr/bin/git";
  const runBuffer = (args: string[]) =>
    execFileSync(git, ["-C", repositoryRoot, ...args], {
      encoding: "buffer",
      env: {
        GIT_NO_REPLACE_OBJECTS: "1",
        NODE_ENV: "production",
        PATH: "/usr/bin:/bin",
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    });
  const run = (args: string[]) =>
    execFileSync(git, ["-C", repositoryRoot, ...args], {
      encoding: "utf8",
      env: {
        GIT_NO_REPLACE_OBJECTS: "1",
        NODE_ENV: "production",
        PATH: "/usr/bin:/bin",
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).trimEnd();
  const canonicalRoot = realpathSync(run(["rev-parse", "--show-toplevel"]));
  const treeEntries = parseGitTreeEntries(
    runBuffer(["ls-tree", "-r", "-z", "--full-tree", "HEAD"])
  );
  return {
    repositoryRoot: canonicalRoot,
    headCommit: run(["rev-parse", "HEAD"]),
    porcelainStatus: run([
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--ignore-submodules=none",
    ]),
    trackedTreeMatchesHead: treeEntries.every((entry) =>
      workingTreeEntryMatchesHead(canonicalRoot, entry)
    ),
  };
}

function parseGitTreeEntries(output: Buffer): GitTreeEntry[] {
  if (output.length === 0) return [];
  return output
    .subarray(0, output.at(-1) === 0 ? -1 : undefined)
    .toString("utf8")
    .split("\0")
    .map((record) => {
      const match = /^(\d{6}) (\S+) ([a-f0-9]{40})\t([\s\S]+)$/.exec(record);
      if (!match) throw new Error("calibration_reviewed_source_checkout_mismatch");
      return {
        mode: match[1],
        type: match[2],
        objectId: match[3],
        path: match[4],
      };
    });
}

function workingTreeEntryMatchesHead(
  repositoryRoot: string,
  entry: GitTreeEntry
): boolean {
  if (entry.type !== "blob") return false;
  const filePath = join(repositoryRoot, entry.path);
  try {
    const stat = lstatSync(filePath);
    if (entry.mode === "120000") {
      return (
        stat.isSymbolicLink() &&
        gitBlobObjectId(Buffer.from(readlinkSync(filePath), "utf8")) ===
          entry.objectId
      );
    }
    if (entry.mode !== "100644" && entry.mode !== "100755") return false;
    const actualMode =
      stat.isFile() && (stat.mode & 0o111) !== 0 ? "100755" : "100644";
    return (
      stat.isFile() &&
      actualMode === entry.mode &&
      gitBlobObjectId(readFileSync(filePath)) === entry.objectId
    );
  } catch {
    return false;
  }
}

function gitBlobObjectId(content: Buffer): string {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}
