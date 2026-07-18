import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

import {
  buildSemanticAdjudicationAuthorityEnvelope,
  buildSemanticAdjudicationPanel,
  buildSemanticAdjudicationReviewInput,
  sha256SyntheticCalibrationResponse,
  validateSemanticAdjudication,
  type SemanticAdjudicationDecision,
  type SemanticAdjudicationPublicReport,
  type SemanticAdjudicationReviewInput,
} from "./calibration-semantic-adjudication";

const SHA256 = /^[a-f0-9]{64}$/;
const TASK_PATH = /^\/root\/[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/;
const EXECUTION_ID = /^exec_[a-f0-9]{32}$/;
const PRIVATE_MANIFEST = "capture.private.json";
const ISSUED_CAPTURE_HANDLES = new WeakMap<
  PrivateSemanticCaptureHandle,
  IssuedCaptureState
>();

type VersionedHash = { version: string; sha256: string };

interface PrivateCaseRun {
  caseRefSha256: string;
  sanitizedCaseId: string;
  runIndex: number;
  output: null | {
    sanitizedOutputId: string;
    fileName: string;
    responseSha256: string;
  };
}

interface PrivateCaptureManifest {
  contractVersion: "evaluation-output-semantic-private-capture.v1";
  syntheticOnly: true;
  customerDataUsed: false;
  runId: string;
  approvedPlan: VersionedHash;
  corpus: VersionedHash;
  prompt: VersionedHash;
  schema: VersionedHash;
  modelVersion: string;
  caseRunSetSha256: string;
  captureBindingSha256: string;
  retentionExpiresAt: string;
  state: "open" | "finalized";
  caseRuns: PrivateCaseRun[];
  manifestSha256: string;
}

interface IssuedCaptureState {
  directory: string;
  directoryDevice: number;
  directoryInode: number;
  runId: string;
  approvedPlanSha256: string;
  caseRunSetSha256: string;
  captureBindingSha256: string;
  retentionExpiresAt: string;
  state: "open" | "finalized";
  caseRuns: PrivateCaseRun[];
  finalizedReview: null | {
    responseSetSha256: string;
    reviewInputSha256: string;
  };
}

export interface PrivateSemanticCaptureHandle {
  readonly directory: string;
  readonly runId: string;
  readonly approvedPlanSha256: string;
  readonly caseRunSetSha256: string;
  readonly captureBindingSha256: string;
  readonly retentionExpiresAt: string;
}

export interface SemanticReviewExecutionReceipt {
  contractVersion: "evaluation-output-semantic-execution-receipt.v1";
  reviewerKind: "agent_panel";
  humanReviewerIdentity: null;
  taskPath: string;
  executionId: string;
  reviewInputSha256: string;
  decisionSetSha256: string;
  outputCount: number;
  completedAt: string;
  executionReceiptSha256: string;
}

export interface TrustedSemanticExecutionAuthority {
  contractVersion: "evaluation-output-semantic-trusted-executions.v1";
  authorityKind: "trusted_operator_orchestrator";
  reviewInputSha256: string;
  verifiedExecutions: [
    SemanticReviewExecutionReceipt,
    SemanticReviewExecutionReceipt,
  ];
  authoritySha256: string;
}

export interface SemanticCapturePublicReport {
  contractVersion: "evaluation-output-semantic-capture-report.v1";
  syntheticOnly: true;
  customerDataUsed: false;
  rawOutputContentIncluded: false;
  privatePathsIncluded: false;
  captureBindingSha256: string;
  caseRunSetSha256: string;
  reviewInputSha256: string;
  executionReceiptSha256s: [string, string];
  semanticAdjudication: SemanticAdjudicationPublicReport;
  retention: {
    policy: "delete_after_terminal_report";
    rawCaptureDeleted: boolean;
  };
}

export function initializePrivateSemanticCapture(input: {
  directory: string;
  runId: string;
  approvedPlan: VersionedHash;
  corpus: VersionedHash;
  prompt: VersionedHash;
  schema: VersionedHash;
  modelVersion: string;
  caseRuns: Array<{ caseRef: string; runIndex: number }>;
  retentionExpiresAt: string;
}): PrivateSemanticCaptureHandle {
  const requestedDirectory = requireAbsolutePath(
    input.directory,
    "capture directory"
  );
  const canonicalParent = realpathSync(dirname(requestedDirectory));
  assertOutsideGitWorktree(canonicalParent);
  const directory = join(canonicalParent, basename(requestedDirectory));
  const retentionExpiresAt = requireIsoTimestamp(
    input.retentionExpiresAt,
    "retentionExpiresAt"
  );
  if (Date.parse(retentionExpiresAt) <= Date.now()) {
    throw new Error("Semantic capture retention must expire in the future");
  }
  if (!Array.isArray(input.caseRuns) || input.caseRuns.length === 0) {
    throw new Error("Semantic capture requires a non-empty case/run inventory");
  }
  const seen = new Set<string>();
  const caseRuns = input.caseRuns.map(({ caseRef, runIndex }) => {
    const caseRefSha256 = sha256(requireText(caseRef, "caseRef"));
    requireRunIndex(runIndex);
    const key = `${caseRefSha256}:${runIndex}`;
    if (seen.has(key)) {
      throw new Error("Semantic capture case/run inventory must be unique");
    }
    seen.add(key);
    return {
      caseRefSha256,
      sanitizedCaseId: `case_${randomBytes(16).toString("hex")}`,
      runIndex,
      output: null,
    };
  });
  caseRuns.sort(compareCaseRuns);
  const approvedPlan = requireVersionedHash(input.approvedPlan, "approvedPlan");
  const corpus = requireVersionedHash(input.corpus, "corpus");
  const prompt = requireVersionedHash(input.prompt, "prompt");
  const schema = requireVersionedHash(input.schema, "schema");
  const modelVersion = requireText(input.modelVersion, "modelVersion");
  const runId = requireText(input.runId, "runId");
  const caseRunSetSha256 = hashCanonical(
    caseRuns.map(({ caseRefSha256, runIndex }) => ({ caseRefSha256, runIndex }))
  );
  const captureBindingSha256 = hashCanonical({
    runId,
    approvedPlan,
    corpus,
    prompt,
    schema,
    modelVersion,
    caseRunSetSha256,
    retentionExpiresAt,
  });

  mkdirSync(directory, { recursive: false, mode: 0o700 });
  chmodSync(directory, 0o700);
  writeManifest(directory, {
    contractVersion: "evaluation-output-semantic-private-capture.v1",
    syntheticOnly: true,
    customerDataUsed: false,
    runId,
    approvedPlan,
    corpus,
    prompt,
    schema,
    modelVersion,
    caseRunSetSha256,
    captureBindingSha256,
    retentionExpiresAt,
    state: "open",
    caseRuns,
    manifestSha256: "",
  });
  const directoryStat = lstatSync(directory);
  const handle = Object.freeze({
    directory,
    runId,
    approvedPlanSha256: approvedPlan.sha256,
    caseRunSetSha256,
    captureBindingSha256,
    retentionExpiresAt,
  });
  ISSUED_CAPTURE_HANDLES.set(handle, {
    ...handle,
    directoryDevice: directoryStat.dev,
    directoryInode: directoryStat.ino,
    state: "open",
    caseRuns: cloneCaseRuns(caseRuns),
    finalizedReview: null,
  });
  return handle;
}

export function capturePrivateSyntheticOutput(
  handle: PrivateSemanticCaptureHandle,
  input: { caseRef: string; runIndex: number; rawResponse: Uint8Array }
): { sanitizedOutputId: string; responseSha256: string } {
  const issued = requireIssuedCaptureHandle(handle);
  if (
    !(input.rawResponse instanceof Uint8Array) ||
    input.rawResponse.length === 0
  ) {
    throw new Error("Semantic capture rawResponse must be non-empty bytes");
  }
  const manifest = readManifest(handle.directory, handle);
  if (manifest.state !== "open") {
    throw new Error("Semantic capture is already finalized");
  }
  const caseRefSha256 = sha256(requireText(input.caseRef, "caseRef"));
  requireRunIndex(input.runIndex);
  const entry = manifest.caseRuns.find(
    (candidate) =>
      candidate.caseRefSha256 === caseRefSha256 &&
      candidate.runIndex === input.runIndex
  );
  if (!entry) throw new Error("Semantic capture case/run is not authorized");
  if (entry.output)
    throw new Error("Semantic capture case/run already has output");
  const issuedEntry = issued.caseRuns.find(
    (candidate) =>
      candidate.caseRefSha256 === caseRefSha256 &&
      candidate.runIndex === input.runIndex
  );
  if (!issuedEntry || issuedEntry.output) {
    throw new Error("Semantic capture trusted case/run state mismatch");
  }

  const sanitizedOutputId = `out_${randomBytes(16).toString("hex")}`;
  const fileName = `${sanitizedOutputId}.response`;
  const responsePath = join(handle.directory, fileName);
  assertRetentionActive(manifest);
  writeFileSync(responsePath, input.rawResponse, { flag: "wx", mode: 0o600 });
  chmodSync(responsePath, 0o600);
  const responseSha256 = sha256SyntheticCalibrationResponse(input.rawResponse);
  entry.output = { sanitizedOutputId, fileName, responseSha256 };
  writeManifest(handle.directory, manifest);
  issuedEntry.output = { sanitizedOutputId, fileName, responseSha256 };
  return { sanitizedOutputId, responseSha256 };
}

export function finalizePrivateSemanticCapture(
  handle: PrivateSemanticCaptureHandle
): SemanticAdjudicationReviewInput {
  const issued = requireIssuedCaptureHandle(handle);
  const manifest = readManifest(handle.directory, handle);
  if (manifest.state !== "open") {
    throw new Error("Semantic capture is already finalized");
  }
  if (manifest.caseRuns.some(({ output }) => output === null)) {
    throw new Error("Semantic capture is missing an expected case/run output");
  }
  verifyRawOutputs(handle.directory, manifest);
  assertRetentionActive(manifest);
  const reviewInput = buildReviewInput(manifest);
  manifest.state = "finalized";
  writeManifest(handle.directory, manifest);
  issued.state = "finalized";
  issued.finalizedReview = Object.freeze({
    responseSetSha256: reviewInput.responseSetSha256,
    reviewInputSha256: reviewInput.reviewInputSha256,
  });
  return reviewInput;
}

export function buildSemanticReviewExecutionReceipt(input: {
  taskPath: string;
  executionId: string;
  reviewInputSha256: string;
  decisions: SemanticAdjudicationDecision[];
  completedAt: string;
}): SemanticReviewExecutionReceipt {
  if (!TASK_PATH.test(input.taskPath))
    throw new Error("Invalid agent taskPath");
  if (!EXECUTION_ID.test(input.executionId)) {
    throw new Error("Invalid opaque agent executionId");
  }
  requireSha256(input.reviewInputSha256, "reviewInputSha256");
  const completedAt = requireIsoTimestamp(input.completedAt, "completedAt");
  const body = {
    contractVersion: "evaluation-output-semantic-execution-receipt.v1" as const,
    reviewerKind: "agent_panel" as const,
    humanReviewerIdentity: null,
    taskPath: input.taskPath,
    executionId: input.executionId,
    reviewInputSha256: input.reviewInputSha256,
    decisionSetSha256: hashCanonical(input.decisions),
    outputCount: input.decisions.length,
    completedAt,
  };
  return { ...body, executionReceiptSha256: hashCanonical(body) };
}

/**
 * This is a trusted-boundary constructor, not an identity proof. The caller
 * must obtain both receipts from two completed orchestrator executions; panel
 * output or reviewer-authored JSON is never sufficient provenance.
 */
export function buildTrustedSemanticExecutionAuthority(input: {
  reviewInputSha256: string;
  verifiedExecutions: [
    SemanticReviewExecutionReceipt,
    SemanticReviewExecutionReceipt,
  ];
}): TrustedSemanticExecutionAuthority {
  requireSha256(input.reviewInputSha256, "reviewInputSha256");
  const executions = input.verifiedExecutions.map((receipt, index) =>
    parseExecutionReceipt(receipt, index)
  ) as [SemanticReviewExecutionReceipt, SemanticReviewExecutionReceipt];
  if (
    executions.some(
      ({ reviewInputSha256 }) => reviewInputSha256 !== input.reviewInputSha256
    ) ||
    executions[0].taskPath === executions[1].taskPath ||
    executions[0].executionId === executions[1].executionId ||
    executions[0].executionReceiptSha256 ===
      executions[1].executionReceiptSha256
  ) {
    throw new Error(
      "Trusted semantic authority requires two distinct executions"
    );
  }
  const body = {
    contractVersion:
      "evaluation-output-semantic-trusted-executions.v1" as const,
    authorityKind: "trusted_operator_orchestrator" as const,
    reviewInputSha256: input.reviewInputSha256,
    verifiedExecutions: executions,
  };
  return { ...body, authoritySha256: hashCanonical(body) };
}

export function completePrivateSemanticReview(input: {
  capture: PrivateSemanticCaptureHandle;
  publicReportPath: string;
  trustedExecutionAuthority: TrustedSemanticExecutionAuthority;
  panels: [
    { taskPath: string; decisions: SemanticAdjudicationDecision[] },
    { taskPath: string; decisions: SemanticAdjudicationDecision[] },
  ];
}): SemanticCapturePublicReport {
  const manifest = readManifest(input.capture.directory, input.capture);
  if (manifest.state !== "finalized") {
    throw new Error("Semantic capture must be finalized before review");
  }
  verifyRawOutputs(input.capture.directory, manifest);
  const reviewInput = buildReviewInput(manifest);
  const issued = requireIssuedCaptureHandle(input.capture);
  if (
    !issued.finalizedReview ||
    issued.finalizedReview.responseSetSha256 !==
      reviewInput.responseSetSha256 ||
    issued.finalizedReview.reviewInputSha256 !== reviewInput.reviewInputSha256
  ) {
    throw new Error("Semantic capture finalized review binding mismatch");
  }
  const trustedAuthority = parseTrustedExecutionAuthority(
    input.trustedExecutionAuthority,
    reviewInput.reviewInputSha256
  );
  const receipts = input.panels.map(({ taskPath, decisions }, index) =>
    verifyExecutionReceipt(
      trustedAuthority.verifiedExecutions.find(
        (receipt) => receipt.taskPath === taskPath
      ),
      decisions,
      reviewInput,
      index
    )
  ) as [SemanticReviewExecutionReceipt, SemanticReviewExecutionReceipt];
  if (
    receipts[0].taskPath === receipts[1].taskPath ||
    receipts[0].executionId === receipts[1].executionId ||
    receipts[0].executionReceiptSha256 === receipts[1].executionReceiptSha256
  ) {
    throw new Error(
      "Semantic review requires distinct actual panel executions"
    );
  }

  const authority = buildSemanticAdjudicationAuthorityEnvelope({
    approvedPlan: reviewInput.approvedPlan,
    runSha256: reviewInput.runSha256,
    responseSetSha256: reviewInput.responseSetSha256,
    reviewInputSha256: reviewInput.reviewInputSha256,
    expectedOutputs: reviewInput.outputs.map(
      ({ sanitizedOutputId, sanitizedCaseId, runIndex }) => ({
        sanitizedOutputId,
        sanitizedCaseId,
        runIndex,
      })
    ),
    panelExecutions: receipts.map(({ taskPath, executionReceiptSha256 }) => ({
      taskPath,
      executionReceiptSha256,
    })) as [
      { taskPath: string; executionReceiptSha256: string },
      { taskPath: string; executionReceiptSha256: string },
    ],
  });
  const panels = input.panels.map(({ decisions }, index) =>
    buildSemanticAdjudicationPanel({
      taskPath: receipts[index].taskPath,
      executionReceiptSha256: receipts[index].executionReceiptSha256,
      reviewInputSha256: reviewInput.reviewInputSha256,
      decisions,
    })
  ) as ReturnType<typeof buildSemanticAdjudicationPanel>[];
  const semanticAdjudication = validateSemanticAdjudication(
    reviewInput,
    {
      contractVersion: "evaluation-output-semantic-adjudication.v1",
      humanReviewerIdentity: null,
      reviewInputSha256: reviewInput.reviewInputSha256,
      authorityEnvelopeSha256: authority.authorityEnvelopeSha256,
      panels,
    },
    authority
  );
  if (semanticAdjudication.gate !== "passed") {
    throw new Error(
      "Semantic review did not pass; no public report was written"
    );
  }

  const report: SemanticCapturePublicReport = {
    contractVersion: "evaluation-output-semantic-capture-report.v1",
    syntheticOnly: true,
    customerDataUsed: false,
    rawOutputContentIncluded: false,
    privatePathsIncluded: false,
    captureBindingSha256: manifest.captureBindingSha256,
    caseRunSetSha256: manifest.caseRunSetSha256,
    reviewInputSha256: reviewInput.reviewInputSha256,
    executionReceiptSha256s: [
      receipts[0].executionReceiptSha256,
      receipts[1].executionReceiptSha256,
    ],
    semanticAdjudication,
    retention: {
      policy: "delete_after_terminal_report",
      rawCaptureDeleted: false,
    },
  };
  assertRetentionActive(manifest);
  const publicReportPath = resolvePublicReportPath(
    input.publicReportPath,
    input.capture.directory
  );
  writePublicReport(publicReportPath, report);
  cleanupPrivateSemanticCapture(input.capture);
  const completedReport: SemanticCapturePublicReport = {
    ...report,
    retention: { ...report.retention, rawCaptureDeleted: true },
  };
  replacePublicReport(publicReportPath, completedReport);
  return completedReport;
}

export function cleanupPrivateSemanticCapture(
  handle: PrivateSemanticCaptureHandle
): void {
  const issued = requireIssuedCaptureHandle(handle);
  assertIssuedCaptureDirectory(issued);
  rmSync(issued.directory, { recursive: true, force: false });
  ISSUED_CAPTURE_HANDLES.delete(handle);
}

export function purgeExpiredPrivateSemanticCapture(
  handle: PrivateSemanticCaptureHandle
): void {
  const issued = requireIssuedCaptureHandle(handle);
  if (Date.parse(issued.retentionExpiresAt) > Date.now()) {
    throw new Error("Semantic capture retention has not expired");
  }
  assertIssuedCaptureDirectory(issued);
  rmSync(issued.directory, { recursive: true, force: false });
  ISSUED_CAPTURE_HANDLES.delete(handle);
}

function assertIssuedCaptureDirectory(issued: IssuedCaptureState): void {
  const stat = lstatSync(issued.directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.dev !== issued.directoryDevice ||
    stat.ino !== issued.directoryInode
  ) {
    throw new Error("Issued semantic capture directory identity has changed");
  }
}

function assertRetentionActive(manifest: PrivateCaptureManifest): void {
  if (Date.parse(manifest.retentionExpiresAt) <= Date.now()) {
    throw new Error("Semantic capture retention has expired");
  }
}

function buildReviewInput(
  manifest: PrivateCaptureManifest
): SemanticAdjudicationReviewInput {
  return buildSemanticAdjudicationReviewInput({
    runId: manifest.runId,
    approvedPlan: manifest.approvedPlan,
    corpus: manifest.corpus,
    prompt: manifest.prompt,
    schema: manifest.schema,
    modelVersion: manifest.modelVersion,
    outputs: manifest.caseRuns
      .map(({ sanitizedCaseId, runIndex, output }) => {
        if (!output) throw new Error("Semantic capture output is missing");
        return {
          sanitizedOutputId: output.sanitizedOutputId,
          sanitizedCaseId,
          runIndex,
          responseSha256: output.responseSha256,
        };
      })
      .sort((left, right) =>
        left.sanitizedOutputId.localeCompare(right.sanitizedOutputId)
      ),
  });
}

function verifyExecutionReceipt(
  receipt: SemanticReviewExecutionReceipt | undefined,
  decisions: SemanticAdjudicationDecision[],
  reviewInput: SemanticAdjudicationReviewInput,
  index: number
): SemanticReviewExecutionReceipt {
  if (!receipt) {
    throw new Error(`Semantic panel:${index} has no trusted execution receipt`);
  }
  const rebuilt = buildSemanticReviewExecutionReceipt({
    taskPath: receipt.taskPath,
    executionId: receipt.executionId,
    reviewInputSha256: receipt.reviewInputSha256,
    decisions,
    completedAt: receipt.completedAt,
  });
  if (
    receipt.reviewInputSha256 !== reviewInput.reviewInputSha256 ||
    receipt.outputCount !== decisions.length ||
    receipt.decisionSetSha256 !== rebuilt.decisionSetSha256 ||
    receipt.executionReceiptSha256 !== rebuilt.executionReceiptSha256
  ) {
    throw new Error(`Semantic panel:${index} execution receipt mismatch`);
  }
  return rebuilt;
}

function parseExecutionReceipt(
  receipt: SemanticReviewExecutionReceipt,
  index: number
): SemanticReviewExecutionReceipt {
  assertExactKeys(
    receipt as unknown as Record<string, unknown>,
    [
      "contractVersion",
      "reviewerKind",
      "humanReviewerIdentity",
      "taskPath",
      "executionId",
      "reviewInputSha256",
      "decisionSetSha256",
      "outputCount",
      "completedAt",
      "executionReceiptSha256",
    ],
    `executionReceipt:${index}`
  );
  if (
    receipt.contractVersion !==
      "evaluation-output-semantic-execution-receipt.v1" ||
    receipt.reviewerKind !== "agent_panel" ||
    receipt.humanReviewerIdentity !== null
  ) {
    throw new Error(`Invalid semantic execution receipt:${index} boundary`);
  }
  const rebuiltBody = {
    contractVersion: receipt.contractVersion,
    reviewerKind: receipt.reviewerKind,
    humanReviewerIdentity: null,
    taskPath: TASK_PATH.test(receipt.taskPath) ? receipt.taskPath : "",
    executionId: EXECUTION_ID.test(receipt.executionId)
      ? receipt.executionId
      : "",
    reviewInputSha256: requireSha256(
      receipt.reviewInputSha256,
      `executionReceipt:${index}.reviewInputSha256`
    ),
    decisionSetSha256: requireSha256(
      receipt.decisionSetSha256,
      `executionReceipt:${index}.decisionSetSha256`
    ),
    outputCount: receipt.outputCount,
    completedAt: requireIsoTimestamp(
      receipt.completedAt,
      `executionReceipt:${index}.completedAt`
    ),
  };
  if (!rebuiltBody.taskPath || !rebuiltBody.executionId) {
    throw new Error(`Invalid semantic execution receipt:${index} identity`);
  }
  if (
    !Number.isInteger(rebuiltBody.outputCount) ||
    rebuiltBody.outputCount < 1
  ) {
    throw new Error(`Invalid semantic execution receipt:${index} outputCount`);
  }
  if (hashCanonical(rebuiltBody) !== receipt.executionReceiptSha256) {
    throw new Error(`Semantic execution receipt:${index} hash mismatch`);
  }
  return {
    ...rebuiltBody,
    executionReceiptSha256: receipt.executionReceiptSha256,
  };
}

function parseTrustedExecutionAuthority(
  authority: TrustedSemanticExecutionAuthority,
  reviewInputSha256: string
): TrustedSemanticExecutionAuthority {
  assertExactKeys(
    authority as unknown as Record<string, unknown>,
    [
      "contractVersion",
      "authorityKind",
      "reviewInputSha256",
      "verifiedExecutions",
      "authoritySha256",
    ],
    "trustedExecutionAuthority"
  );
  const rebuilt = buildTrustedSemanticExecutionAuthority({
    reviewInputSha256: authority.reviewInputSha256,
    verifiedExecutions: authority.verifiedExecutions,
  });
  if (
    authority.reviewInputSha256 !== reviewInputSha256 ||
    authority.authoritySha256 !== rebuilt.authoritySha256
  ) {
    throw new Error("Trusted semantic execution authority mismatch");
  }
  return rebuilt;
}

function verifyRawOutputs(
  directory: string,
  manifest: PrivateCaptureManifest
): void {
  for (const { output } of manifest.caseRuns) {
    if (!output) continue;
    const path = join(directory, output.fileName);
    const stat = lstatSync(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o777) !== 0o600
    ) {
      throw new Error("Semantic capture output must be a private regular file");
    }
    if (
      sha256SyntheticCalibrationResponse(readFileSync(path)) !==
      output.responseSha256
    ) {
      throw new Error("Semantic capture response hash mismatch");
    }
  }
}

