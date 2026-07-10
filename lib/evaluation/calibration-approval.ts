import { createHash } from "node:crypto";

import {
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  buildEvaluationAdjudicationReviewManifest,
  evaluationCalibrationCases,
} from "@meelni/test-fixtures";

export interface EvaluationAdjudicationApproval {
  contractVersion: "evaluation-adjudication-approval.v1";
  candidateArtifactHash: string;
  corpusHash: string;
  goldSetVersion: typeof EVALUATION_GOLD_SET_VERSION;
  adjudicationVersion: typeof EVALUATION_ADJUDICATION_VERSION;
  reviewer: {
    identity: string;
    role: "product_owner" | "pm_reviewer";
  };
  reviewedAt: string;
  decisions: Array<{
    caseId: string;
    decision: "approved" | "changes_required";
    note?: string;
  }>;
}

export function getEvaluationAdjudicationHashes() {
  const candidateArtifactHash = sha256(
    JSON.stringify(buildEvaluationAdjudicationReviewManifest())
  );
  const corpusHash = sha256(
    JSON.stringify(
      evaluationCalibrationCases.map((fixture) => ({
        id: fixture.id,
        roundType: fixture.roundType,
        expectedQuality: fixture.expectedQuality,
        expectedCompletionState: fixture.expectedCompletionState,
        scoreBands: fixture.scoreBands,
        transcript: fixture.transcript.map((turn) => ({
          contractVersion: turn.contractVersion,
          eventId: turn.eventId,
          speaker: turn.speaker,
          text: turn.text,
          startedAt: turn.startedAt.toISOString(),
          endedAt: turn.endedAt.toISOString(),
        })),
      }))
    )
  );
  return { candidateArtifactHash, corpusHash };
}

export function parseEvaluationAdjudicationApproval(
  input: unknown
): EvaluationAdjudicationApproval {
  const record = requireRecord(input, "approval");
  const hashes = getEvaluationAdjudicationHashes();
  if (record.contractVersion !== "evaluation-adjudication-approval.v1") {
    throw new Error("Invalid adjudication approval contractVersion");
  }
  if (record.candidateArtifactHash !== hashes.candidateArtifactHash) {
    throw new Error("Adjudication approval candidateArtifactHash mismatch");
  }
  if (record.corpusHash !== hashes.corpusHash) {
    throw new Error("Adjudication approval corpusHash mismatch");
  }
  if (record.goldSetVersion !== EVALUATION_GOLD_SET_VERSION) {
    throw new Error("Adjudication approval goldSetVersion mismatch");
  }
  if (record.adjudicationVersion !== EVALUATION_ADJUDICATION_VERSION) {
    throw new Error("Adjudication approval adjudicationVersion mismatch");
  }

  const reviewer = requireRecord(record.reviewer, "reviewer");
  const identity = requireText(reviewer.identity, "reviewer.identity");
  if (reviewer.role !== "product_owner" && reviewer.role !== "pm_reviewer") {
    throw new Error("Invalid adjudication approval reviewer.role");
  }
  const reviewedAt = requireText(record.reviewedAt, "reviewedAt");
  if (Number.isNaN(Date.parse(reviewedAt))) {
    throw new Error("Invalid adjudication approval reviewedAt");
  }
  if (!Array.isArray(record.decisions)) {
    throw new Error("Invalid adjudication approval decisions");
  }

  const requiredCaseIds = evaluationCalibrationCases
    .filter(({ expectedQuality }) => expectedQuality !== null)
    .map(({ id }) => id)
    .sort();
  const decisions = record.decisions.map<
    EvaluationAdjudicationApproval["decisions"][number]
  >((unknownDecision) => {
    const decision = requireRecord(unknownDecision, "decision");
    const caseId = requireText(decision.caseId, "decision.caseId");
    const decisionValue = decision.decision;
    if (decisionValue !== "approved" && decisionValue !== "changes_required") {
      throw new Error(`Invalid adjudication decision for ${caseId}`);
    }
    const note =
      decision.note === undefined
        ? undefined
        : requireText(decision.note, `decision.note:${caseId}`);
    return { caseId, decision: decisionValue, ...(note ? { note } : {}) };
  });
  const actualCaseIds = decisions.map(({ caseId }) => caseId).sort();
  if (
    actualCaseIds.length !== requiredCaseIds.length ||
    actualCaseIds.some((caseId, index) => caseId !== requiredCaseIds[index])
  ) {
    throw new Error(
      "Adjudication approval must contain exactly one decision for each of the 32 scored candidates"
    );
  }

  return {
    contractVersion: "evaluation-adjudication-approval.v1",
    ...hashes,
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    reviewer: { identity, role: reviewer.role },
    reviewedAt,
    decisions,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid adjudication approval ${field}`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid adjudication approval ${field}`);
  }
  return value.trim();
}
