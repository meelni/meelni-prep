import { createHash } from "node:crypto";

import {
  INTERVIEWER_BENCHMARK_SCENARIO_VERSION,
  INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION,
  INTERVIEWER_QUALITY_RUBRIC_VERSION,
} from "@meelni/agent";
import {
  INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS,
  INTERVIEWER_BENCHMARK_SUITE_VERSION,
  createInterviewerBenchmarkJudgeOutputs,
  createInterviewerBenchmarkScenarios,
} from "@meelni/test-fixtures/interviewer-benchmark";

export const INTERVIEWER_BENCHMARK_ADJUDICATION_APPROVAL_VERSION =
  "meelni.interviewer-benchmark-adjudication-approval.v1" as const;
export const INTERVIEWER_BENCHMARK_ACCEPTED_ADJUDICATION_STATUS =
  "product_owner_accepted_exact_candidate_manifest" as const;
export const INTERVIEWER_BENCHMARK_REVIEWED_MANIFEST_SHA256 =
  "312e086a46334ab3af3907406c90302990ab3ea90063e2ecc6428e17af30c70f" as const;
export const INTERVIEWER_BENCHMARK_OWNER_DECISION_SOURCE_THREAD_ID =
  "01a016c0-57eb-72c0-a744-92c802d6be0a" as const;
export const INTERVIEWER_BENCHMARK_OWNER_DECISION_LINEAR_COMMENT_ID =
  "b44d551e-d988-498f-94e9-16afdeaaac73" as const;
export const INTERVIEWER_BENCHMARK_OWNER_DECISION_RECORDED_AT =
  "2026-08-19T05:53:26.680Z" as const;

export interface InterviewerBenchmarkAdjudicationApprovalV1 {
  contractVersion: typeof INTERVIEWER_BENCHMARK_ADJUDICATION_APPROVAL_VERSION;
  candidateManifest: {
    sha256: typeof INTERVIEWER_BENCHMARK_REVIEWED_MANIFEST_SHA256;
    fixtureContractVersion: typeof INTERVIEWER_BENCHMARK_SCENARIO_VERSION;
    suiteVersion: typeof INTERVIEWER_BENCHMARK_SUITE_VERSION;
    judgeOutputVersion: typeof INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION;
    rubricVersion: typeof INTERVIEWER_QUALITY_RUBRIC_VERSION;
  };
  authorityProvenance: {
    source: "explicit_product_owner_supervisor_chat_decision";
    sourceThreadId: typeof INTERVIEWER_BENCHMARK_OWNER_DECISION_SOURCE_THREAD_ID;
    sourceMessageKind: "direct_user_message";
    decisionMakerRole: "product_owner";
    linearCheckpointCommentId: typeof INTERVIEWER_BENCHMARK_OWNER_DECISION_LINEAR_COMMENT_ID;
    recordedAt: typeof INTERVIEWER_BENCHMARK_OWNER_DECISION_RECORDED_AT;
  };
  authorityScope: {
    semanticGoldSetAdjudicationOnly: true;
    launchAuthority: false;
    canaryAuthority: false;
    defaultOnAuthority: false;
    providerCallAuthority: false;
    providerSpendAuthorityUsd: null;
    productionAuthority: false;
    runtimeBehaviorAuthority: false;
    sav476GoNoGoAuthority: false;
  };
  decisions: InterviewerBenchmarkAdjudicationDecisionV1[];
}

export interface InterviewerBenchmarkAdjudicationDecisionV1 {
  scenarioId: string;
  expectedLabel: "strong" | "weak";
  seed: number;
  decision: "accepted";
}

export function getInterviewerBenchmarkAdjudicationCandidateManifestSha256(): string {
  const scenarios = createInterviewerBenchmarkScenarios();
  const outputs = createInterviewerBenchmarkJudgeOutputs();
  const entries = INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS.flatMap(
    ({ strong, weak }) => [strong, weak]
  ).map((example) => {
    const scenario = scenarios.find(
      ({ scenario_id: scenarioId }) => scenarioId === example.scenario_id
    );
    const output = outputs.find(
      ({ scenario_id: scenarioId, seed }) =>
        scenarioId === example.scenario_id && seed === example.seed
    );
    if (!scenario || !output) {
      throw new Error(
        "interviewer_benchmark_adjudication_candidate_incomplete"
      );
    }
    return { example, scenario, output };
  });
  return sha256(stableJson(entries));
}