function readManifest(
  directoryInput: string,
  expected: PrivateSemanticCaptureHandle,
  allowExpired = false
): PrivateCaptureManifest {
  const issued = requireIssuedCaptureHandle(expected);
  const directory = requireAbsolutePath(directoryInput, "capture directory");
  if (directory !== issued.directory) {
    throw new Error("Semantic capture handle directory mismatch");
  }
  assertIssuedCaptureDirectory(issued);
  const directoryStat = lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error("Semantic capture directory must be a real directory");
  }
  if ((directoryStat.mode & 0o777) !== 0o700) {
    throw new Error("Semantic capture directory mode must be 0700");
  }
  const path = join(directory, PRIVATE_MANIFEST);
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o777) !== 0o600
  ) {
    throw new Error("Semantic capture manifest must be a private regular file");
  }
  const manifest = parsePrivateManifest(JSON.parse(readFileSync(path, "utf8")));
  const { manifestSha256, ...body } = manifest;
  requireSha256(manifestSha256, "manifestSha256");
  if (hashCanonical(body) !== manifestSha256) {
    throw new Error("Semantic capture manifest hash mismatch");
  }
  if (
    manifest.runId !== issued.runId ||
    manifest.approvedPlan.sha256 !== issued.approvedPlanSha256 ||
    manifest.caseRunSetSha256 !== issued.caseRunSetSha256 ||
    manifest.captureBindingSha256 !== issued.captureBindingSha256 ||
    manifest.retentionExpiresAt !== issued.retentionExpiresAt
  ) {
    throw new Error("Semantic capture manifest does not match trusted handle");
  }
  if (
    manifest.state !== issued.state ||
    canonicalJson(manifest.caseRuns) !== canonicalJson(issued.caseRuns)
  ) {
    throw new Error("Semantic capture manifest does not match trusted state");
  }
  if (!allowExpired && Date.parse(manifest.retentionExpiresAt) <= Date.now()) {
    throw new Error("Semantic capture retention has expired");
  }
  return manifest;
}

