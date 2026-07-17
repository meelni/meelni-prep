import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";

import {
  buildSemanticReviewExecutionReceipt,
  buildTrustedSemanticExecutionAuthority,
  capturePrivateSyntheticOutput,
  cleanupPrivateSemanticCapture,
  completePrivateSemanticReview,
  finalizePrivateSemanticCapture,
  initializePrivateSemanticCapture,
  purgeExpiredPrivateSemanticCapture,
  type PrivateSemanticCaptureHandle,
} from "./calibration-semantic-capture";
import type {
  SemanticAdjudicationDecision,
  SemanticAdjudicationReviewInput,
} from "./calibration-semantic-adjudication";

test("provider-free capture binds exact bytes and emits only a sanitized report", () => {
  const fixture = createFixture();
  const privateFileNames = readdirSync(fixture.capture.directory);
  assert.equal(statSync(fixture.capture.directory).mode & 0o777, 0o700);
  for (const name of readdirSync(fixture.capture.directory)) {
    assert.equal(
      statSync(join(fixture.capture.directory, name)).mode & 0o777,
      0o600
    );
  }

  const review = reviewFor(fixture.input, fixture.accepted);
  const report = completePrivateSemanticReview({
    capture: fixture.capture,
    publicReportPath: fixture.reportPath,
    ...review,
  });

  assert.equal(report.semanticAdjudication.gate, "passed");
  assert.equal(report.syntheticOnly, true);
  assert.equal(report.customerDataUsed, false);
  assert.equal(report.rawOutputContentIncluded, false);
  assert.equal(report.privatePathsIncluded, false);
  assert.equal(report.retention.rawCaptureDeleted, true);
  assert.equal(existsSync(fixture.capture.directory), false);
  const serialized = readFileSync(fixture.reportPath, "utf8");
  assert.deepEqual(JSON.parse(serialized), report);
  assert.equal(statSync(fixture.reportPath).mode & 0o777, 0o644);
  assert.deepEqual(Object.keys(report).sort(), [
    "captureBindingSha256",
    "caseRunSetSha256",
    "contractVersion",
    "customerDataUsed",
    "executionReceiptSha256s",
    "privatePathsIncluded",
    "rawOutputContentIncluded",
    "retention",
    "reviewInputSha256",
    "semanticAdjudication",
    "syntheticOnly",
  ]);
  assert.deepEqual(Object.keys(report.retention).sort(), [
    "policy",
    "rawCaptureDeleted",
  ]);
  assert.equal(serialized.includes("synthetic response one"), false);
  assert.equal(serialized.includes("private-product-sense-case"), false);
  assert.equal(serialized.includes(fixture.capture.directory), false);
  assert.equal(serialized.includes("sanitizedCaseId"), false);
  assert.equal(serialized.includes("runIndex"), false);
  for (const privateFileName of privateFileNames) {
    assert.equal(serialized.includes(privateFileName), false);
  }
  assertPublicReportStructure(report);
  assert.equal(
    readdirSync(fixture.root).some((name) => name.includes(".tmp")),
    false
  );
  assert.throws(
    () => cleanupPrivateSemanticCapture(fixture.capture),
    /was not issued by this process/
  );
  cleanupRoot(fixture.root);
});

test("recomputed manifests cannot substitute captured bytes or finalized review bindings", () => {
  const openRoot = mkdtempSync(
    join(tmpdir(), "meelni-sav252-substitute-open-")
  );
  const openCapture = initialize(openRoot, [
    { caseRef: "expected-case", runIndex: 0 },
  ]);
  capturePrivateSyntheticOutput(openCapture, {
    caseRef: "expected-case",
    runIndex: 0,
    rawResponse: Buffer.from("original synthetic bytes"),
  });
  rewriteCapturedOutput(openCapture, Buffer.from("substituted bytes"));
  assert.throws(
    () => finalizePrivateSemanticCapture(openCapture),
    /manifest does not match trusted state/
  );
  assert.equal(existsSync(openCapture.directory), true);
  cleanupPrivateSemanticCapture(openCapture);
  cleanupRoot(openRoot);

  const finalized = createFixture();
  rewriteCapturedOutput(finalized.capture, Buffer.from("post-finalize swap"));
  assert.throws(
    () =>
      completePrivateSemanticReview({
        capture: finalized.capture,
        publicReportPath: finalized.reportPath,
        ...reviewFor(finalized.input, finalized.accepted),
      }),
    /manifest does not match trusted state|finalized review binding mismatch/
  );
  assert.equal(existsSync(finalized.reportPath), false);
  cleanupPrivateSemanticCapture(finalized.capture);
  cleanupRoot(finalized.root);
});

