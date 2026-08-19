import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  INTERVIEWER_BENCHMARK_EXECUTION_AUTHORIZATION_VERSION,
  INTERVIEWER_QUALITY_JUDGE_ADAPTER_VERSION,
  type InterviewerBenchmarkExecutionAuthorizationV1,
  type InterviewerQualityJudgeAdapterV1,
} from "@meelni/agent";

import {
  createProviderFreeInterviewerJudgeAdapter,
  runInterviewerBenchmark,
  serializeInterviewerBenchmarkReport,
} from "./runner";

const SOURCE_HASH = "a".repeat(64);
const BENCHMARK_SOURCE_HASH = "b".repeat(64);

test("provider-free baseline is complete, bounded, actionable, and reproducible", async () => {
  const first = await runInterviewerBenchmark(
    createProviderFreeInterviewerJudgeAdapter(),
    SOURCE_HASH,
    BENCHMARK_SOURCE_HASH
  );
  const second = await runInterviewerBenchmark(
    createProviderFreeInterviewerJudgeAdapter(),
    SOURCE_HASH,
    BENCHMARK_SOURCE_HASH
  );

  assert.equal(
    serializeInterviewerBenchmarkReport(first),
    serializeInterviewerBenchmarkReport(second)
  );
  assert.equal(first.execution.providerCalls, 0);
  assert.equal(first.execution.actualCostUsd, 0);
  assert.equal(first.execution.inputTokens, null);
  assert.equal(first.execution.outputTokens, null);
  assert.equal(first.execution.providerCredentialRead, false);
  assert.equal(first.execution.productionCalled, false);
  assert.equal(first.execution.authorization.kind, "provider_free");
  assert.equal(first.corpus.scenarios, 14);
  assert.equal(first.corpus.baselineSessions, 4);
  assert.equal(first.corpus.rounds, 4);
  assert.equal(first.corpus.candidateBehaviors, 7);
  assert.equal(first.corpus.invariantControls, 6);
  assert.equal(first.corpus.judgeRuns, 12);
  assert.equal(first.corpus.calibrationExamples, 8);
  assert.equal(first.deterministicInvariants.status, "passed");
  assert.equal(first.aggregate.maximumDimensionRange, 1);
  assert.ok(first.aggregate.actionableFailures >= 6);
  assert.equal(first.thresholds.shadowEntry.eligible, false);
  assert.equal(first.ownerAdjudication.reusedSav198Adjudication, false);
  assert.equal(
    first.ownerAdjudication.status,
    "agent_authored_pending_product_owner_review"
  );
  assert.equal(first.ownerAdjudication.approval, null);
  assert.equal(
    first.conclusion,
    "baseline_recorded_owner_adjudication_pending"
  );
});

test("runner reports accepted only after the exact approval verifies and preserves every authority fence", async () => {
  const approval = JSON.parse(
    await readFile(
      resolve(
        process.cwd(),
        "docs/evidence/sav-467-interviewer-adjudication-approval.json"
      ),
      "utf8"
    )
  );
  const report = await runInterviewerBenchmark(
    createProviderFreeInterviewerJudgeAdapter(),
    SOURCE_HASH,
    BENCHMARK_SOURCE_HASH,
    undefined,
    approval
  );

  assert.equal(
    report.ownerAdjudication.status,
    "product_owner_accepted_exact_candidate_manifest"
  );
  assert.equal(report.ownerAdjudication.acceptedExamples, 8);
  assert.equal(report.ownerAdjudication.requiredAction, null);
  assert.ok(report.ownerAdjudication.approval);
  assert.equal(
    "signature" in report.ownerAdjudication.approval.authorityProvenance,
    false
  );
  assert.deepEqual(report.ownerAdjudication.approval.authorityScope, {
    semanticGoldSetAdjudicationOnly: true,
    launchAuthority: false,
    canaryAuthority: false,
    defaultOnAuthority: false,
    providerCallAuthority: false,
    providerSpendAuthorityUsd: null,
    productionAuthority: false,
    runtimeBehaviorAuthority: false,
    sav476GoNoGoAuthority: false,
  });
  assert.equal(report.thresholds.shadowEntry.eligible, false);
  assert.deepEqual(report.thresholds.shadowEntry.blockers, [
    "provider-backed candidate evidence has not been run",
  ]);
  assert.equal(report.execution.providerCalls, 0);
  assert.equal(report.execution.providerCredentialRead, false);
  assert.equal(report.execution.productionCalled, false);
  assert.equal(
    report.conclusion,
    "baseline_recorded_owner_adjudication_accepted"
  );
});

