import { createHash } from "node:crypto";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;
const OPAQUE_CASE_ID = /^case_[a-f0-9]{32}$/;
const OPAQUE_OUTPUT_ID = /^out_[a-f0-9]{32}$/;

export type EvidenceRelevance =
  | "relevant"
  | "irrelevant"
  | "legitimate_alternative";
export type AlternativeDisposition =
  | "not_applicable"
  | "reviewed_legitimate"
  | "review_required";

export interface SemanticAdjudicationDecision {
  sanitizedOutputId: string;
  sanitizedCaseId: string;
  runIndex: number;
  responseSha256: string;
  evidenceRelevance: EvidenceRelevance;
  observationAccuracy: "accurate" | "inaccurate";
  nextStepUsefulness: "useful" | "not_useful";
  dimensionFit: "fits" | "misfit";
  alternativeDisposition: AlternativeDisposition;
  overallDecision: "accept" | "reject";
}

export interface SemanticAdjudicationReviewInput {
  contractVersion: "evaluation-output-semantic-review-input.v1";
  syntheticOnly: true;
  customerDataUsed: false;
  runId: string;
  approvedPlan: { version: string; sha256: string };
  corpus: { version: string; sha256: string };
  prompt: { version: string; sha256: string };
  schema: { version: string; sha256: string };
  model: { version: string; sha256: string };
  runSha256: string;
  outputs: Array<{
    sanitizedOutputId: string;
    sanitizedCaseId: string;
    runIndex: number;
    responseSha256: string;
  }>;
  responseSetSha256: string;
  reviewInputSha256: string;
}

export interface SemanticAdjudicationPanel {
  contractVersion: "evaluation-output-semantic-agent-panel.v1";
  reviewerKind: "agent_panel";
  taskPath: string;
  executionReceiptSha256: string;
  humanReviewerIdentity: null;
  reviewInputSha256: string;
  decisions: SemanticAdjudicationDecision[];
  panelArtifactSha256: string;
}

export interface SemanticAdjudicationAuthorityEnvelope {
  contractVersion: "evaluation-output-semantic-authority.v1";
  authorityKind: "trusted_operator_orchestrator";
  syntheticOnly: true;
  customerDataUsed: false;
  approvedPlan: { version: string; sha256: string };
  runSha256: string;
  responseSetSha256: string;
  reviewInputSha256: string;
  expectedOutputs: Array<{
    sanitizedOutputId: string;
    sanitizedCaseId: string;
    runIndex: number;
  }>;
  panelExecutions: [
    { taskPath: string; executionReceiptSha256: string; verified: true },
    { taskPath: string; executionReceiptSha256: string; verified: true },
  ];
  authorityEnvelopeSha256: string;
}

export interface SemanticAdjudicationArtifact {
  contractVersion: "evaluation-output-semantic-adjudication.v1";
  humanReviewerIdentity: null;
  reviewInputSha256: string;
  authorityEnvelopeSha256: string;
  panels: [SemanticAdjudicationPanel, SemanticAdjudicationPanel];
}

export interface SemanticAdjudicationPublicReport {
  contractVersion: "evaluation-output-semantic-adjudication-report.v1";
  syntheticOnly: true;
  customerDataUsed: false;
  rawOutputContentIncluded: false;
  humanReviewerIdentity: null;
  runSha256: string;
  corpusSha256: string;
  promptSha256: string;
  schemaSha256: string;
  modelSha256: string;
  responseSetSha256: string;
  reviewInputSha256: string;
  authorityEnvelopeSha256: string;
  panelArtifactSha256s: [string, string];
  decisions: Array<
    Omit<SemanticAdjudicationDecision, "sanitizedCaseId" | "runIndex">
  >;
  summary: {
    outputCount: number;
    acceptedCount: number;
    rejectedCount: number;
    reviewedLegitimateAlternativeCount: number;
    acceptedOutputIds: string[];
    rejectedOutputIds: string[];
    reviewedLegitimateAlternativeOutputIds: string[];
  };
  gate: "passed" | "failed";
}