test("missing or unauthorized case/run output cannot be finalized", () => {
  const root = mkdtempSync(join(tmpdir(), "meelni-sav252-missing-"));
  const capture = initialize(root, [{ caseRef: "expected-case", runIndex: 0 }]);
  assert.throws(
    () =>
      capturePrivateSyntheticOutput(capture, {
        caseRef: "different-case",
        runIndex: 0,
        rawResponse: Buffer.from("synthetic"),
      }),
    /not authorized/
  );
  assert.throws(
    () => finalizePrivateSemanticCapture(capture),
    /missing an expected/
  );
  cleanupPrivateSemanticCapture(capture);
  cleanupRoot(root);
});

test("raw-byte and private-manifest mutations fail before authority construction", () => {
  const rawMutation = createFixture();
  const responseName = readdirSync(rawMutation.capture.directory).find((name) =>
    name.endsWith(".response")
  );
  assert.ok(responseName);
  writeFileSync(join(rawMutation.capture.directory, responseName), "mutated", {
    mode: 0o600,
  });
  assert.throws(
    () =>
      completePrivateSemanticReview({
        capture: rawMutation.capture,
        publicReportPath: rawMutation.reportPath,
        ...reviewFor(rawMutation.input, rawMutation.accepted),
      }),
    /response hash mismatch/
  );
  assert.equal(existsSync(rawMutation.reportPath), false);
  cleanupPrivateSemanticCapture(rawMutation.capture);
  cleanupRoot(rawMutation.root);

  const manifestMutation = createFixture();
  const manifestPath = join(
    manifestMutation.capture.directory,
    "capture.private.json"
  );
  const manifest = readFileSync(manifestPath, "utf8").replace(
    '"modelVersion":"synthetic-model.v1"',
    '"modelVersion":"swapped-model.v1"'
  );
  writeFileSync(manifestPath, manifest, { mode: 0o600 });
  assert.throws(
    () => finalizePrivateSemanticCapture(manifestMutation.capture),
    /durable binding mismatch|manifest hash mismatch/
  );
  rmSync(manifestMutation.root, { recursive: true, force: true });

  const traversal = createFixture();
  const traversalManifestPath = join(
    traversal.capture.directory,
    "capture.private.json"
  );
  const traversalManifest = JSON.parse(
    readFileSync(traversalManifestPath, "utf8")
  );
  traversalManifest.caseRuns[0].output.fileName = "../outside.response";
  const { manifestSha256: _oldHash, ...traversalBody } = traversalManifest;
  traversalManifest.manifestSha256 = hashCanonical(traversalBody);
  writeFileSync(traversalManifestPath, JSON.stringify(traversalManifest), {
    mode: 0o600,
  });
  assert.throws(
    () => finalizePrivateSemanticCapture(traversal.capture),
    /filename is not canonical/
  );
  rmSync(traversal.root, { recursive: true, force: true });

  const subset = createFixture();
  const subsetManifestPath = join(
    subset.capture.directory,
    "capture.private.json"
  );
  const subsetManifest = JSON.parse(readFileSync(subsetManifestPath, "utf8"));
  subsetManifest.caseRuns = subsetManifest.caseRuns.slice(0, 1);
  subsetManifest.caseRunSetSha256 = hashCanonical(
    subsetManifest.caseRuns.map(
      ({
        caseRefSha256,
        runIndex,
      }: {
        caseRefSha256: string;
        runIndex: number;
      }) => ({
        caseRefSha256,
        runIndex,
      })
    )
  );
  subsetManifest.captureBindingSha256 = hashCanonical({
    runId: subsetManifest.runId,
    approvedPlan: subsetManifest.approvedPlan,
    corpus: subsetManifest.corpus,
    prompt: subsetManifest.prompt,
    schema: subsetManifest.schema,
    modelVersion: subsetManifest.modelVersion,
    caseRunSetSha256: subsetManifest.caseRunSetSha256,
    retentionExpiresAt: subsetManifest.retentionExpiresAt,
  });
  const { manifestSha256: _subsetHash, ...subsetBody } = subsetManifest;
  subsetManifest.manifestSha256 = hashCanonical(subsetBody);
  writeFileSync(subsetManifestPath, JSON.stringify(subsetManifest), {
    mode: 0o600,
  });
  const reconstructedHandle = { ...subset.capture };
  assert.throws(
    () => finalizePrivateSemanticCapture(reconstructedHandle),
    /was not issued by this process/
  );
  assert.throws(
    () => finalizePrivateSemanticCapture(subset.capture),
    /does not match trusted handle/
  );
  rmSync(subset.root, { recursive: true, force: true });
});