test("runner rejects a stale approval before any judge invocation", async () => {
  const replay = createProviderFreeInterviewerJudgeAdapter();
  let judgeCalls = 0;
  const adapter: InterviewerQualityJudgeAdapterV1 = {
    ...replay,
    async judge(request) {
      judgeCalls += 1;
      return replay.judge(request);
    },
  };
  const approval = JSON.parse(
    await readFile(
      resolve(
        process.cwd(),
        "docs/evidence/sav-467-interviewer-adjudication-approval.json"
      ),
      "utf8"
    )
  );
  approval.candidateManifest.sha256 = "0".repeat(64);

  await assert.rejects(
    runInterviewerBenchmark(
      adapter,
      SOURCE_HASH,
      BENCHMARK_SOURCE_HASH,
      undefined,
      approval
    ),
    /interviewer_benchmark_adjudication_approval_invalid/
  );
  assert.equal(judgeCalls, 0);
});

test("runner fails closed on malformed judge output", async () => {
  const adapter: InterviewerQualityJudgeAdapterV1 = {
    contract_version: INTERVIEWER_QUALITY_JUDGE_ADAPTER_VERSION,
    execution_mode: "provider_backed_explicit_opt_in",
    expected_model_version: "synthetic-provider-model.v1",
    async judge() {
      return {
        raw_output: {},
        model_version: "synthetic-provider-model.v1",
        usage: {
          latency_ms: 1,
          provider_calls: 1,
          input_tokens: 1,
          output_tokens: 1,
          actual_cost_usd: 0.01,
          provider_credential_read: true,
          production_called: false,
        },
      };
    },
  };
  await assert.rejects(
    runInterviewerBenchmark(
      adapter,
      SOURCE_HASH,
      BENCHMARK_SOURCE_HASH,
      explicitAuthorization()
    ),
    /interviewer_benchmark_judge_output_invalid/
  );
});

test("provider-free replay rejects the reviewer's contradictory usage exploit", async () => {
  const replay = createProviderFreeInterviewerJudgeAdapter();
  const adapter: InterviewerQualityJudgeAdapterV1 = {
    ...replay,
    async judge(request) {
      const result = await replay.judge(request);
      return {
        ...result,
        usage: {
          ...result.usage,
          provider_calls: 1,
          input_tokens: -1,
          output_tokens: Number.POSITIVE_INFINITY,
          actual_cost_usd: 0.01,
        },
      };
    },
  };

  await assert.rejects(
    runInterviewerBenchmark(adapter, SOURCE_HASH, BENCHMARK_SOURCE_HASH),
    /interviewer_benchmark_judge_usage_invalid/
  );
});

test("provider-free replay rejects tokens, credential reads, Production, and model contradictions", async () => {
  const replay = createProviderFreeInterviewerJudgeAdapter();
  const mutations: Array<
    (
      result: Awaited<ReturnType<typeof replay.judge>>
    ) =>
      | Awaited<ReturnType<typeof replay.judge>>
      | Promise<Awaited<ReturnType<typeof replay.judge>>>
  > = [
    (result) => ({
      ...result,
      usage: { ...result.usage, input_tokens: 0 },
    }),
    (result) => ({
      ...result,
      usage: { ...result.usage, provider_credential_read: true },
    }),
    (result) => ({
      ...result,
      usage: { ...result.usage, production_called: true },
    }),
    (result) => ({ ...result, model_version: "unversioned-model" }),
  ];

  for (const mutate of mutations) {
    const adapter: InterviewerQualityJudgeAdapterV1 = {
      ...replay,
      async judge(request) {
        return mutate(await replay.judge(request));
      },
    };
    await assert.rejects(
      runInterviewerBenchmark(adapter, SOURCE_HASH, BENCHMARK_SOURCE_HASH),
      /interviewer_benchmark_judge_usage_invalid|interviewer_benchmark_execution_authorization_invalid/
    );
  }
});