interface ReviewInputSource {
  runId: string;
  approvedPlan: { version: string; sha256: string };
  corpus: { version: string; sha256: string };
  prompt: { version: string; sha256: string };
  schema: { version: string; sha256: string };
  modelVersion: string;
  outputs: Array<{
    sanitizedOutputId: string;
    sanitizedCaseId: string;
    runIndex: number;
    responseSha256: string;
  }>;
}

interface AuthorityEnvelopeSource {
  approvedPlan: { version: string; sha256: string };
  runSha256: string;
  responseSetSha256: string;
  reviewInputSha256: string;
  expectedOutputs: Array<{
    sanitizedOutputId: string;
    sanitizedCaseId: string;
    runIndex: number;
  }>;
  panelExecutions: [
    { taskPath: string; executionReceiptSha256: string },
    { taskPath: string; executionReceiptSha256: string },
  ];
}

export function sha256SyntheticCalibrationResponse(
  rawResponse: string | Uint8Array
): string {
  return createHash("sha256").update(rawResponse).digest("hex");
}

export function buildSemanticAdjudicationReviewInput(
  source: ReviewInputSource
): SemanticAdjudicationReviewInput {
  const runId = requireSafeId(source.runId, "runId");
  const approvedPlan = parseVersionedHash(source.approvedPlan, "approvedPlan");
  const corpus = parseVersionedHash(source.corpus, "corpus");
  const prompt = parseVersionedHash(source.prompt, "prompt");
  const schema = parseVersionedHash(source.schema, "schema");
  const modelVersion = requireText(source.modelVersion, "modelVersion");
  const model = {
    version: modelVersion,
    sha256: sha256(modelVersion),
  };
  const outputs = parseOutputManifest(source.outputs);
  const runSha256 = hashCanonical({
    runId,
    approvedPlan,
    corpus,
    prompt,
    schema,
    model,
  });
  const responseSetSha256 = hashCanonical(outputs);
  const reviewInputSha256 = hashCanonical({
    runSha256,
    responseSetSha256,
    outputs,
  });
  return {
    contractVersion: "evaluation-output-semantic-review-input.v1",
    syntheticOnly: true,
    customerDataUsed: false,
    runId,
    approvedPlan,
    corpus,
    prompt,
    schema,
    model,
    runSha256,
    outputs,
    responseSetSha256,
    reviewInputSha256,
  };
}

export function buildSemanticAdjudicationAuthorityEnvelope(
  source: AuthorityEnvelopeSource
): SemanticAdjudicationAuthorityEnvelope {
  const approvedPlan = parseVersionedHash(source.approvedPlan, "approvedPlan");
  const runSha256 = requireSha256(source.runSha256, "runSha256");
  const responseSetSha256 = requireSha256(
    source.responseSetSha256,
    "responseSetSha256"
  );
  const reviewInputSha256 = requireSha256(
    source.reviewInputSha256,
    "reviewInputSha256"
  );
  const expectedOutputs = parseExpectedOutputs(source.expectedOutputs);
  const panelExecutions = parsePanelExecutions(
    source.panelExecutions.map((execution) => ({
      ...execution,
      verified: true,
    }))
  );
  const body = {
    contractVersion: "evaluation-output-semantic-authority.v1" as const,
    authorityKind: "trusted_operator_orchestrator" as const,
    syntheticOnly: true as const,
    customerDataUsed: false as const,
    approvedPlan,
    runSha256,
    responseSetSha256,
    reviewInputSha256,
    expectedOutputs,
    panelExecutions,
  };
  return { ...body, authorityEnvelopeSha256: hashCanonical(body) };
}

export function buildSemanticAdjudicationPanel(input: {
  taskPath: string;
  executionReceiptSha256: string;
  reviewInputSha256: string;
  decisions: SemanticAdjudicationDecision[];
}): SemanticAdjudicationPanel {
  const taskPath = requireTaskPath(input.taskPath);
  const executionReceiptSha256 = requireSha256(
    input.executionReceiptSha256,
    "executionReceiptSha256"
  );
  const reviewInputSha256 = requireSha256(
    input.reviewInputSha256,
    "reviewInputSha256"
  );
  const decisions = parseDecisions(input.decisions);
  const body = {
    contractVersion: "evaluation-output-semantic-agent-panel.v1" as const,
    reviewerKind: "agent_panel" as const,
    taskPath,
    executionReceiptSha256,
    humanReviewerIdentity: null,
    reviewInputSha256,
    decisions,
  };
  return { ...body, panelArtifactSha256: hashCanonical(body) };
}

