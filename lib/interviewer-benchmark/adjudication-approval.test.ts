import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  INTERVIEWER_BENCHMARK_REVIEWED_MANIFEST_SHA256,
  getInterviewerBenchmarkAdjudicationCandidateManifestSha256,
  getInterviewerBenchmarkRequiredAdjudicationDecisions,
  parseInterviewerBenchmarkAdjudicationApprovalV1,
} from "./adjudication-approval";

const APPROVAL_PATH = resolve(
  process.cwd(),
  "docs/evidence/sav-467-interviewer-adjudication-approval.json"
);

test("committed approval binds the exact eight labels and manifest without claiming an identity or signature", async () => {
  const approval = parseInterviewerBenchmarkAdjudicationApprovalV1(
    await committedApproval()
  );

  assert.equal(
    getInterviewerBenchmarkAdjudicationCandidateManifestSha256(),
    INTERVIEWER_BENCHMARK_REVIEWED_MANIFEST_SHA256
  );
  assert.deepEqual(
    approval.decisions,
    getInterviewerBenchmarkRequiredAdjudicationDecisions()
  );
  assert.equal(approval.decisions.length, 8);
  assert.deepEqual(approval.authorityProvenance, {
    source: "explicit_product_owner_supervisor_chat_decision",
    sourceThreadId: "01a016c0-57eb-72c0-a744-92c802d6be0a",
    sourceMessageKind: "direct_user_message",
    decisionMakerRole: "product_owner",
    linearCheckpointCommentId: "b44d551e-d988-498f-94e9-16afdeaaac73",
    recordedAt: "2026-08-19T05:53:26.680Z",
  });
  assert.equal("signature" in approval.authorityProvenance, false);
  assert.equal("humanIdentity" in approval.authorityProvenance, false);
});

test("approval fails closed when decisions are missing, reordered, duplicated, altered, stale, or contradictory", async () => {
  const original = await committedApproval();
  const mutations: Array<[string, (approval: ApprovalRecord) => void]> = [
    ["missing", (approval) => approval.decisions.pop()],
    [
      "reordered",
      (approval) =>
        approval.decisions.splice(
          0,
          2,
          approval.decisions[1]!,
          approval.decisions[0]!
        ),
    ],
    [
      "duplicated",
      (approval) => {
        approval.decisions[1] = structuredClone(approval.decisions[0]!);
      },
    ],
    [
      "scenario",
      (approval) => {
        approval.decisions[0]!.scenarioId = "altered-scenario";
      },
    ],
    [
      "label",
      (approval) => {
        approval.decisions[0]!.expectedLabel = "weak";
      },
    ],
    [
      "seed",
      (approval) => {
        approval.decisions[0]!.seed = 43;
      },
    ],
    [
      "stale hash",
      (approval) => {
        approval.candidateManifest.sha256 = "0".repeat(64);
      },
    ],
    [
      "contradictory",
      (approval) => {
        approval.decisions[0]!.decision = "rejected";
      },
    ],
  ];

  for (const [name, mutate] of mutations) {
    const candidate = structuredClone(original);
    mutate(candidate);
    assert.throws(
      () => parseInterviewerBenchmarkAdjudicationApprovalV1(candidate),
      /interviewer_benchmark_adjudication_approval_invalid/,
      name
    );
  }
});

test("approval cannot broaden semantic adjudication into runtime or operational authority", async () => {
  const original = await committedApproval();
  const mutations: Array<(approval: ApprovalRecord) => void> = [
    (approval) => {
      approval.authorityScope.launchAuthority = true;
    },
    (approval) => {
      approval.authorityScope.canaryAuthority = true;
    },
    (approval) => {
      approval.authorityScope.defaultOnAuthority = true;
    },
    (approval) => {
      approval.authorityScope.providerCallAuthority = true;
    },
    (approval) => {
      approval.authorityScope.providerSpendAuthorityUsd = 1;
    },
    (approval) => {
      approval.authorityScope.productionAuthority = true;
    },
    (approval) => {
      approval.authorityScope.runtimeBehaviorAuthority = true;
    },
    (approval) => {
      approval.authorityScope.sav476GoNoGoAuthority = true;
    },
    (approval) => {
      approval.authorityProvenance.signature = "fabricated-signature";
    },
    (approval) => {
      approval.authorityProvenance.sourceMessageKind = "codex_delegation";
    },
    (approval) => {
      approval.authorityProvenance.linearCheckpointCommentId =
        "f7f0eceb-8b3c-466d-b275-4898d94c2348";
    },
    (approval) => {
      approval.authorityProvenance.recordedAt = "2026-08-19T05:55:07.149Z";
    },
  ];

  for (const mutate of mutations) {
    const candidate = structuredClone(original);
    mutate(candidate);
    assert.throws(
      () => parseInterviewerBenchmarkAdjudicationApprovalV1(candidate),
      /interviewer_benchmark_adjudication_approval_invalid/
    );
  }
});

async function committedApproval(): Promise<ApprovalRecord> {
  return JSON.parse(await readFile(APPROVAL_PATH, "utf8")) as ApprovalRecord;
}

interface ApprovalRecord {
  candidateManifest: { sha256: string };
  authorityProvenance: {
    signature?: string;
    sourceMessageKind: string;
    linearCheckpointCommentId: string;
    recordedAt: string;
  };
  authorityScope: {
    launchAuthority: boolean;
    canaryAuthority: boolean;
    defaultOnAuthority: boolean;
    providerCallAuthority: boolean;
    providerSpendAuthorityUsd: number | null;
    productionAuthority: boolean;
    runtimeBehaviorAuthority: boolean;
    sav476GoNoGoAuthority: boolean;
  };
  decisions: Array<{
    scenarioId: string;
    expectedLabel: string;
    seed: number;
    decision: string;
  }>;
}
