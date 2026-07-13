import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parseExpectations,
  readPrivateReceipt,
  validatePreviewGoldenPathReceipt,
} from "./verify-preview-golden-path-receipt.mjs";

const EXPECTATIONS = {
  receiptPath: "/private/tmp/golden-path.json",
  commitSha: "a".repeat(40),
  deploymentId: "dpl_exact123",
  deploymentUrl: "https://meelni-exact-meelni.vercel.app/",
  branch: "codex/sav-226-provider-isolation",
  supabaseProjectRef: "previewprojectref",
  livekitProjectId: "p_preview123",
  livekitAgentId: "CA_preview123",
  livekitDispatchName: "meelni-preview-interview",
  inngestEnvironment: "codex-sav-226-provider-isolation",
  feedbackModel: "gpt-5.1",
};

function validReceipt() {
  return {
    contract: "meelni_preview_golden_path",
    version: 1,
    rehearsalId: "sav-186-preview-001",
    observedAt: "2026-07-13T13:30:00.000Z",
    deployment: {
      environment: "preview",
      id: EXPECTATIONS.deploymentId,
      url: EXPECTATIONS.deploymentUrl,
      commitSha: EXPECTATIONS.commitSha,
      branch: EXPECTATIONS.branch,
    },
    providerIdentity: {
      supabaseProjectRef: EXPECTATIONS.supabaseProjectRef,
      livekitProjectId: EXPECTATIONS.livekitProjectId,
      livekitAgentId: EXPECTATIONS.livekitAgentId,
      livekitAgentVersion: "LJ_preview123",
      livekitDispatchName: EXPECTATIONS.livekitDispatchName,
      inngestEnvironment: EXPECTATIONS.inngestEnvironment,
    },
    correlation: {
      sessionIdSha256: "b".repeat(64),
      roomNameSha256: "c".repeat(64),
      startAttemptIdMatchesSessionId: true,
    },
    assertions: {
      defaultOffBefore: {
        httpStatus: 403,
        errorCode: "interview_practice_unavailable",
        mutationDelta: {
          sessions: 0,
          creditTransactions: 0,
          rooms: 0,
          dispatches: 0,
        },
      },
      syntheticAccount: {
        fresh: true,
        authenticated: true,
        customerRecordUsed: false,
      },
      trial: {
        catalogId: "trial",
        grantCount: 1,
        grantTransactionCount: 1,
        originalCredits: 2,
        consumedCredits: 1,
        remainingCredits: 1,
        reservedCredits: 0,
      },
      selectedQuestion: {
        roundType: "product_sense",
        startResponseMatched: true,
        roomMetadataMatched: true,
        firstQuestionObserved: true,
        containsContent: false,
      },
      livekit: {
        agentStatus: "running",
        dispatchName: EXPECTATIONS.livekitDispatchName,
        dispatchCount: 1,
        candidateJoined: true,
        agentJoined: true,
        runtimeActivated: true,
      },
      durableTranscript: {
        contractVersion: 2,
        turnCount: 8,
        candidateTurnCount: 3,
        substantiveCandidateTurnCount: 3,
        durationSeconds: 305,
        allPersisted: true,
        allSessionCorrelated: true,
        allRoomCorrelated: true,
        containsContent: false,
      },
      terminal: {
        lifecycleState: "completed",
        terminalReason: "user_end",
        feedbackTier: "partial",
        usableEvidence: true,
        creditSettlement: "consume",
        roomCleanupStatus: "deleted",
      },
      feedback: {
        dispatchStatus: "dispatched",
        finalStatus: "completed",
        schemaVersion: "feedback.v2",
        promptVersion: "feedback.prompt.v2",
        rubricVersion: "pm-feedback-rubric.v2",
        modelVersion: EXPECTATIONS.feedbackModel,
        evaluationState: "partial",
        strengthCount: 2,
        improvementCount: 2,
        containsContent: false,
        providerCallCount: 1,
        providerWorstCaseNanoUsd: 1_000_000,
        hardSpendCapNanoUsd: 100_000_000,
      },
      isolation: {
        candidateOnlyGate: true,
        unrelatedAccountDenied: true,
        customerDataUsed: false,
        productionDataUsed: false,
        productionMutationCount: 0,
      },
      defaultOffAfter: {
        httpStatus: 403,
        errorCode: "interview_practice_unavailable",
        mutationDelta: {
          sessions: 0,
          creditTransactions: 0,
          rooms: 0,
          dispatches: 0,
        },
      },
      cleanup: {
        syntheticAccountRemoved: true,
        livekitRoomAbsent: true,
        temporaryGateRuleRemoved: true,
        bypassRevokedOrRotated: true,
        temporaryArtifactsRemoved: true,
      },
    },
  };
}