export function validateSemanticAdjudication(
  unknownReviewInput: unknown,
  unknownArtifact: unknown,
  unknownAuthorityEnvelope: unknown
): SemanticAdjudicationPublicReport {
  const authority = parseAuthorityEnvelope(unknownAuthorityEnvelope);
  const reviewInput = parseReviewInput(unknownReviewInput);
  assertAuthorityCoverage(authority, reviewInput);
  const artifact = requireRecord(unknownArtifact, "artifact");
  assertExactKeys(
    artifact,
    [
      "contractVersion",
      "humanReviewerIdentity",
      "reviewInputSha256",
      "authorityEnvelopeSha256",
      "panels",
    ],
    "artifact"
  );
  if (
    artifact.contractVersion !== "evaluation-output-semantic-adjudication.v1"
  ) {
    throw new Error("Invalid semantic adjudication contractVersion");
  }
  if (artifact.humanReviewerIdentity !== null) {
    throw new Error("Semantic adjudication humanReviewerIdentity must be null");
  }
  if (artifact.reviewInputSha256 !== reviewInput.reviewInputSha256) {
    throw new Error("Semantic adjudication reviewInputSha256 mismatch");
  }
  if (artifact.authorityEnvelopeSha256 !== authority.authorityEnvelopeSha256) {
    throw new Error("Semantic adjudication authorityEnvelopeSha256 mismatch");
  }
  if (!Array.isArray(artifact.panels) || artifact.panels.length !== 2) {
    throw new Error("Semantic adjudication requires exactly two agent panels");
  }
  const panels = artifact.panels.map((panel, index) =>
    parsePanel(panel, reviewInput, authority, index)
  ) as [SemanticAdjudicationPanel, SemanticAdjudicationPanel];
  if (panels[0].taskPath === panels[1].taskPath) {
    throw new Error("Semantic adjudication agent panels must be independent");
  }
  if (
    canonicalJson(panels[0].decisions) !== canonicalJson(panels[1].decisions)
  ) {
    throw new Error("Semantic adjudication agent panels disagree");
  }

  const privateDecisions = panels[0].decisions;
  const decisions = privateDecisions.map(
    ({
      sanitizedOutputId,
      responseSha256,
      evidenceRelevance,
      observationAccuracy,
      nextStepUsefulness,
      dimensionFit,
      alternativeDisposition,
      overallDecision,
    }) => ({
      sanitizedOutputId,
      responseSha256,
      evidenceRelevance,
      observationAccuracy,
      nextStepUsefulness,
      dimensionFit,
      alternativeDisposition,
      overallDecision,
    })
  );
  const acceptedOutputIds = privateDecisions
    .filter(({ overallDecision }) => overallDecision === "accept")
    .map(({ sanitizedOutputId }) => sanitizedOutputId);
  const rejectedOutputIds = privateDecisions
    .filter(({ overallDecision }) => overallDecision === "reject")
    .map(({ sanitizedOutputId }) => sanitizedOutputId);
  const reviewedLegitimateAlternativeOutputIds = privateDecisions
    .filter(
      ({ alternativeDisposition }) =>
        alternativeDisposition === "reviewed_legitimate"
    )
    .map(({ sanitizedOutputId }) => sanitizedOutputId);
  return {
    contractVersion: "evaluation-output-semantic-adjudication-report.v1",
    syntheticOnly: true,
    customerDataUsed: false,
    rawOutputContentIncluded: false,
    humanReviewerIdentity: null,
    runSha256: reviewInput.runSha256,
    corpusSha256: reviewInput.corpus.sha256,
    promptSha256: reviewInput.prompt.sha256,
    schemaSha256: reviewInput.schema.sha256,
    modelSha256: reviewInput.model.sha256,
    responseSetSha256: reviewInput.responseSetSha256,
    reviewInputSha256: reviewInput.reviewInputSha256,
    authorityEnvelopeSha256: authority.authorityEnvelopeSha256,
    panelArtifactSha256s: [
      panels[0].panelArtifactSha256,
      panels[1].panelArtifactSha256,
    ],
    decisions,
    summary: {
      outputCount: decisions.length,
      acceptedCount: acceptedOutputIds.length,
      rejectedCount: rejectedOutputIds.length,
      reviewedLegitimateAlternativeCount:
        reviewedLegitimateAlternativeOutputIds.length,
      acceptedOutputIds,
      rejectedOutputIds,
      reviewedLegitimateAlternativeOutputIds,
    },
    gate: rejectedOutputIds.length === 0 ? "passed" : "failed",
  };
}