test("subset and forged execution provenance produce no report", () => {
  const subset = createFixture();
  const subsetDecisions = subset.accepted.slice(0, 1);
  const subsetReview = reviewFor(subset.input, subsetDecisions);
  assert.throws(
    () =>
      completePrivateSemanticReview({
        capture: subset.capture,
        publicReportPath: subset.reportPath,
        ...subsetReview,
      }),
    /output coverage mismatch/
  );
  assert.equal(existsSync(subset.reportPath), false);
  cleanupPrivateSemanticCapture(subset.capture);
  cleanupRoot(subset.root);

  const forged = createFixture();
  const forgedReview = reviewFor(forged.input, forged.accepted);
  forgedReview.trustedExecutionAuthority.verifiedExecutions[0].executionReceiptSha256 =
    "f".repeat(64);
  assert.throws(
    () =>
      completePrivateSemanticReview({
        capture: forged.capture,
        publicReportPath: forged.reportPath,
        ...forgedReview,
      }),
    /execution receipt:0 hash mismatch|execution receipt mismatch/
  );
  assert.equal(existsSync(forged.reportPath), false);
  cleanupPrivateSemanticCapture(forged.capture);
  cleanupRoot(forged.root);
});

test("panel disagreement and unanimous semantic rejection produce no public report", () => {
  const disagreement = createFixture();
  const rejected = rejection(disagreement.accepted);
  const disagreeingReceipts = [
    panel("panel_one", "1", disagreement.input, disagreement.accepted),
    panel("panel_two", "2", disagreement.input, rejected),
  ] as const;
  const disagreeingReview = {
    trustedExecutionAuthority: buildTrustedSemanticExecutionAuthority({
      reviewInputSha256: disagreement.input.reviewInputSha256,
      verifiedExecutions: [
        disagreeingReceipts[0].receipt,
        disagreeingReceipts[1].receipt,
      ],
    }),
    panels: disagreeingReceipts.map(({ receipt, decisions }) => ({
      taskPath: receipt.taskPath,
      decisions,
    })) as [
      { taskPath: string; decisions: SemanticAdjudicationDecision[] },
      { taskPath: string; decisions: SemanticAdjudicationDecision[] },
    ],
  };
  assert.throws(
    () =>
      completePrivateSemanticReview({
        capture: disagreement.capture,
        publicReportPath: disagreement.reportPath,
        ...disagreeingReview,
      }),
    /panels disagree/
  );
  assert.equal(existsSync(disagreement.reportPath), false);
  cleanupPrivateSemanticCapture(disagreement.capture);
  cleanupRoot(disagreement.root);

  const failed = createFixture();
  const failedReview = reviewFor(failed.input, rejection(failed.accepted));
  assert.throws(
    () =>
      completePrivateSemanticReview({
        capture: failed.capture,
        publicReportPath: failed.reportPath,
        ...failedReview,
      }),
    /did not pass/
  );
  assert.equal(existsSync(failed.reportPath), false);
  cleanupPrivateSemanticCapture(failed.capture);
  cleanupRoot(failed.root);
});

