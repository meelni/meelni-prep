import { constants } from "node:fs";
import { mkdir, open, realpath, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

import type { SemanticAdjudicationDecision } from "./calibration-semantic-adjudication";
import {
  assertSemanticPathOutsideGitWorktree,
  parseTrustedSemanticExecutionAuthority,
  resolvePrivateSemanticCaptureDirectory,
  type TrustedSemanticExecutionAuthority,
} from "./calibration-semantic-capture";

const MAX_REVIEW_FILE_BYTES = 2 * 1024 * 1024;
const REVIEW_POLL_INTERVAL_MS = 250;

export interface CalibrationSemanticReviewPaths {
  captureDirectory: string;
  semanticPublicReport: string;
  reviewRequest: string;
  panelA: string;
  panelB: string;
  executionAuthority: string;
  output: string;
  timeoutSeconds: number;
}

export interface SemanticPanelFile {
  reviewInputSha256: string;
  decisions: SemanticAdjudicationDecision[];
}

export interface SemanticReviewArtifacts {
  panels: [SemanticPanelFile, SemanticPanelFile];
  executionAuthority: TrustedSemanticExecutionAuthority;
}

export async function prepareCalibrationSemanticReviewPaths(input: {
  cwd: string;
  captureDirectory: string;
  semanticPublicReport: string;
  reviewRequest: string;
  panelA: string;
  panelB: string;
  executionAuthority: string;
  output: string;
  timeoutSeconds: number;
}): Promise<CalibrationSemanticReviewPaths> {
  const requestedCapture = resolve(input.cwd, input.captureDirectory);
  const requestedFiles = [
    input.semanticPublicReport,
    input.reviewRequest,
    input.panelA,
    input.panelB,
    input.executionAuthority,
    input.output,
  ].map((path) =>
    isAbsolute(path) ? resolve(path) : resolve(input.cwd, path)
  );
  assertDistinctAndOutsideCapture(requestedCapture, requestedFiles);
  const requestedCaptureParent = dirname(requestedCapture);
  assertSemanticPathOutsideGitWorktree(
    await realpath(await nearestExistingAncestor(requestedCaptureParent))
  );
  await mkdir(requestedCaptureParent, { recursive: true, mode: 0o700 });
  assertSemanticPathOutsideGitWorktree(await realpath(requestedCaptureParent));
  const captureDirectory =
    resolvePrivateSemanticCaptureDirectory(requestedCapture);
  const paths = {
    captureDirectory,
    semanticPublicReport: await canonicalFutureFile(
      input.cwd,
      input.semanticPublicReport
    ),
    reviewRequest: await canonicalFutureFile(input.cwd, input.reviewRequest),
    panelA: await canonicalFutureFile(input.cwd, input.panelA),
    panelB: await canonicalFutureFile(input.cwd, input.panelB),
    executionAuthority: await canonicalFutureFile(
      input.cwd,
      input.executionAuthority
    ),
    output: await canonicalFutureFile(input.cwd, input.output),
    timeoutSeconds: input.timeoutSeconds,
  };
  const filePaths = [
    paths.semanticPublicReport,
    paths.reviewRequest,
    paths.panelA,
    paths.panelB,
    paths.executionAuthority,
    paths.output,
  ];
  assertDistinctAndOutsideCapture(captureDirectory, filePaths);
  await assertPathAbsent(captureDirectory, "capture directory");
  for (const path of filePaths) {
    assertSemanticPathOutsideGitWorktree(dirname(path));
    await assertPrivateOwnedDirectory(dirname(path));
    await assertPathAbsent(path, "semantic review file");
  }
  return paths;
}

export function parsePlanCallKey(callKey: string): {
  caseRef: string;
  runIndex: number;
} {
  const separator = callKey.lastIndexOf(":");
  const caseRef = callKey.slice(0, separator);
  const runIndex = Number(callKey.slice(separator + 1));
  if (
    !caseRef ||
    separator < 1 ||
    !Number.isInteger(runIndex) ||
    runIndex < 0
  ) {
    throw new Error("calibration_v3_plan_call_key_invalid");
  }
  return { caseRef, runIndex };
}

export async function waitForSemanticReviewArtifacts(input: {
  panelA: string;
  panelB: string;
  executionAuthority: string;
  reviewInputSha256: string;
  timeoutSeconds: number;
}): Promise<SemanticReviewArtifacts> {
  const deadline = Date.now() + input.timeoutSeconds * 1_000;
  let panelA: SemanticPanelFile | undefined;
  let panelB: SemanticPanelFile | undefined;
  let executionAuthority: TrustedSemanticExecutionAuthority | undefined;
  while (Date.now() <= deadline) {
    panelA ??= await readIfPresent(() =>
      readSemanticPanel(input.panelA, input.reviewInputSha256)
    );
    panelB ??= await readIfPresent(() =>
      readSemanticPanel(input.panelB, input.reviewInputSha256)
    );
    executionAuthority ??= await readIfPresent(() =>
      readSemanticExecutionAuthority(
        input.executionAuthority,
        input.reviewInputSha256
      )
    );
    if (panelA && panelB && executionAuthority) {
      return { panels: [panelA, panelB], executionAuthority };
    }
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, REVIEW_POLL_INTERVAL_MS)
    );
  }
  throw new Error("calibration_semantic_review_timeout");
}

