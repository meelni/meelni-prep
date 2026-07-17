import { createHash } from "node:crypto";

import {
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  buildEvaluationAdjudicationReviewManifest,
  evaluationCalibrationCases,
} from "@meelni/test-fixtures";

export interface EvaluationAdjudicationApproval {
  contractVersion: "evaluation-adjudication-approval.v2";
  candidateArtifactHash: string;
  corpusHash: string;
  goldSetVersion: typeof EVALUATION_GOLD_SET_VERSION;
  adjudicationVersion: typeof EVALUATION_ADJUDICATION_VERSION;
  reviewer: {
    identity: string;
    role: "product_owner" | "pm_reviewer";
    identityType?: "human" | "delegated_task_thread";
  };
  reviewBasis: {
    candidateManifestVersion: "evaluation-adjudication-review.v2";
    independentExactHashReview: true;
    semanticAdjudicationOnly?: true;
  };
  delegatedAuthority?: {
    source: "product_owner_task_thread";
    humanReviewerIdentity: null;
    reviewedHead: string;
    roundHistory: Array<{
      round: 1 | 2 | 3;
      outcome: "changes_required" | "approved";
      correctedCaseCount: number;
      candidateArtifactHash?: string;
      corpusHash?: string;
    }>;
    panels: Array<{
      taskPath: string;
      verdict: "approved";
      candidateArtifactHash: string;
      corpusHash: string;
      approvedCases: 32;
      changesRequiredCases: 0;
    }>;
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
  if (record.contractVersion !== "evaluation-adjudication-approval.v2") {
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
  const reviewBasis = requireRecord(record.reviewBasis, "reviewBasis");
  if (
    reviewBasis.candidateManifestVersion !==
      "evaluation-adjudication-review.v2" ||
    reviewBasis.independentExactHashReview !== true
  ) {
    throw new Error("Invalid adjudication approval reviewBasis");
  }
  const identityType = reviewer.identityType;
  let delegatedAuthority: EvaluationAdjudicationApproval["delegatedAuthority"];
  if (identityType === "delegated_task_thread") {
    if (identity !== "product_owner_task_thread_delegation") {
      throw new Error("Invalid delegated approval reviewer identity");
    }
    if (reviewBasis.semanticAdjudicationOnly !== true) {
      throw new Error("Invalid delegated approval semantic scope");
    }
    const authority = requireRecord(
      record.delegatedAuthority,
      "delegatedAuthority"
    );
    if (
      authority.source !== "product_owner_task_thread" ||
      authority.humanReviewerIdentity !== null
    ) {
      throw new Error("Invalid delegated approval authority provenance");
    }
    const reviewedHead = requireSha256(
      authority.reviewedHead,
      "delegatedAuthority.reviewedHead"
    );
    if (!Array.isArray(authority.panels) || authority.panels.length !== 2) {
      throw new Error("Delegated approval requires exactly two agent panels");
    }
    const panelPaths = new Set<string>();
    const panels = authority.panels.map((unknownPanel) => {
      const panel = requireRecord(unknownPanel, "delegatedAuthority.panel");
      const taskPath = requireText(
        panel.taskPath,
        "delegatedAuthority.panel.taskPath"
      );
      if (panelPaths.has(taskPath)) {
        throw new Error("Delegated approval agent panels must be independent");
      }
      panelPaths.add(taskPath);
      if (
        panel.verdict !== "approved" ||
        panel.candidateArtifactHash !== hashes.candidateArtifactHash ||
        panel.corpusHash !== hashes.corpusHash ||
        panel.approvedCases !== 32 ||
        panel.changesRequiredCases !== 0
      ) {
        throw new Error("Invalid delegated approval agent-panel signoff");
      }
      return {
        taskPath,
        verdict: "approved" as const,
        candidateArtifactHash: hashes.candidateArtifactHash,
        corpusHash: hashes.corpusHash,
        approvedCases: 32 as const,
        changesRequiredCases: 0 as const,
      };
    });
    if (!Array.isArray(authority.roundHistory)) {
      throw new Error("Invalid delegated approval round history");
    }
    const roundHistory = authority.roundHistory.map((unknownRound, index) => {
      const round = requireRecord(
        unknownRound,
        "delegatedAuthority.roundHistory"
      );
      const expectedRound = (index + 1) as 1 | 2 | 3;
      if (
        round.round !== expectedRound ||
        (round.outcome !== "changes_required" &&
          round.outcome !== "approved") ||
        typeof round.correctedCaseCount !== "number"
      ) {
        throw new Error("Invalid delegated approval round history");
      }
      if (
        expectedRound === 3 &&
        (round.outcome !== "approved" ||
          round.correctedCaseCount !== 0 ||
          round.candidateArtifactHash !== hashes.candidateArtifactHash ||
          round.corpusHash !== hashes.corpusHash)
      ) {
        throw new Error("Invalid delegated approval final review round");
      }
      return {
        round: expectedRound,
        outcome: round.outcome as "changes_required" | "approved",
        correctedCaseCount: round.correctedCaseCount,
        ...(typeof round.candidateArtifactHash === "string"
          ? { candidateArtifactHash: round.candidateArtifactHash }
          : {}),
        ...(typeof round.corpusHash === "string"
          ? { corpusHash: round.corpusHash }
          : {}),
      };
    });
    if (roundHistory.length !== 3) {
      throw new Error("Invalid delegated approval round history");
    }
    delegatedAuthority = {
      source: "product_owner_task_thread",
      humanReviewerIdentity: null,
      reviewedHead,
      roundHistory,
      panels,
    };
  } else if (identityType !== undefined && identityType !== "human") {
    throw new Error("Invalid adjudication approval reviewer.identityType");
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
    contractVersion: "evaluation-adjudication-approval.v2",
    ...hashes,
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    reviewer: {
      identity,
      role: reviewer.role,
      ...(identityType ? { identityType } : {}),
    },
    reviewBasis: {
      candidateManifestVersion: "evaluation-adjudication-review.v2",
      independentExactHashReview: true,
      ...(reviewBasis.semanticAdjudicationOnly === true
        ? { semanticAdjudicationOnly: true as const }
        : {}),
    },
    ...(delegatedAuthority ? { delegatedAuthority } : {}),
    reviewedAt,
    decisions,
  };
}

export function buildDelegatedEvaluationAdjudicationApproval(): EvaluationAdjudicationApproval {
  const hashes = getEvaluationAdjudicationHashes();
  const expectedCandidateHash =
    "80870d1fbf1ee464b874f6da755563cf54149e3c8183171a89c03b5a70853317";
  const expectedCorpusHash =
    "31a6235c228c44f78cdcf44dec403c24fef64d7d6320424d1d2b6614e149b87c";
  if (
    hashes.candidateArtifactHash !== expectedCandidateHash ||
    hashes.corpusHash !== expectedCorpusHash
  ) {
    throw new Error("Delegated approval exact reviewed hashes changed");
  }
  return parseEvaluationAdjudicationApproval({
    contractVersion: "evaluation-adjudication-approval.v2",
    ...hashes,
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    reviewer: {
      identity: "product_owner_task_thread_delegation",
      role: "product_owner",
      identityType: "delegated_task_thread",
    },
    reviewBasis: {
      candidateManifestVersion: "evaluation-adjudication-review.v2",
      independentExactHashReview: true,
      semanticAdjudicationOnly: true,
    },
    reviewedAt: "2026-07-17T00:37:53.000Z",
    delegatedAuthority: {
      source: "product_owner_task_thread",
      humanReviewerIdentity: null,
      reviewedHead: "b41925ad60f962c7c337d7a9f3e609226f597f20",
      roundHistory: [
        { round: 1, outcome: "changes_required", correctedCaseCount: 17 },
        { round: 2, outcome: "changes_required", correctedCaseCount: 4 },
        {
          round: 3,
          outcome: "approved",
          correctedCaseCount: 0,
          ...hashes,
        },
      ],
      panels: [
        "/root/resolve_pr274_calibration/calibration_prompt_review_a",
        "/root/resolve_pr274_calibration/calibration_prompt_review_b",
      ].map((taskPath) => ({
        taskPath,
        verdict: "approved",
        ...hashes,
        approvedCases: 32,
        changesRequiredCases: 0,
      })),
    },
    decisions: evaluationCalibrationCases
      .filter(({ expectedQuality }) => expectedQuality !== null)
      .map(({ id }) => ({ caseId: id, decision: "approved" })),
  });
}

function requireSha256(value: unknown, field: string): string {
  const text = requireText(value, field);
  if (!/^[a-f0-9]{40,64}$/.test(text)) {
    throw new Error(`Invalid adjudication approval ${field}`);
  }
  return text;
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