test("report publication failure preserves the private capture and a false deletion claim", () => {
  const fixture = createFixture();
  writeFileSync(fixture.reportPath, "already exists", { mode: 0o600 });
  assert.throws(
    () =>
      completePrivateSemanticReview({
        capture: fixture.capture,
        publicReportPath: fixture.reportPath,
        ...reviewFor(fixture.input, fixture.accepted),
      }),
    /EEXIST/
  );
  assert.equal(existsSync(fixture.capture.directory), true);
  assert.equal(readFileSync(fixture.reportPath, "utf8"), "already exists");
  cleanupPrivateSemanticCapture(fixture.capture);
  cleanupRoot(fixture.root);
});

test("canonical report containment rejects a symlinked parent into capture", () => {
  const fixture = createFixture();
  const privateReportDirectory = join(fixture.capture.directory, "reports");
  mkdirSync(privateReportDirectory, { mode: 0o700 });
  const reportParentLink = join(fixture.root, "report-link");
  symlinkSync(privateReportDirectory, reportParentLink, "dir");
  assert.throws(
    () =>
      completePrivateSemanticReview({
        capture: fixture.capture,
        publicReportPath: join(reportParentLink, "public.json"),
        ...reviewFor(fixture.input, fixture.accepted),
      }),
    /outside the private capture/
  );
  assert.equal(existsSync(fixture.capture.directory), true);
  cleanupPrivateSemanticCapture(fixture.capture);
  cleanupRoot(fixture.root);
});

test("cleanup and expired purge refuse a replacement directory at the issued path", (t) => {
  let now = Date.parse("2026-07-17T12:00:00.000Z");
  t.mock.method(Date, "now", () => now);

  for (const operation of ["cleanup", "purge"] as const) {
    const root = mkdtempSync(join(tmpdir(), `meelni-sav252-${operation}-`));
    const capture = initializePrivateSemanticCapture({
      ...baseInitialization(root, [
        { caseRef: `${operation}-case`, runIndex: 0 },
      ]),
      retentionExpiresAt: new Date(now + 1_000).toISOString(),
    });
    const relocated = `${capture.directory}-relocated`;
    renameSync(capture.directory, relocated);
    mkdirSync(capture.directory, { mode: 0o700 });
    const sentinel = join(capture.directory, "replacement-sentinel");
    writeFileSync(sentinel, "preserve replacement", { mode: 0o600 });
    if (operation === "purge") now += 1_000;

    assert.throws(
      () =>
        operation === "cleanup"
          ? cleanupPrivateSemanticCapture(capture)
          : purgeExpiredPrivateSemanticCapture(capture),
      /directory identity has changed/
    );
    assert.equal(readFileSync(sentinel, "utf8"), "preserve replacement");
    assert.equal(existsSync(relocated), true);

    rmSync(capture.directory, { recursive: true, force: true });
    renameSync(relocated, capture.directory);
    cleanupPrivateSemanticCapture(capture);
    cleanupRoot(root);
    now += 10_000;
  }
});