test("exact synthetic Preview receipt produces one content-free hash", () => {
  const receipt = validReceipt();
  const result = validatePreviewGoldenPathReceipt(receipt, EXPECTATIONS, {
    now: new Date("2026-07-13T13:31:00.000Z"),
  });

  assert.equal(result.status, "passed");
  assert.equal(result.commitSha, EXPECTATIONS.commitSha);
  assert.match(result.receiptSha256, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(
    JSON.stringify(result),
    /question|transcript|email|token/i
  );
});

test("receipt fails closed on stale deployment identity and extra content", () => {
  const stale = validReceipt();
  stale.deployment.commitSha = "d".repeat(40);
  assert.throws(
    () =>
      validatePreviewGoldenPathReceipt(stale, EXPECTATIONS, {
        now: new Date("2026-07-13T13:31:00.000Z"),
      }),
    /deployment\.commitSha_mismatch/
  );

  const content = validReceipt();
  content.assertions.durableTranscript.extra = true;
  assert.throws(
    () =>
      validatePreviewGoldenPathReceipt(content, EXPECTATIONS, {
        now: new Date("2026-07-13T13:31:00.000Z"),
      }),
    /receipt_shape_invalid/
  );
});

test("receipt fails closed when lifecycle, feedback, or isolation gates are weak", () => {
  for (const mutate of [
    (receipt) => {
      receipt.assertions.durableTranscript.durationSeconds = 299;
    },
    (receipt) => {
      receipt.assertions.feedback.finalStatus = "processing";
    },
    (receipt) => {
      receipt.assertions.isolation.unrelatedAccountDenied = false;
    },
    (receipt) => {
      receipt.assertions.cleanup.temporaryGateRuleRemoved = false;
    },
    (receipt) => {
      receipt.assertions.feedback.providerWorstCaseNanoUsd = 100_000_000;
    },
  ]) {
    const receipt = validReceipt();
    mutate(receipt);
    assert.throws(() =>
      validatePreviewGoldenPathReceipt(receipt, EXPECTATIONS, {
        now: new Date("2026-07-13T13:31:00.000Z"),
      })
    );
  }
});

test("CLI expectations require every exact provider and deployment identity", () => {
  const args = [
    "--receipt",
    EXPECTATIONS.receiptPath,
    "--expect-head",
    EXPECTATIONS.commitSha,
    "--expect-deployment-id",
    EXPECTATIONS.deploymentId,
    "--expect-deployment-url",
    EXPECTATIONS.deploymentUrl,
    "--expect-branch",
    EXPECTATIONS.branch,
    "--expect-supabase-project-ref",
    EXPECTATIONS.supabaseProjectRef,
    "--expect-livekit-project-id",
    EXPECTATIONS.livekitProjectId,
    "--expect-livekit-agent-id",
    EXPECTATIONS.livekitAgentId,
    "--expect-livekit-dispatch-name",
    EXPECTATIONS.livekitDispatchName,
    "--expect-inngest-environment",
    EXPECTATIONS.inngestEnvironment,
    "--expect-feedback-model",
    EXPECTATIONS.feedbackModel,
  ];
  assert.deepEqual(parseExpectations(args), EXPECTATIONS);
  assert.throws(
    () => parseExpectations(args.slice(0, -2)),
    /arguments_missing/
  );
});

test("receipt loader accepts only a small private absolute regular file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-golden-path-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "receipt.json");
  await writeFile(path, `${JSON.stringify(validReceipt())}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  assert.deepEqual(await readPrivateReceipt(path), validReceipt());

  await chmod(path, 0o644);
  await assert.rejects(
    () => readPrivateReceipt(path),
    /receipt_permissions_invalid/
  );
  await assert.rejects(
    () => readPrivateReceipt("relative.json"),
    /receipt_path_not_absolute/
  );
});