export function getInterviewerBenchmarkRequiredAdjudicationDecisions(): InterviewerBenchmarkAdjudicationDecisionV1[] {
  return INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS.flatMap(({ strong, weak }) => [
    {
      scenarioId: strong.scenario_id,
      expectedLabel: strong.expected_quality,
      seed: strong.seed,
      decision: "accepted" as const,
    },
    {
      scenarioId: weak.scenario_id,
      expectedLabel: weak.expected_quality,
      seed: weak.seed,
      decision: "accepted" as const,
    },
  ]);
}

export function parseInterviewerBenchmarkAdjudicationApprovalV1(
  input: unknown
): InterviewerBenchmarkAdjudicationApprovalV1 {
  const approval = requireExactRecord(input, [
    "contractVersion",
    "candidateManifest",
    "authorityProvenance",
    "authorityScope",
    "decisions",
  ]);
  if (
    approval.contractVersion !==
    INTERVIEWER_BENCHMARK_ADJUDICATION_APPROVAL_VERSION
  ) {
    invalidApproval();
  }

  const candidateManifest = requireExactRecord(approval.candidateManifest, [
    "sha256",
    "fixtureContractVersion",
    "suiteVersion",
    "judgeOutputVersion",
    "rubricVersion",
  ]);
  const computedManifestSha256 =
    getInterviewerBenchmarkAdjudicationCandidateManifestSha256();
  if (
    computedManifestSha256 !== INTERVIEWER_BENCHMARK_REVIEWED_MANIFEST_SHA256 ||
    candidateManifest.sha256 !== computedManifestSha256 ||
    candidateManifest.fixtureContractVersion !==
      INTERVIEWER_BENCHMARK_SCENARIO_VERSION ||
    candidateManifest.suiteVersion !== INTERVIEWER_BENCHMARK_SUITE_VERSION ||
    candidateManifest.judgeOutputVersion !==
      INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION ||
    candidateManifest.rubricVersion !== INTERVIEWER_QUALITY_RUBRIC_VERSION
  ) {
    invalidApproval();
  }

  const authorityProvenance = requireExactRecord(approval.authorityProvenance, [
    "source",
    "sourceThreadId",
    "sourceMessageKind",
    "decisionMakerRole",
    "linearCheckpointCommentId",
    "recordedAt",
  ]);
  if (
    authorityProvenance.source !==
      "explicit_product_owner_supervisor_chat_decision" ||
    authorityProvenance.sourceThreadId !==
      INTERVIEWER_BENCHMARK_OWNER_DECISION_SOURCE_THREAD_ID ||
    authorityProvenance.sourceMessageKind !== "direct_user_message" ||
    authorityProvenance.decisionMakerRole !== "product_owner" ||
    authorityProvenance.linearCheckpointCommentId !==
      INTERVIEWER_BENCHMARK_OWNER_DECISION_LINEAR_COMMENT_ID ||
    authorityProvenance.recordedAt !==
      INTERVIEWER_BENCHMARK_OWNER_DECISION_RECORDED_AT
  ) {
    invalidApproval();
  }

  const authorityScope = requireExactRecord(approval.authorityScope, [
    "semanticGoldSetAdjudicationOnly",
    "launchAuthority",
    "canaryAuthority",
    "defaultOnAuthority",
    "providerCallAuthority",
    "providerSpendAuthorityUsd",
    "productionAuthority",
    "runtimeBehaviorAuthority",
    "sav476GoNoGoAuthority",
  ]);
  if (
    authorityScope.semanticGoldSetAdjudicationOnly !== true ||
    authorityScope.launchAuthority !== false ||
    authorityScope.canaryAuthority !== false ||
    authorityScope.defaultOnAuthority !== false ||
    authorityScope.providerCallAuthority !== false ||
    authorityScope.providerSpendAuthorityUsd !== null ||
    authorityScope.productionAuthority !== false ||
    authorityScope.runtimeBehaviorAuthority !== false ||
    authorityScope.sav476GoNoGoAuthority !== false
  ) {
    invalidApproval();
  }

  if (!Array.isArray(approval.decisions)) invalidApproval();
  const requiredDecisions =
    getInterviewerBenchmarkRequiredAdjudicationDecisions();
  const decisions = approval.decisions.map((candidate, index) => {
    const decision = requireExactRecord(candidate, [
      "scenarioId",
      "expectedLabel",
      "seed",
      "decision",
    ]);
    const required = requiredDecisions[index];
    if (
      !required ||
      decision.scenarioId !== required.scenarioId ||
      decision.expectedLabel !== required.expectedLabel ||
      decision.seed !== required.seed ||
      decision.decision !== "accepted"
    ) {
      invalidApproval();
    }
    return { ...required };
  });
  if (decisions.length !== requiredDecisions.length) invalidApproval();

  return {
    contractVersion: INTERVIEWER_BENCHMARK_ADJUDICATION_APPROVAL_VERSION,
    candidateManifest: {
      sha256: INTERVIEWER_BENCHMARK_REVIEWED_MANIFEST_SHA256,
      fixtureContractVersion: INTERVIEWER_BENCHMARK_SCENARIO_VERSION,
      suiteVersion: INTERVIEWER_BENCHMARK_SUITE_VERSION,
      judgeOutputVersion: INTERVIEWER_QUALITY_JUDGE_OUTPUT_VERSION,
      rubricVersion: INTERVIEWER_QUALITY_RUBRIC_VERSION,
    },
    authorityProvenance: {
      source: "explicit_product_owner_supervisor_chat_decision",
      sourceThreadId: INTERVIEWER_BENCHMARK_OWNER_DECISION_SOURCE_THREAD_ID,
      sourceMessageKind: "direct_user_message",
      decisionMakerRole: "product_owner",
      linearCheckpointCommentId:
        INTERVIEWER_BENCHMARK_OWNER_DECISION_LINEAR_COMMENT_ID,
      recordedAt: INTERVIEWER_BENCHMARK_OWNER_DECISION_RECORDED_AT,
    },
    authorityScope: {
      semanticGoldSetAdjudicationOnly: true,
      launchAuthority: false,
      canaryAuthority: false,
      defaultOnAuthority: false,
      providerCallAuthority: false,
      providerSpendAuthorityUsd: null,
      productionAuthority: false,
      runtimeBehaviorAuthority: false,
      sav476GoNoGoAuthority: false,
    },
    decisions,
  };
}