test("expiry is enforced at the exact boundary and purge remains available", (t) => {
  let now = Date.parse("2026-07-17T13:00:00.000Z");
  t.mock.method(Date, "now", () => now);
  const root = mkdtempSync(join(tmpdir(), "meelni-sav252-expiry-"));
  const expiresAt = now + 1_000;
  const capture = initializePrivateSemanticCapture({
    ...baseInitialization(root, [{ caseRef: "expiry-case", runIndex: 0 }]),
    retentionExpiresAt: new Date(expiresAt).toISOString(),
  });
  capturePrivateSyntheticOutput(capture, {
    caseRef: "expiry-case",
    runIndex: 0,
    rawResponse: Buffer.from("synthetic expiry output"),
  });
  now = expiresAt - 1;
  assert.throws(
    () => purgeExpiredPrivateSemanticCapture(capture),
    /retention has not expired/
  );
  const input = finalizePrivateSemanticCapture(capture);
  now = expiresAt;
  assert.throws(
    () =>
      completePrivateSemanticReview({
        capture,
        publicReportPath: join(root, "expired-public.json"),
        ...reviewFor(
          input,
          input.outputs.map((output) => ({
            ...output,
            evidenceRelevance: "relevant" as const,
            observationAccuracy: "accurate" as const,
            nextStepUsefulness: "useful" as const,
            dimensionFit: "fits" as const,
            alternativeDisposition: "not_applicable" as const,
            overallDecision: "accept" as const,
          }))
        ),
      }),
    /retention has expired/
  );
  writeFileSync(
    join(capture.directory, "capture.private.json"),
    "corrupted after expiry",
    { mode: 0o600 }
  );
  purgeExpiredPrivateSemanticCapture(capture);
  assert.equal(existsSync(capture.directory), false);
  cleanupRoot(root);

  const captureRoot = mkdtempSync(
    join(tmpdir(), "meelni-sav252-expiry-capture-")
  );
  now += 1_000;
  const captureAtBoundary = initializePrivateSemanticCapture({
    ...baseInitialization(captureRoot, [
      { caseRef: "boundary-case", runIndex: 0 },
    ]),
    retentionExpiresAt: new Date(now + 1_000).toISOString(),
  });
  now += 1_000;
  assert.throws(
    () =>
      capturePrivateSyntheticOutput(captureAtBoundary, {
        caseRef: "boundary-case",
        runIndex: 0,
        rawResponse: Buffer.from("too late"),
      }),
    /retention has expired/
  );
  purgeExpiredPrivateSemanticCapture(captureAtBoundary);
  cleanupRoot(captureRoot);
});

test("execution receipts accept canonical nested agent task paths", () => {
  const fixture = createFixture();
  const nested = panel(
    "review/panel_one",
    "9",
    fixture.input,
    fixture.accepted
  );
  assert.equal(nested.receipt.taskPath, "/root/review/panel_one");
  cleanupPrivateSemanticCapture(fixture.capture);
  cleanupRoot(fixture.root);
});

test("capture initialization rejects direct and symlinked Git descendants", () => {
  const root = mkdtempSync(join(tmpdir(), "meelni-sav252-git-"));
  const repository = join(root, "repository");
  const nested = join(repository, "private-parent");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(repository, ".git"), "gitdir: elsewhere\n");
  assert.throws(
    () =>
      initialize(join(nested, "capture"), [{ caseRef: "case", runIndex: 0 }]),
    /inside a Git worktree/
  );
  const linkedParent = join(root, "linked-parent");
  symlinkSync(nested, linkedParent, "dir");
  assert.throws(
    () =>
      initialize(join(linkedParent, "capture"), [
        { caseRef: "case", runIndex: 0 },
      ]),
    /inside a Git worktree/
  );
  cleanupRoot(root);
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "meelni-sav252-"));
  const capture = initialize(root, [
    { caseRef: "private-product-sense-case", runIndex: 0 },
    { caseRef: "private-behavioral-case", runIndex: 1 },
  ]);
  capturePrivateSyntheticOutput(capture, {
    caseRef: "private-product-sense-case",
    runIndex: 0,
    rawResponse: Buffer.from("synthetic response one"),
  });
  capturePrivateSyntheticOutput(capture, {
    caseRef: "private-behavioral-case",
    runIndex: 1,
    rawResponse: Buffer.from("synthetic response two\n"),
  });
  const input = finalizePrivateSemanticCapture(capture);
  const accepted = input.outputs.map((output) => ({
    ...output,
    evidenceRelevance: "relevant" as const,
    observationAccuracy: "accurate" as const,
    nextStepUsefulness: "useful" as const,
    dimensionFit: "fits" as const,
    alternativeDisposition: "not_applicable" as const,
    overallDecision: "accept" as const,
  }));
  return {
    root,
    capture,
    input,
    accepted,
    reportPath: join(root, "public.json"),
  };
}