function parseReviewInput(input: unknown): SemanticAdjudicationReviewInput {
  const record = requireRecord(input, "reviewInput");
  assertExactKeys(
    record,
    [
      "contractVersion",
      "syntheticOnly",
      "customerDataUsed",
      "runId",
      "approvedPlan",
      "corpus",
      "prompt",
      "schema",
      "model",
      "runSha256",
      "outputs",
      "responseSetSha256",
      "reviewInputSha256",
    ],
    "reviewInput"
  );
  if (
    record.contractVersion !== "evaluation-output-semantic-review-input.v1" ||
    record.syntheticOnly !== true ||
    record.customerDataUsed !== false
  ) {
    throw new Error("Invalid semantic adjudication review-input boundary");
  }
  const runId = requireSafeId(record.runId, "runId");
  const approvedPlan = parseVersionedHash(record.approvedPlan, "approvedPlan");
  const corpus = parseVersionedHash(record.corpus, "corpus");
  const prompt = parseVersionedHash(record.prompt, "prompt");
  const schema = parseVersionedHash(record.schema, "schema");
  const model = parseVersionedHash(record.model, "model");
  if (model.sha256 !== sha256(model.version)) {
    throw new Error("Semantic adjudication model hash mismatch");
  }
  const outputs = parseOutputManifest(record.outputs);
  const runSha256 = hashCanonical({
    runId,
    approvedPlan,
    corpus,
    prompt,
    schema,
    model,
  });
  const responseSetSha256 = hashCanonical(outputs);
  const reviewInputSha256 = hashCanonical({
    runSha256,
    responseSetSha256,
    outputs,
  });
  if (record.runSha256 !== runSha256) {
    throw new Error("Semantic adjudication run hash mismatch");
  }
  if (record.responseSetSha256 !== responseSetSha256) {
    throw new Error("Semantic adjudication response-set hash mismatch");
  }
  if (record.reviewInputSha256 !== reviewInputSha256) {
    throw new Error("Semantic adjudication review-input hash mismatch");
  }
  return {
    contractVersion: "evaluation-output-semantic-review-input.v1",
    syntheticOnly: true,
    customerDataUsed: false,
    runId,
    approvedPlan,
    corpus,
    prompt,
    schema,
    model,
    runSha256,
    outputs,
    responseSetSha256,
    reviewInputSha256,
  };
}

function parseAuthorityEnvelope(
  input: unknown
): SemanticAdjudicationAuthorityEnvelope {
  const record = requireRecord(input, "authorityEnvelope");
  assertExactKeys(
    record,
    [
      "contractVersion",
      "authorityKind",
      "syntheticOnly",
      "customerDataUsed",
      "approvedPlan",
      "runSha256",
      "responseSetSha256",
      "reviewInputSha256",
      "expectedOutputs",
      "panelExecutions",
      "authorityEnvelopeSha256",
    ],
    "authorityEnvelope"
  );
  if (
    record.contractVersion !== "evaluation-output-semantic-authority.v1" ||
    record.authorityKind !== "trusted_operator_orchestrator" ||
    record.syntheticOnly !== true ||
    record.customerDataUsed !== false
  ) {
    throw new Error("Invalid semantic adjudication authority boundary");
  }
  const approvedPlan = parseVersionedHash(record.approvedPlan, "approvedPlan");
  const runSha256 = requireSha256(record.runSha256, "runSha256");
  const responseSetSha256 = requireSha256(
    record.responseSetSha256,
    "responseSetSha256"
  );
  const reviewInputSha256 = requireSha256(
    record.reviewInputSha256,
    "reviewInputSha256"
  );
  const expectedOutputs = parseExpectedOutputs(record.expectedOutputs);
  const panelExecutions = parsePanelExecutions(record.panelExecutions);
  const body = {
    contractVersion: "evaluation-output-semantic-authority.v1" as const,
    authorityKind: "trusted_operator_orchestrator" as const,
    syntheticOnly: true as const,
    customerDataUsed: false as const,
    approvedPlan,
    runSha256,
    responseSetSha256,
    reviewInputSha256,
    expectedOutputs,
    panelExecutions,
  };
  const authorityEnvelopeSha256 = hashCanonical(body);
  if (record.authorityEnvelopeSha256 !== authorityEnvelopeSha256) {
    throw new Error("Semantic adjudication authority-envelope hash mismatch");
  }
  return { ...body, authorityEnvelopeSha256 };
}