function parsePrivateManifest(input: unknown): PrivateCaptureManifest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid semantic capture manifest");
  }
  const manifest = input as Record<string, unknown>;
  assertExactKeys(
    manifest,
    [
      "contractVersion",
      "syntheticOnly",
      "customerDataUsed",
      "runId",
      "approvedPlan",
      "corpus",
      "prompt",
      "schema",
      "modelVersion",
      "caseRunSetSha256",
      "captureBindingSha256",
      "retentionExpiresAt",
      "state",
      "caseRuns",
      "manifestSha256",
    ],
    "privateManifest"
  );
  if (
    manifest.contractVersion !==
      "evaluation-output-semantic-private-capture.v1" ||
    manifest.syntheticOnly !== true ||
    manifest.customerDataUsed !== false ||
    (manifest.state !== "open" && manifest.state !== "finalized") ||
    !Array.isArray(manifest.caseRuns) ||
    manifest.caseRuns.length === 0
  ) {
    throw new Error("Invalid semantic capture manifest boundary");
  }
  const seenCases = new Set<string>();
  const seenOutputs = new Set<string>();
  const caseRuns = manifest.caseRuns.map((unknownCaseRun, index) => {
    if (
      !unknownCaseRun ||
      typeof unknownCaseRun !== "object" ||
      Array.isArray(unknownCaseRun)
    ) {
      throw new Error(`Invalid semantic capture caseRun:${index}`);
    }
    const caseRun = unknownCaseRun as Record<string, unknown>;
    assertExactKeys(
      caseRun,
      ["caseRefSha256", "sanitizedCaseId", "runIndex", "output"],
      `caseRun:${index}`
    );
    const caseRefSha256 = requireSha256(
      caseRun.caseRefSha256,
      `caseRun:${index}.caseRefSha256`
    );
    if (
      typeof caseRun.sanitizedCaseId !== "string" ||
      !/^case_[a-f0-9]{32}$/.test(caseRun.sanitizedCaseId)
    ) {
      throw new Error(
        `Invalid semantic capture caseRun:${index}.sanitizedCaseId`
      );
    }
    requireRunIndex(caseRun.runIndex);
    const caseKey = `${caseRefSha256}:${caseRun.runIndex}`;
    if (seenCases.has(caseKey))
      throw new Error("Semantic capture case/run inventory must be unique");
    seenCases.add(caseKey);
    let output: PrivateCaseRun["output"] = null;
    if (caseRun.output !== null) {
      if (
        !caseRun.output ||
        typeof caseRun.output !== "object" ||
        Array.isArray(caseRun.output)
      ) {
        throw new Error(`Invalid semantic capture caseRun:${index}.output`);
      }
      const candidate = caseRun.output as Record<string, unknown>;
      assertExactKeys(
        candidate,
        ["sanitizedOutputId", "fileName", "responseSha256"],
        `caseRun:${index}.output`
      );
      if (
        typeof candidate.sanitizedOutputId !== "string" ||
        !/^out_[a-f0-9]{32}$/.test(candidate.sanitizedOutputId)
      ) {
        throw new Error(
          `Invalid semantic capture caseRun:${index}.sanitizedOutputId`
        );
      }
      if (candidate.fileName !== `${candidate.sanitizedOutputId}.response`) {
        throw new Error("Semantic capture output filename is not canonical");
      }
      if (seenOutputs.has(candidate.sanitizedOutputId)) {
        throw new Error("Semantic capture output IDs must be unique");
      }
      seenOutputs.add(candidate.sanitizedOutputId);
      output = {
        sanitizedOutputId: candidate.sanitizedOutputId,
        fileName: candidate.fileName,
        responseSha256: requireSha256(
          candidate.responseSha256,
          `caseRun:${index}.responseSha256`
        ),
      };
    }
    return {
      caseRefSha256,
      sanitizedCaseId: caseRun.sanitizedCaseId,
      runIndex: caseRun.runIndex,
      output,
    };
  });
  const parsed: PrivateCaptureManifest = {
    contractVersion: "evaluation-output-semantic-private-capture.v1",
    syntheticOnly: true,
    customerDataUsed: false,
    runId: requireText(manifest.runId, "runId"),
    approvedPlan: requireVersionedHash(
      manifest.approvedPlan as VersionedHash,
      "approvedPlan"
    ),
    corpus: requireVersionedHash(manifest.corpus as VersionedHash, "corpus"),
    prompt: requireVersionedHash(manifest.prompt as VersionedHash, "prompt"),
    schema: requireVersionedHash(manifest.schema as VersionedHash, "schema"),
    modelVersion: requireText(manifest.modelVersion, "modelVersion"),
    caseRunSetSha256: requireSha256(
      manifest.caseRunSetSha256,
      "caseRunSetSha256"
    ),
    captureBindingSha256: requireSha256(
      manifest.captureBindingSha256,
      "captureBindingSha256"
    ),
    retentionExpiresAt: requireIsoTimestamp(
      manifest.retentionExpiresAt,
      "retentionExpiresAt"
    ),
    state: manifest.state,
    caseRuns,
    manifestSha256: requireSha256(manifest.manifestSha256, "manifestSha256"),
  };
  const expectedCaseSet = hashCanonical(
    caseRuns.map(({ caseRefSha256, runIndex }) => ({ caseRefSha256, runIndex }))
  );
  const expectedBinding = hashCanonical({
    runId: parsed.runId,
    approvedPlan: parsed.approvedPlan,
    corpus: parsed.corpus,
    prompt: parsed.prompt,
    schema: parsed.schema,
    modelVersion: parsed.modelVersion,
    caseRunSetSha256: parsed.caseRunSetSha256,
    retentionExpiresAt: parsed.retentionExpiresAt,
  });
  if (
    parsed.caseRunSetSha256 !== expectedCaseSet ||
    parsed.captureBindingSha256 !== expectedBinding
  ) {
    throw new Error("Semantic capture durable binding mismatch");
  }
  return parsed;
}

