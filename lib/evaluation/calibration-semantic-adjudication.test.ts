import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSemanticAdjudicationAuthorityEnvelope,
  buildSemanticAdjudicationPanel,
  buildSemanticAdjudicationReviewInput,
  sha256SyntheticCalibrationResponse,
  validateSemanticAdjudication,
  type SemanticAdjudicationDecision,
  type SemanticAdjudicationPanel,
} from "./calibration-semantic-adjudication";

const CASE_ONE = `case_${"a".repeat(32)}`;
const CASE_TWO = `case_${"b".repeat(32)}`;
const OUTPUT_ONE = `out_${"c".repeat(32)}`;
const OUTPUT_TWO = `out_${"d".repeat(32)}`;
const RECEIPT_ONE = "4".repeat(64);
const RECEIPT_TWO = "5".repeat(64);

test("unanimous exact-hash panels produce a sanitized passing report", () => {
  const fixture = validFixture();
  const report = validateSemanticAdjudication(
    fixture.input,
    fixture.artifact,
    fixture.authority
  );

  assert.equal(report.gate, "passed");
  assert.equal(report.summary.outputCount, 2);
  assert.equal(report.summary.reviewedLegitimateAlternativeCount, 1);
  assert.deepEqual(report.summary.acceptedOutputIds, [OUTPUT_ONE, OUTPUT_TWO]);
  assert.equal(report.rawOutputContentIncluded, false);
  assert.equal(
    JSON.stringify(report).includes("private synthetic output"),
    false
  );
  assert.equal(JSON.stringify(report).includes("rationale"), false);
  assert.equal(JSON.stringify(report).includes("sanitizedCaseId"), false);
  assert.equal(JSON.stringify(report).includes("runIndex"), false);
  assert.equal(
    report.authorityEnvelopeSha256,
    fixture.authority.authorityEnvelopeSha256
  );
});

test("response hashing is byte exact", () => {
  assert.notEqual(
    sha256SyntheticCalibrationResponse("synthetic"),
    sha256SyntheticCalibrationResponse("synthetic\n")
  );
});

test("trusted authority rejects a cherry-picked output subset and cannot be omitted", () => {
  const fixture = validFixture();
  const subsetInput = buildSemanticAdjudicationReviewInput({
    runId: fixture.input.runId,
    approvedPlan: fixture.input.approvedPlan,
    corpus: fixture.input.corpus,
    prompt: fixture.input.prompt,
    schema: fixture.input.schema,
    modelVersion: fixture.input.model.version,
    outputs: fixture.input.outputs.slice(0, 1),
  });
  const subsetDecisions = fixture.decisions.slice(0, 1);
  const subsetArtifact = {
    contractVersion: "evaluation-output-semantic-adjudication.v1" as const,
    humanReviewerIdentity: null,
    reviewInputSha256: subsetInput.reviewInputSha256,
    authorityEnvelopeSha256: fixture.authority.authorityEnvelopeSha256,
    panels: [
      panel("/root/panel_one", subsetInput.reviewInputSha256, subsetDecisions),
      panel("/root/panel_two", subsetInput.reviewInputSha256, subsetDecisions),
    ],
  };
  assert.throws(
    () =>
      validateSemanticAdjudication(
        subsetInput,
        subsetArtifact,
        fixture.authority
      ),
    /authority output coverage mismatch/
  );
  assert.throws(
    () =>
      validateSemanticAdjudication(fixture.input, fixture.artifact, undefined),
    /authorityEnvelope/
  );
});

test("authority rejects forged, swapped, or duplicate execution receipts", () => {
  const fixture = validFixture();
  const forgedPanel = panel(
    "/root/panel_one",
    fixture.input.reviewInputSha256,
    fixture.decisions,
    "6".repeat(64)
  );
  assert.throws(
    () =>
      validateSemanticAdjudication(
        fixture.input,
        {
          ...fixture.artifact,
          panels: [forgedPanel, fixture.artifact.panels[1]],
        },
        fixture.authority
      ),
    /execution receipt mismatch/
  );
  const swappedPanel = panel(
    "/root/panel_one",
    fixture.input.reviewInputSha256,
    fixture.decisions,
    RECEIPT_TWO
  );
  assert.throws(
    () =>
      validateSemanticAdjudication(
        fixture.input,
        {
          ...fixture.artifact,
          panels: [swappedPanel, fixture.artifact.panels[1]],
        },
        fixture.authority
      ),
    /execution receipt mismatch/
  );
  assert.throws(
    () =>
      buildSemanticAdjudicationAuthorityEnvelope({
        approvedPlan: fixture.input.approvedPlan,
        expectedOutputs: fixture.authority.expectedOutputs,
        panelExecutions: [
          {
            taskPath: "/root/panel_one",
            executionReceiptSha256: RECEIPT_ONE,
          },
          {
            taskPath: "/root/panel_two",
            executionReceiptSha256: RECEIPT_ONE,
          },
        ],
      }),
    /panel executions must be distinct/
  );
});