function assertAuthorityCoverage(
  authority: SemanticAdjudicationAuthorityEnvelope,
  reviewInput: SemanticAdjudicationReviewInput
): void {
  if (authority.reviewInputSha256 !== reviewInput.reviewInputSha256) {
    throw new Error(
      "Semantic adjudication authority review-input hash mismatch"
    );
  }
  if (authority.runSha256 !== reviewInput.runSha256) {
    throw new Error("Semantic adjudication authority run hash mismatch");
  }
  if (authority.responseSetSha256 !== reviewInput.responseSetSha256) {
    throw new Error(
      "Semantic adjudication authority response-set hash mismatch"
    );
  }
  if (
    canonicalJson(authority.approvedPlan) !==
    canonicalJson(reviewInput.approvedPlan)
  ) {
    throw new Error("Semantic adjudication approved plan mismatch");
  }
  const actual = reviewInput.outputs.map(
    ({ sanitizedOutputId, sanitizedCaseId, runIndex }) => ({
      sanitizedOutputId,
      sanitizedCaseId,
      runIndex,
    })
  );
  if (canonicalJson(authority.expectedOutputs) !== canonicalJson(actual)) {
    throw new Error("Semantic adjudication authority output coverage mismatch");
  }
}

function parsePanel(
  input: unknown,
  reviewInput: SemanticAdjudicationReviewInput,
  authority: SemanticAdjudicationAuthorityEnvelope,
  index: number
): SemanticAdjudicationPanel {
  const panel = requireRecord(input, `panel:${index}`);
  assertExactKeys(
    panel,
    [
      "contractVersion",
      "reviewerKind",
      "taskPath",
      "executionReceiptSha256",
      "humanReviewerIdentity",
      "reviewInputSha256",
      "decisions",
      "panelArtifactSha256",
    ],
    `panel:${index}`
  );
  if (
    panel.contractVersion !== "evaluation-output-semantic-agent-panel.v1" ||
    panel.reviewerKind !== "agent_panel" ||
    panel.humanReviewerIdentity !== null
  ) {
    throw new Error(`Invalid semantic adjudication panel:${index} boundary`);
  }
  const taskPath = requireTaskPath(panel.taskPath);
  const executionReceiptSha256 = requireSha256(
    panel.executionReceiptSha256,
    `panel:${index}.executionReceiptSha256`
  );
  const authorizedExecution = authority.panelExecutions.find(
    (execution) => execution.taskPath === taskPath
  );
  if (
    !authorizedExecution ||
    authorizedExecution.executionReceiptSha256 !== executionReceiptSha256
  ) {
    throw new Error(
      `Semantic adjudication panel:${index} execution receipt mismatch`
    );
  }
  if (panel.reviewInputSha256 !== reviewInput.reviewInputSha256) {
    throw new Error(
      `Semantic adjudication panel:${index} review hash mismatch`
    );
  }
  const decisions = parseDecisions(panel.decisions);
  assertDecisionCoverage(decisions, reviewInput.outputs, index);
  const body = {
    contractVersion: "evaluation-output-semantic-agent-panel.v1" as const,
    reviewerKind: "agent_panel" as const,
    taskPath,
    executionReceiptSha256,
    humanReviewerIdentity: null,
    reviewInputSha256: reviewInput.reviewInputSha256,
    decisions,
  };
  const panelArtifactSha256 = hashCanonical(body);
  if (panel.panelArtifactSha256 !== panelArtifactSha256) {
    throw new Error(
      `Semantic adjudication panel:${index} artifact hash mismatch`
    );
  }
  return { ...body, panelArtifactSha256 };
}