export async function readSemanticPanel(
  path: string,
  reviewInputSha256: string
): Promise<SemanticPanelFile> {
  const parsed = await readPrivateJsonFile(path);
  const expectedKeys = ["decisions", "reviewInputSha256"];
  if (
    Object.keys(parsed).sort().join("\0") !== expectedKeys.join("\0") ||
    typeof parsed.reviewInputSha256 !== "string" ||
    !Array.isArray(parsed.decisions)
  ) {
    throw new Error("calibration_semantic_panel_shape_invalid");
  }
  if (parsed.reviewInputSha256 !== reviewInputSha256) {
    throw new Error("calibration_semantic_panel_binding_mismatch");
  }
  return parsed as unknown as SemanticPanelFile;
}

export async function readSemanticExecutionAuthority(
  path: string,
  reviewInputSha256: string
): Promise<TrustedSemanticExecutionAuthority> {
  const parsed = await readPrivateJsonFile(path);
  return parseTrustedSemanticExecutionAuthority(parsed, reviewInputSha256);
}

export async function readSemanticReviewRequestHash(
  path: string
): Promise<string> {
  const parsed = await readPrivateJsonFile(path);
  if (
    typeof parsed.reviewInputSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(parsed.reviewInputSha256)
  ) {
    throw new Error("calibration_semantic_review_request_binding_invalid");
  }
  return parsed.reviewInputSha256;
}

async function readPrivateJsonFile(
  path: string
): Promise<Record<string, unknown>> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      (before.mode & 0o777) !== 0o600 ||
      before.uid !== process.getuid?.() ||
      before.nlink !== 1 ||
      before.size <= 0 ||
      before.size > MAX_REVIEW_FILE_BYTES
    ) {
      throw new Error("calibration_semantic_review_file_is_unsafe");
    }
    const source = await handle.readFile("utf8");
    const after = await handle.stat();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      after.nlink !== 1
    ) {
      throw new Error("calibration_semantic_review_file_changed_during_read");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new Error("calibration_semantic_review_json_invalid");
    }
    if (!isRecord(parsed)) {
      throw new Error("calibration_semantic_review_shape_invalid");
    }
    return parsed;
  } finally {
    await handle.close();
  }
}

async function canonicalFutureFile(cwd: string, path: string): Promise<string> {
  const requested = isAbsolute(path) ? path : resolve(cwd, path);
  const requestedParent = dirname(requested);
  const existingAncestor = await nearestExistingAncestor(requestedParent);
  assertSemanticPathOutsideGitWorktree(await realpath(existingAncestor));
  await mkdir(requestedParent, { recursive: true, mode: 0o700 });
  const canonicalParent = await realpath(requestedParent);
  assertSemanticPathOutsideGitWorktree(canonicalParent);
  return join(canonicalParent, basename(requested));
}

async function nearestExistingAncestor(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      await stat(current);
      return current;
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
    const parent = dirname(current);
    if (parent === current)
      throw new Error("calibration_semantic_parent_missing");
    current = parent;
  }
}

async function assertPrivateOwnedDirectory(path: string): Promise<void> {
  const directory = await stat(path);
  if (
    !directory.isDirectory() ||
    (directory.mode & 0o777) !== 0o700 ||
    directory.uid !== process.getuid?.()
  ) {
    throw new Error("calibration_semantic_review_parent_is_not_private");
  }
}

async function assertPathAbsent(path: string, label: string): Promise<void> {
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    await handle.close();
  } catch (error) {
    if (isMissingPathError(error)) return;
    throw error;
  }
  throw new Error(`calibration_${label.replaceAll(" ", "_")}_already_exists`);
}

function assertDistinctAndOutsideCapture(
  captureDirectory: string,
  filePaths: string[]
): void {
  if (new Set(filePaths).size !== filePaths.length) {
    throw new Error("calibration_semantic_review_paths_must_be_distinct");
  }
  if (filePaths.some((path) => isContainedBy(captureDirectory, path))) {
    throw new Error(
      "calibration_semantic_review_files_must_be_outside_capture"
    );
  }
}

function isContainedBy(parent: string, candidate: string): boolean {
  const child = relative(parent, candidate);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readIfPresent<T>(
  read: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