test("descriptive case and output identifiers are rejected", () => {
  const fixture = validFixture();
  assert.throws(
    () =>
      buildSemanticAdjudicationReviewInput({
        runId: fixture.input.runId,
        approvedPlan: fixture.input.approvedPlan,
        corpus: fixture.input.corpus,
        prompt: fixture.input.prompt,
        schema: fixture.input.schema,
        modelVersion: fixture.input.model.version,
        outputs: [
          {
            ...fixture.input.outputs[0],
            sanitizedCaseId: "case_product_sense_caregiver",
          },
        ],
      }),
    /sanitizedCaseId/
  );
  assert.throws(
    () =>
      buildSemanticAdjudicationReviewInput({
        runId: fixture.input.runId,
        approvedPlan: fixture.input.approvedPlan,
        corpus: fixture.input.corpus,
        prompt: fixture.input.prompt,
        schema: fixture.input.schema,
        modelVersion: fixture.input.model.version,
        outputs: [
          {
            ...fixture.input.outputs[0],
            sanitizedOutputId: "out_behavioral_failed_launch",
          },
        ],
      }),
    /sanitizedOutputId/
  );
});

test("missing, duplicate, or forged output bindings fail closed", () => {
  const fixture = validFixture();
  assert.throws(
    () =>
      buildSemanticAdjudicationReviewInput({
        runId: fixture.input.runId,
        approvedPlan: fixture.input.approvedPlan,
        corpus: fixture.input.corpus,
        prompt: fixture.input.prompt,
        schema: fixture.input.schema,
        modelVersion: fixture.input.model.version,
        outputs: [
          fixture.input.outputs[0],
          {
            ...fixture.input.outputs[1],
            sanitizedCaseId: fixture.input.outputs[0].sanitizedCaseId,
          },
        ],
      }),
    /case\/run pairs must be unique/
  );
  const missingPanel = panel(
    "/root/panel_one",
    fixture.input.reviewInputSha256,
    fixture.decisions.slice(0, 1)
  );
  assert.throws(
    () =>
      validateSemanticAdjudication(
        fixture.input,
        { ...fixture.artifact, panels: [missingPanel, missingPanel] },
        fixture.authority
      ),
    /output coverage mismatch/
  );

  const duplicate = [fixture.decisions[0], fixture.decisions[0]];
  const duplicatePanel = panel(
    "/root/panel_one",
    fixture.input.reviewInputSha256,
    duplicate
  );
  assert.throws(
    () =>
      validateSemanticAdjudication(
        fixture.input,
        { ...fixture.artifact, panels: [duplicatePanel, duplicatePanel] },
        fixture.authority
      ),
    /output hash mismatch/
  );

  const forgedDecision = {
    ...fixture.decisions[0],
    responseSha256: "f".repeat(64),
  };
  const forgedPanel = panel(
    "/root/panel_one",
    fixture.input.reviewInputSha256,
    [forgedDecision, fixture.decisions[1]]
  );
  assert.throws(
    () =>
      validateSemanticAdjudication(
        fixture.input,
        { ...fixture.artifact, panels: [forgedPanel, forgedPanel] },
        fixture.authority
      ),
    /output hash mismatch/
  );
});

test("forged run bindings and panel artifact hashes fail closed", () => {
  const fixture = validFixture();
  assert.throws(
    () =>
      validateSemanticAdjudication(
        {
          ...fixture.input,
          corpus: { ...fixture.input.corpus, sha256: "0".repeat(64) },
        },
        fixture.artifact,
        fixture.authority
      ),
    /run hash mismatch/
  );
  assert.throws(
    () =>
      validateSemanticAdjudication(
        fixture.input,
        {
          ...fixture.artifact,
          panels: [
            {
              ...fixture.artifact.panels[0],
              panelArtifactSha256: "0".repeat(64),
            },
            fixture.artifact.panels[1],
          ],
        },
        fixture.authority
      ),
    /artifact hash mismatch/
  );
});

test("panel disagreement and duplicate panel identity fail closed", () => {
  const fixture = validFixture();
  const rejected: SemanticAdjudicationDecision = {
    ...fixture.decisions[0],
    evidenceRelevance: "irrelevant",
    alternativeDisposition: "not_applicable",
    overallDecision: "reject",
  };
  const disagreeingPanel = panel(
    "/root/panel_two",
    fixture.input.reviewInputSha256,
    [rejected, fixture.decisions[1]]
  );
  assert.throws(
    () =>
      validateSemanticAdjudication(
        fixture.input,
        {
          ...fixture.artifact,
          panels: [fixture.artifact.panels[0], disagreeingPanel],
        },
        fixture.authority
      ),
    /panels disagree/
  );
  assert.throws(
    () =>
      validateSemanticAdjudication(
        fixture.input,
        {
          ...fixture.artifact,
          panels: [fixture.artifact.panels[0], fixture.artifact.panels[0]],
        },
        fixture.authority
      ),
    /must be independent/
  );
});