function parseDecisions(input: unknown): SemanticAdjudicationDecision[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("Semantic adjudication decisions must be non-empty");
  }
  const decisions = input.map((unknownDecision, index) => {
    const decision = requireRecord(unknownDecision, `decision:${index}`);
    assertExactKeys(
      decision,
      [
        "sanitizedOutputId",
        "sanitizedCaseId",
        "runIndex",
        "responseSha256",
        "evidenceRelevance",
        "observationAccuracy",
        "nextStepUsefulness",
        "dimensionFit",
        "alternativeDisposition",
        "overallDecision",
      ],
      `decision:${index}`
    );
    const parsed: SemanticAdjudicationDecision = {
      sanitizedOutputId: requireOpaqueId(
        decision.sanitizedOutputId,
        OPAQUE_OUTPUT_ID,
        `decision:${index}.sanitizedOutputId`
      ),
      sanitizedCaseId: requireOpaqueId(
        decision.sanitizedCaseId,
        OPAQUE_CASE_ID,
        `decision:${index}.sanitizedCaseId`
      ),
      runIndex: requireRunIndex(
        decision.runIndex,
        `decision:${index}.runIndex`
      ),
      responseSha256: requireSha256(
        decision.responseSha256,
        `decision:${index}.responseSha256`
      ),
      evidenceRelevance: requireEnum(
        decision.evidenceRelevance,
        ["relevant", "irrelevant", "legitimate_alternative"],
        `decision:${index}.evidenceRelevance`
      ),
      observationAccuracy: requireEnum(
        decision.observationAccuracy,
        ["accurate", "inaccurate"],
        `decision:${index}.observationAccuracy`
      ),
      nextStepUsefulness: requireEnum(
        decision.nextStepUsefulness,
        ["useful", "not_useful"],
        `decision:${index}.nextStepUsefulness`
      ),
      dimensionFit: requireEnum(
        decision.dimensionFit,
        ["fits", "misfit"],
        `decision:${index}.dimensionFit`
      ),
      alternativeDisposition: requireEnum(
        decision.alternativeDisposition,
        ["not_applicable", "reviewed_legitimate", "review_required"],
        `decision:${index}.alternativeDisposition`
      ),
      overallDecision: requireEnum(
        decision.overallDecision,
        ["accept", "reject"],
        `decision:${index}.overallDecision`
      ),
    };
    validateDecisionConsistency(parsed, index);
    return parsed;
  });
  const sorted = [...decisions].sort((left, right) =>
    left.sanitizedOutputId.localeCompare(right.sanitizedOutputId)
  );
  if (
    decisions.some(
      (decision, index) =>
        decision.sanitizedOutputId !== sorted[index].sanitizedOutputId
    )
  ) {
    throw new Error(
      "Semantic adjudication decisions must use canonical output order"
    );
  }
  return decisions;
}

function validateDecisionConsistency(
  decision: SemanticAdjudicationDecision,
  index: number
): void {
  const isLegitimateAlternative =
    decision.evidenceRelevance === "legitimate_alternative";
  if (decision.alternativeDisposition === "review_required") {
    throw new Error(
      `Semantic adjudication decision:${index} has a non-terminal review_required disposition`
    );
  }
  if (
    isLegitimateAlternative !==
    (decision.alternativeDisposition === "reviewed_legitimate")
  ) {
    throw new Error(
      `Semantic adjudication decision:${index} has contradictory alternative disposition`
    );
  }
  const shouldAccept =
    decision.evidenceRelevance !== "irrelevant" &&
    decision.observationAccuracy === "accurate" &&
    decision.nextStepUsefulness === "useful" &&
    decision.dimensionFit === "fits";
  if ((decision.overallDecision === "accept") !== shouldAccept) {
    throw new Error(
      `Semantic adjudication decision:${index} contradicts its overall decision`
    );
  }
}

