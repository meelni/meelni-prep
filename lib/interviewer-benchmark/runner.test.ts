import assert from "node:assert/strict";
import test from "node:test";

import type { InterviewerQualityJudgeAdapterV1 } from "@meelni/agent";

import {
  createProviderFreeInterviewerJudgeAdapter,
  runInterviewerBenchmark,
  serializeInterviewerBenchmarkReport,
} from "./runner";

const SOURCE_HASH = "a".repeat(64);

test("provider-free baseline is complete, bounded, actionable, and reproducible", async () => {
  const first = await runInterviewerBenchmark(
    createProviderFreeInterviewerJudgeAdapter(),
    SOURCE_HASH
  );
  const second = await runInterviewerBenchmark(
    createProviderFreeInterviewerJudgeAdapter(),
    SOURCE_HASH
  );

  assert.equal(
    serializeInterviewerBenchmarkReport(first),
    serializeInterviewerBenchmarkReport(second)
  );
  assert.equal(first.execution.providerCalls, 0);
  assert.equal(first.execution.actualCostUsd, 0);
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
  assert.equal(first.ownerAdjudication.reusedHumanAdjudication, false);
});

test("runner fails closed on malformed judge output", async () => {
  const adapter: InterviewerQualityJudgeAdapterV1 = {
    execution_mode: "provider_backed_explicit_opt_in",
    async judge() {
      return {
        raw_output: {},
        model_version: "broken",
        usage: {
          latency_ms: 1,
          provider_calls: 1,
          input_tokens: 1,
          output_tokens: 1,
          actual_cost_usd: 0.01,
        },
      };
    },
  };
  await assert.rejects(
    runInterviewerBenchmark(adapter, SOURCE_HASH),
    /interviewer_benchmark_judge_output_invalid/
  );
});