test("provider-backed execution requires explicit authorization before invoking the adapter", async () => {
  let judgeCalls = 0;
  const replay = createProviderFreeInterviewerJudgeAdapter();
  const adapter: InterviewerQualityJudgeAdapterV1 = {
    contract_version: INTERVIEWER_QUALITY_JUDGE_ADAPTER_VERSION,
    execution_mode: "provider_backed_explicit_opt_in",
    expected_model_version: replay.expected_model_version,
    async judge(request) {
      judgeCalls += 1;
      return replay.judge(request);
    },
  };

  await assert.rejects(
    runInterviewerBenchmark(adapter, SOURCE_HASH, BENCHMARK_SOURCE_HASH),
    /interviewer_benchmark_execution_authorization_invalid/
  );
  assert.equal(judgeCalls, 0);
});

test("provider-backed usage rejects malformed token counts and false execution evidence", async () => {
  const invalidUsage = [
    { input_tokens: -1 },
    { output_tokens: Number.POSITIVE_INFINITY },
    { input_tokens: 1.5 },
    { output_tokens: null },
    { input_tokens: 100_001 },
    { output_tokens: 100_001 },
    { provider_calls: 0 },
    { provider_credential_read: false },
    { production_called: true },
  ];

  for (const mutation of invalidUsage) {
    const adapter = syntheticProviderBackedAdapter(mutation);
    await assert.rejects(
      runInterviewerBenchmark(
        adapter,
        SOURCE_HASH,
        BENCHMARK_SOURCE_HASH,
        explicitAuthorization()
      ),
      /interviewer_benchmark_judge_usage_invalid/
    );
  }
});

test("synthetic provider-backed boundary reports bounded execution evidence truthfully", async () => {
  const report = await runInterviewerBenchmark(
    syntheticProviderBackedAdapter(),
    SOURCE_HASH,
    BENCHMARK_SOURCE_HASH,
    explicitAuthorization()
  );

  assert.equal(report.execution.kind, "provider_backed_explicit_opt_in");
  assert.equal(report.execution.authorization.kind, "explicit_provider_opt_in");
  assert.equal(report.execution.providerCalls, 12);
  assert.equal(report.execution.inputTokens, 120);
  assert.equal(report.execution.outputTokens, 60);
  assert.equal(report.execution.actualCostUsd, 0.12);
  assert.equal(report.execution.providerCredentialRead, true);
  assert.equal(report.execution.productionCalled, false);
});

function explicitAuthorization(): InterviewerBenchmarkExecutionAuthorizationV1 {
  return {
    contract_version: INTERVIEWER_BENCHMARK_EXECUTION_AUTHORIZATION_VERSION,
    execution_mode: "provider_backed_explicit_opt_in",
    authorization: "explicit_provider_opt_in",
    allow_provider_credentials: true,
    allow_production: false,
    maximum_provider_calls: 12,
    maximum_input_tokens_per_call: 100_000,
    maximum_output_tokens_per_call: 100_000,
    maximum_actual_cost_usd: 1,
  };
}

function syntheticProviderBackedAdapter(
  usageMutation: Record<string, unknown> = {}
): InterviewerQualityJudgeAdapterV1 {
  const replay = createProviderFreeInterviewerJudgeAdapter();
  return {
    contract_version: INTERVIEWER_QUALITY_JUDGE_ADAPTER_VERSION,
    execution_mode: "provider_backed_explicit_opt_in",
    expected_model_version: replay.expected_model_version,
    async judge(request) {
      const result = await replay.judge(request);
      return {
        ...result,
        usage: {
          latency_ms: 2,
          provider_calls: 1,
          input_tokens: 10,
          output_tokens: 5,
          actual_cost_usd: 0.01,
          provider_credential_read: true,
          production_called: false,
          ...usageMutation,
        },
      } as Awaited<ReturnType<InterviewerQualityJudgeAdapterV1["judge"]>>;
    },
  };
}