function assertDecisionCoverage(
  decisions: SemanticAdjudicationDecision[],
  outputs: SemanticAdjudicationReviewInput["outputs"],
  panelIndex: number
): void {
  if (decisions.length !== outputs.length) {
    throw new Error(
      `Semantic adjudication panel:${panelIndex} output coverage mismatch`
    );
  }
  decisions.forEach((decision, index) => {
    const output = outputs[index];
    if (
      decision.sanitizedOutputId !== output.sanitizedOutputId ||
      decision.sanitizedCaseId !== output.sanitizedCaseId ||
      decision.runIndex !== output.runIndex ||
      decision.responseSha256 !== output.responseSha256
    ) {
      throw new Error(
        `Semantic adjudication panel:${panelIndex} output hash mismatch`
      );
    }
  });
}

function parseOutputManifest(input: unknown) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("Semantic adjudication output manifest must be non-empty");
  }
  const seen = new Set<string>();
  const seenCaseRuns = new Set<string>();
  const outputs = input.map((unknownOutput, index) => {
    const output = requireRecord(unknownOutput, `output:${index}`);
    assertExactKeys(
      output,
      ["sanitizedOutputId", "sanitizedCaseId", "runIndex", "responseSha256"],
      `output:${index}`
    );
    const sanitizedOutputId = requireOpaqueId(
      output.sanitizedOutputId,
      OPAQUE_OUTPUT_ID,
      `output:${index}.sanitizedOutputId`
    );
    if (seen.has(sanitizedOutputId)) {
      throw new Error("Semantic adjudication output IDs must be unique");
    }
    seen.add(sanitizedOutputId);
    const sanitizedCaseId = requireOpaqueId(
      output.sanitizedCaseId,
      OPAQUE_CASE_ID,
      `output:${index}.sanitizedCaseId`
    );
    const runIndex = requireRunIndex(
      output.runIndex,
      `output:${index}.runIndex`
    );
    const caseRunKey = `${sanitizedCaseId}:${runIndex}`;
    if (seenCaseRuns.has(caseRunKey)) {
      throw new Error("Semantic adjudication case/run pairs must be unique");
    }
    seenCaseRuns.add(caseRunKey);
    return {
      sanitizedOutputId,
      sanitizedCaseId,
      runIndex,
      responseSha256: requireSha256(
        output.responseSha256,
        `output:${index}.responseSha256`
      ),
    };
  });
  const sorted = [...outputs].sort((left, right) =>
    left.sanitizedOutputId.localeCompare(right.sanitizedOutputId)
  );
  if (
    outputs.some(
      (output, index) =>
        output.sanitizedOutputId !== sorted[index].sanitizedOutputId
    )
  ) {
    throw new Error("Semantic adjudication outputs must use canonical order");
  }
  return outputs;
}

function parseExpectedOutputs(input: unknown) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error(
      "Semantic adjudication authority outputs must be non-empty"
    );
  }
  const seenOutputs = new Set<string>();
  const seenCaseRuns = new Set<string>();
  const outputs = input.map((unknownOutput, index) => {
    const output = requireRecord(unknownOutput, `authorityOutput:${index}`);
    assertExactKeys(
      output,
      ["sanitizedOutputId", "sanitizedCaseId", "runIndex"],
      `authorityOutput:${index}`
    );
    const sanitizedOutputId = requireOpaqueId(
      output.sanitizedOutputId,
      OPAQUE_OUTPUT_ID,
      `authorityOutput:${index}.sanitizedOutputId`
    );
    const sanitizedCaseId = requireOpaqueId(
      output.sanitizedCaseId,
      OPAQUE_CASE_ID,
      `authorityOutput:${index}.sanitizedCaseId`
    );
    const runIndex = requireRunIndex(
      output.runIndex,
      `authorityOutput:${index}.runIndex`
    );
    if (seenOutputs.has(sanitizedOutputId)) {
      throw new Error(
        "Semantic adjudication authority output IDs must be unique"
      );
    }
    const caseRun = `${sanitizedCaseId}:${runIndex}`;
    if (seenCaseRuns.has(caseRun)) {
      throw new Error(
        "Semantic adjudication authority case/run pairs must be unique"
      );
    }
    seenOutputs.add(sanitizedOutputId);
    seenCaseRuns.add(caseRun);
    return { sanitizedOutputId, sanitizedCaseId, runIndex };
  });
  const sorted = [...outputs].sort((left, right) =>
    left.sanitizedOutputId.localeCompare(right.sanitizedOutputId)
  );
  if (
    outputs.some(
      (output, index) =>
        output.sanitizedOutputId !== sorted[index].sanitizedOutputId
    )
  ) {
    throw new Error(
      "Semantic adjudication authority outputs must use canonical order"
    );
  }
  return outputs;
}