export function parseInterviewerBenchmarkAdjudicationApprovalJson(
  contents: string
): InterviewerBenchmarkAdjudicationApprovalV1 {
  let input: unknown;
  try {
    input = JSON.parse(contents);
  } catch {
    invalidApproval();
  }
  const approval = parseInterviewerBenchmarkAdjudicationApprovalV1(input);
  if (
    contents !== serializeInterviewerBenchmarkAdjudicationApproval(approval)
  ) {
    invalidApproval();
  }
  return approval;
}

export function serializeInterviewerBenchmarkAdjudicationApproval(
  approval: InterviewerBenchmarkAdjudicationApprovalV1
): string {
  return `${JSON.stringify(approval, null, 2)}\n`;
}

export function hashInterviewerBenchmarkAdjudicationApproval(
  approval: InterviewerBenchmarkAdjudicationApprovalV1
): string {
  return sha256(stableJson(approval));
}

function requireExactRecord(
  value: unknown,
  keys: readonly string[]
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidApproval();
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalidApproval();
  }
  return record;
}

function invalidApproval(): never {
  throw new Error("interviewer_benchmark_adjudication_approval_invalid");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, candidate) =>
    candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? Object.fromEntries(
          Object.entries(candidate as Record<string, unknown>).sort(
            ([a], [b]) => a.localeCompare(b)
          )
        )
      : candidate
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