function writeManifest(
  directory: string,
  manifest: PrivateCaptureManifest
): void {
  const body = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== "manifestSha256")
  );
  const complete = { ...body, manifestSha256: hashCanonical(body) };
  const destination = join(directory, PRIVATE_MANIFEST);
  const temporary = join(
    directory,
    `.manifest-${randomBytes(8).toString("hex")}.tmp`
  );
  writeFileSync(temporary, `${JSON.stringify(complete)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(temporary, 0o600);
  renameSync(temporary, destination);
}

function writePublicReport(
  pathInput: string,
  report: SemanticCapturePublicReport
): void {
  const path = requireAbsolutePath(pathInput, "public report path");
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx",
    mode: 0o644,
  });
}

function replacePublicReport(
  pathInput: string,
  report: SemanticCapturePublicReport
): void {
  const path = requireAbsolutePath(pathInput, "public report path");
  const temporary = `${path}.completed-${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx",
    mode: 0o644,
  });
  renameSync(temporary, path);
}

function resolvePublicReportPath(
  reportPathInput: string,
  captureDirectoryInput: string
): string {
  const reportPath = requireAbsolutePath(reportPathInput, "public report path");
  const captureDirectory = requireAbsolutePath(
    captureDirectoryInput,
    "capture directory"
  );
  const reportParent = dirname(reportPath);
  const canonicalReportParent = realpathSync(reportParent);
  const reportParentStat = lstatSync(canonicalReportParent);
  if (!reportParentStat.isDirectory()) {
    throw new Error(
      "Semantic public report parent must be an existing directory"
    );
  }
  const canonicalReportPath = join(canonicalReportParent, basename(reportPath));
  const canonicalCaptureDirectory = realpathSync(captureDirectory);
  if (
    canonicalReportPath === canonicalCaptureDirectory ||
    canonicalReportPath.startsWith(`${canonicalCaptureDirectory}${sep}`)
  ) {
    throw new Error(
      "Semantic public report must be outside the private capture directory"
    );
  }
  return canonicalReportPath;
}