function parsePanelExecutions(input: unknown) {
  if (!Array.isArray(input) || input.length !== 2) {
    throw new Error(
      "Semantic adjudication authority requires two panel executions"
    );
  }
  const executions = input.map((unknownExecution, index) => {
    const execution = requireRecord(
      unknownExecution,
      `panelExecution:${index}`
    );
    assertExactKeys(
      execution,
      ["taskPath", "executionReceiptSha256", "verified"],
      `panelExecution:${index}`
    );
    if (execution.verified !== true) {
      throw new Error("Semantic adjudication panel execution must be verified");
    }
    return {
      taskPath: requireTaskPath(execution.taskPath),
      executionReceiptSha256: requireSha256(
        execution.executionReceiptSha256,
        `panelExecution:${index}.executionReceiptSha256`
      ),
      verified: true as const,
    };
  }) as SemanticAdjudicationAuthorityEnvelope["panelExecutions"];
  if (
    executions[0].taskPath === executions[1].taskPath ||
    executions[0].executionReceiptSha256 ===
      executions[1].executionReceiptSha256
  ) {
    throw new Error(
      "Semantic adjudication authority panel executions must be distinct"
    );
  }
  return executions;
}

function parseVersionedHash(input: unknown, field: string) {
  const record = requireRecord(input, field);
  assertExactKeys(record, ["version", "sha256"], field);
  return {
    version: requireText(record.version, `${field}.version`),
    sha256: requireSha256(record.sha256, `${field}.sha256`),
  };
}

function requireTaskPath(input: unknown): string {
  const value = requireText(input, "taskPath");
  if (!/^\/root\/[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/.test(value)) {
    throw new Error("Invalid semantic adjudication agent taskPath");
  }
  return value;
}

function requireSafeId(input: unknown, field: string): string {
  const value = requireText(input, field);
  if (!SAFE_ID.test(value)) {
    throw new Error(`Invalid semantic adjudication ${field}`);
  }
  return value;
}

function requireOpaqueId(
  input: unknown,
  pattern: RegExp,
  field: string
): string {
  if (typeof input !== "string" || !pattern.test(input)) {
    throw new Error(`Invalid semantic adjudication ${field}`);
  }
  return input;
}

function requireRunIndex(input: unknown, field: string): number {
  if (!Number.isInteger(input) || (input as number) < 0) {
    throw new Error(`Invalid semantic adjudication ${field}`);
  }
  return input as number;
}

function requireSha256(input: unknown, field: string): string {
  if (typeof input !== "string" || !SHA256.test(input)) {
    throw new Error(`Invalid semantic adjudication ${field}`);
  }
  return input;
}

function requireEnum<const T extends readonly string[]>(
  input: unknown,
  values: T,
  field: string
): T[number] {
  if (typeof input !== "string" || !values.includes(input)) {
    throw new Error(`Invalid semantic adjudication ${field}`);
  }
  return input as T[number];
}

function requireText(input: unknown, field: string): string {
  if (typeof input !== "string" || input.trim() !== input || !input) {
    throw new Error(`Invalid semantic adjudication ${field}`);
  }
  return input;
}

function requireRecord(input: unknown, field: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`Invalid semantic adjudication ${field}`);
  }
  return input as Record<string, unknown>;
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
    throw new Error(`Invalid semantic adjudication ${field} fields`);
  }
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