test("unreviewed alternatives, contradictory decisions, and reviewer prose fail closed", () => {
  const fixture = validFixture();
  assert.throws(
    () =>
      panel("/root/panel_one", fixture.input.reviewInputSha256, [
        {
          ...fixture.decisions[0],
          evidenceRelevance: "legitimate_alternative",
          alternativeDisposition: "review_required",
          overallDecision: "reject",
        },
        fixture.decisions[1],
      ]),
    /non-terminal review_required/
  );
  assert.throws(
    () =>
      panel("/root/panel_one", fixture.input.reviewInputSha256, [
        {
          ...fixture.decisions[0],
          evidenceRelevance: "irrelevant",
          alternativeDisposition: "review_required",
          overallDecision: "reject",
        },
        fixture.decisions[1],
      ]),
    /non-terminal review_required/
  );
  assert.throws(
    () =>
      panel("/root/panel_one", fixture.input.reviewInputSha256, [
        {
          ...fixture.decisions[0],
          nextStepUsefulness: "not_useful",
          overallDecision: "accept",
        },
        fixture.decisions[1],
      ]),
    /contradicts its overall decision/
  );
  assert.throws(
    () =>
      validateSemanticAdjudication(
        fixture.input,
        {
          ...fixture.artifact,
          panels: [
            { ...fixture.artifact.panels[0], rationale: "accept everything" },
            fixture.artifact.panels[1],
          ],
        },
        fixture.authority
      ),
    /panel:0 fields/
  );
});

function validFixture() {
  const outputs = [
    {
      sanitizedOutputId: OUTPUT_ONE,
      sanitizedCaseId: CASE_ONE,
      runIndex: 0,
      responseSha256: sha256SyntheticCalibrationResponse(
        "private synthetic output one"
      ),
    },
    {
      sanitizedOutputId: OUTPUT_TWO,
      sanitizedCaseId: CASE_TWO,
      runIndex: 0,
      responseSha256: sha256SyntheticCalibrationResponse(
        "private synthetic output two"
      ),
    },
  ];
  const input = buildSemanticAdjudicationReviewInput({
    runId: "sav-251-fixture-run.v1",
    approvedPlan: { version: "synthetic-plan.v1", sha256: "0".repeat(64) },
    corpus: { version: "pm-gold-set.v4", sha256: "1".repeat(64) },
    prompt: { version: "feedback-prompt.v4", sha256: "2".repeat(64) },
    schema: { version: "feedback-v2", sha256: "3".repeat(64) },
    modelVersion: "synthetic-test-model.v1",
    outputs,
  });
  const decisions: SemanticAdjudicationDecision[] = [
    {
      ...outputs[0],
      evidenceRelevance: "relevant",
      observationAccuracy: "accurate",
      nextStepUsefulness: "useful",
      dimensionFit: "fits",
      alternativeDisposition: "not_applicable",
      overallDecision: "accept",
    },
    {
      ...outputs[1],
      evidenceRelevance: "legitimate_alternative",
      observationAccuracy: "accurate",
      nextStepUsefulness: "useful",
      dimensionFit: "fits",
      alternativeDisposition: "reviewed_legitimate",
      overallDecision: "accept",
    },
  ];
  const panels: [SemanticAdjudicationPanel, SemanticAdjudicationPanel] = [
    panel("/root/panel_one", input.reviewInputSha256, decisions),
    panel("/root/panel_two", input.reviewInputSha256, decisions),
  ];
  const authority = buildSemanticAdjudicationAuthorityEnvelope({
    approvedPlan: input.approvedPlan,
    expectedOutputs: outputs.map(
      ({ sanitizedOutputId, sanitizedCaseId, runIndex }) => ({
        sanitizedOutputId,
        sanitizedCaseId,
        runIndex,
      })
    ),
    panelExecutions: [
      {
        taskPath: "/root/panel_one",
        executionReceiptSha256: RECEIPT_ONE,
      },
      {
        taskPath: "/root/panel_two",
        executionReceiptSha256: RECEIPT_TWO,
      },
    ],
  });
  return {
    input,
    authority,
    decisions,
    artifact: {
      contractVersion: "evaluation-output-semantic-adjudication.v1" as const,
      humanReviewerIdentity: null,
      reviewInputSha256: input.reviewInputSha256,
      authorityEnvelopeSha256: authority.authorityEnvelopeSha256,
      panels,
    },
  };
}

function panel(
  taskPath: string,
  reviewInputSha256: string,
  decisions: SemanticAdjudicationDecision[],
  executionReceiptSha256 = taskPath === "/root/panel_one"
    ? RECEIPT_ONE
    : RECEIPT_TWO
) {
  return buildSemanticAdjudicationPanel({
    taskPath,
    executionReceiptSha256,
    reviewInputSha256,
    decisions,
  });
}