function initialize(
  rootOrDirectory: string,
  caseRuns: Array<{ caseRef: string; runIndex: number }>
): PrivateSemanticCaptureHandle {
  const directory =
    basename(rootOrDirectory) === "capture"
      ? rootOrDirectory
      : join(rootOrDirectory, "private-capture");
  return initializePrivateSemanticCapture(
    baseInitialization(dirname(directory), caseRuns, directory)
  );
}

function baseInitialization(
  root: string,
  caseRuns: Array<{ caseRef: string; runIndex: number }>,
  directory = join(root, "private-capture")
) {
  return {
    directory,
    runId: "sav-252-provider-free-fixture.v1",
    approvedPlan: { version: "approved-plan.v1", sha256: "0".repeat(64) },
    corpus: { version: "synthetic-corpus.v1", sha256: "1".repeat(64) },
    prompt: { version: "feedback-prompt.v1", sha256: "2".repeat(64) },
    schema: { version: "feedback-schema.v1", sha256: "3".repeat(64) },
    modelVersion: "synthetic-model.v1",
    caseRuns,
    retentionExpiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function reviewFor(
  input: SemanticAdjudicationReviewInput,
  decisions: SemanticAdjudicationDecision[]
) {
  const executions = [
    panel("panel_one", "1", input, decisions),
    panel("panel_two", "2", input, decisions),
  ] as [ReturnType<typeof panel>, ReturnType<typeof panel>];
  return {
    trustedExecutionAuthority: buildTrustedSemanticExecutionAuthority({
      reviewInputSha256: input.reviewInputSha256,
      verifiedExecutions: [executions[0].receipt, executions[1].receipt],
    }),
    panels: executions.map(({ receipt, decisions: panelDecisions }) => ({
      taskPath: receipt.taskPath,
      decisions: panelDecisions,
    })) as [
      { taskPath: string; decisions: SemanticAdjudicationDecision[] },
      { taskPath: string; decisions: SemanticAdjudicationDecision[] },
    ],
  };
}

function panel(
  name: string,
  executionDigit: string,
  input: SemanticAdjudicationReviewInput,
  decisions: SemanticAdjudicationDecision[]
) {
  return {
    receipt: buildSemanticReviewExecutionReceipt({
      taskPath: `/root/${name}`,
      executionId: `exec_${executionDigit.repeat(32)}`,
      reviewInputSha256: input.reviewInputSha256,
      decisions,
      completedAt: "2026-07-13T15:00:00.000Z",
    }),
    decisions,
  };
}

function rejection(
  decisions: SemanticAdjudicationDecision[]
): SemanticAdjudicationDecision[] {
  return decisions.map((decision) => ({
    ...decision,
    evidenceRelevance: "irrelevant",
    alternativeDisposition: "not_applicable",
    overallDecision: "reject",
  }));
}

function rewriteCapturedOutput(
  capture: PrivateSemanticCaptureHandle,
  replacement: Uint8Array
): void {
  const manifestPath = join(capture.directory, "capture.private.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const caseRun = manifest.caseRuns.find(
    (candidate: { output: null | { fileName: string } }) => candidate.output
  );
  assert.ok(caseRun?.output);
  writeFileSync(join(capture.directory, caseRun.output.fileName), replacement, {
    mode: 0o600,
  });
  caseRun.output.responseSha256 = createHash("sha256")
    .update(replacement)
    .digest("hex");
  const { manifestSha256: _previous, ...body } = manifest;
  manifest.manifestSha256 = hashCanonical(body);
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
}

function assertPublicReportStructure(value: unknown): void {
  const forbiddenKeys = new Set([
    "directory",
    "caseRef",
    "caseRefSha256",
    "sanitizedCaseId",
    "runIndex",
    "rawResponse",
    "fileName",
    "taskPath",
    "executionId",
  ]);
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    for (const [key, child] of Object.entries(candidate)) {
      assert.equal(
        forbiddenKeys.has(key),
        false,
        `forbidden report key: ${key}`
      );
      visit(child);
    }
  };
  visit(value);
}

function cleanupRoot(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
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