function requireIssuedCaptureHandle(
  handle: PrivateSemanticCaptureHandle
): NonNullable<ReturnType<typeof ISSUED_CAPTURE_HANDLES.get>> {
  if (!handle || typeof handle !== "object") {
    throw new Error("Semantic capture handle was not issued by this process");
  }
  const issued = ISSUED_CAPTURE_HANDLES.get(handle);
  if (!issued) {
    throw new Error("Semantic capture handle was not issued by this process");
  }
  return issued;
}

function assertOutsideGitWorktree(startDirectory: string): void {
  let current = startDirectory;
  while (true) {
    if (existsSync(join(current, ".git"))) {
      throw new Error(
        "Semantic private capture cannot be inside a Git worktree"
      );
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function compareCaseRuns(left: PrivateCaseRun, right: PrivateCaseRun): number {
  return (
    left.caseRefSha256.localeCompare(right.caseRefSha256) ||
    left.runIndex - right.runIndex
  );
}

function cloneCaseRuns(caseRuns: PrivateCaseRun[]): PrivateCaseRun[] {
  return caseRuns.map((caseRun) => ({
    ...caseRun,
    output: caseRun.output ? { ...caseRun.output } : null,
  }));
}

function requireVersionedHash(
  input: VersionedHash,
  field: string
): VersionedHash {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Invalid semantic capture ${field}`);
  }
  assertExactKeys(
    input as unknown as Record<string, unknown>,
    ["version", "sha256"],
    field
  );
  return {
    version: requireText(input?.version, `${field}.version`),
    sha256: requireSha256(input?.sha256, `${field}.sha256`),
  };
}

function assertExactKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  field: string
): void {
  const actual = Object.keys(input).sort();
  const expected = [...allowed].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`Invalid semantic capture ${field} fields`);
  }
}

function requireSha256(input: unknown, field: string): string {
  if (typeof input !== "string" || !SHA256.test(input)) {
    throw new Error(`Invalid semantic capture ${field}`);
  }
  return input;
}

function requireText(input: unknown, field: string): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input
  ) {
    throw new Error(`Invalid semantic capture ${field}`);
  }
  return input;
}

function requireRunIndex(input: unknown): asserts input is number {
  if (!Number.isInteger(input) || (input as number) < 0) {
    throw new Error("Invalid semantic capture runIndex");
  }
}

function requireIsoTimestamp(input: unknown, field: string): string {
  const value = requireText(input, field);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`Invalid semantic capture ${field}`);
  }
  return value;
}

function requireAbsolutePath(input: unknown, field: string): string {
  const value = requireText(input, field);
  if (!isAbsolute(value) || resolve(value) !== value) {
    throw new Error(`Semantic ${field} must be an absolute normalized path`);
  }
  return value;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
