import { createHash } from "node:crypto";

import {
  INTERVIEWER_QUALITY_DIMENSIONS,
  buildInterviewerQualityJudgeRequestV1,
  decodeInterviewerQualityJudgeOutputV1,
  evaluateInterviewerInvariants,
  type InterviewerBenchmarkScenarioV1,
  type InterviewerInvariantViolationV1,
  type InterviewerJudgeFailureV1,
  type InterviewerQualityDimension,
  type InterviewerQualityJudgeAdapterV1,
  type InterviewerQualityJudgeOutputV1,
} from "@meelni/agent";
import {
  INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS,
  INTERVIEWER_BENCHMARK_BASELINE_VERSION,
  INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS,
  INTERVIEWER_BENCHMARK_REPLAY_MODEL_VERSION,
  INTERVIEWER_BENCHMARK_REPLAY_SEEDS,
  INTERVIEWER_BENCHMARK_SOURCE_COMMIT,
  INTERVIEWER_BENCHMARK_SUITE_VERSION,
  createInterviewerBenchmarkJudgeOutputs,
  createInterviewerBenchmarkScenarios,
} from "@meelni/test-fixtures/interviewer-benchmark";

export const INTERVIEWER_BENCHMARK_REPORT_VERSION =
  "meelni.interviewer-benchmark-report.v1" as const;
export const INTERVIEWER_BENCHMARK_REPLAY_CLOCK =
  "2026-08-18T00:00:00.000Z" as const;
export const INTERVIEWER_BENCHMARK_MAX_PROVIDER_CALLS = 12;
export const INTERVIEWER_BENCHMARK_MAX_ACTUAL_COST_USD = 1;
export const INTERVIEWER_BENCHMARK_MAX_DIMENSION_RANGE = 1;

interface NumericDistribution {
  count: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

interface ScenarioReport {
  scenarioId: string;
  roundType: InterviewerBenchmarkScenarioV1["round_type"];
  candidateBehaviors: InterviewerBenchmarkScenarioV1["candidate_behaviors"];
  judgeRuns: number;
  quality: {
    overall: NumericDistribution;
    dimensionMeans: Record<InterviewerQualityDimension, number>;
    maximumDimensionRange: number;
  };
  responseLatencyMs: NumericDistribution;
  invariantViolations: InterviewerInvariantViolationV1[];
  actionableFailures: InterviewerJudgeFailureV1[];
}

export interface InterviewerBenchmarkReportV1 {
  contractVersion: typeof INTERVIEWER_BENCHMARK_REPORT_VERSION;
  recordedAt: typeof INTERVIEWER_BENCHMARK_REPLAY_CLOCK;
  execution: {
    kind: InterviewerQualityJudgeAdapterV1["execution_mode"];
    fullySyntheticOnly: true;
    customerDataUsed: false;
    providerCredentialRead: false;
    productionCalled: false;
    providerCalls: number;
    actualCostUsd: number;
    judgeLatencyMs: NumericDistribution;
    modelVersions: string[];
  };
  versions: {
    suite: typeof INTERVIEWER_BENCHMARK_SUITE_VERSION;
    baseline: typeof INTERVIEWER_BENCHMARK_BASELINE_VERSION;
    sourceCommit: typeof INTERVIEWER_BENCHMARK_SOURCE_COMMIT;
    runtimeSourceSha256: string;
    promptContract: "full_interview_prompt_v1";
  };
  corpus: {
    scenarios: number;
    baselineSessions: number;
    rounds: number;
    candidateBehaviors: number;
    invariantControls: number;
    replaySeeds: number[];
    judgeRuns: number;
    calibrationPairs: number;
    calibrationExamples: number;
    adjudicationStatus: typeof INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS;
    adjudicationManifestSha256: string;
  };
  deterministicInvariants: {
    controlsDetected: number;
    controlsTotal: number;
    baselineViolations: number;
    status: "passed" | "failed";
  };
  scenarios: ScenarioReport[];
  aggregate: {
    qualityScore: number;
    responseLatencyMs: NumericDistribution;
    maximumDimensionRange: number;
    actionableFailures: number;
  };
  thresholds: {
    regression: {
      aggregateQualityFloor: number;
      scenarioQualityFloors: Record<string, number>;
      responseLatencyP95CeilingMs: number;
      requireNoInvariantViolations: true;
      maximumDimensionRange: typeof INTERVIEWER_BENCHMARK_MAX_DIMENSION_RANGE;
    };
    shadowEntry: {
      aggregateQualityFloor: number;
      everyScenarioQualityFloor: 75;
      responseLatencyP95CeilingMs: number;
      maximumProviderCalls: typeof INTERVIEWER_BENCHMARK_MAX_PROVIDER_CALLS;
      maximumActualCostUsd: typeof INTERVIEWER_BENCHMARK_MAX_ACTUAL_COST_USD;
      requireNoInvariantViolations: true;
      requireOwnerCalibrationApproval: true;
      eligible: false;
      blockers: string[];
    };
  };
  ownerAdjudication: {
    status: typeof INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS;
    examples: 8;
    requiredAction: string;
    reusedHumanAdjudication: false;
    note: string;
  };
  conclusion: "baseline_recorded_owner_adjudication_pending";
  reproducibility: {
    inputSha256: string;
    reportSha256: string;
  };
}

export function createProviderFreeInterviewerJudgeAdapter(): InterviewerQualityJudgeAdapterV1 {
  const outputs = createInterviewerBenchmarkJudgeOutputs();
  const byRun = new Map(
    outputs.map((output) => [`${output.scenario_id}:${output.seed}`, output])
  );
  return {
    execution_mode: "provider_free_replay",
    async judge(request) {
      const output = byRun.get(
        `${request.scenario.scenario_id}:${request.seed}`
      );
      if (!output)
        throw new Error("interviewer_benchmark_replay_output_missing");
      return {
        raw_output: structuredClone(output),
        model_version: INTERVIEWER_BENCHMARK_REPLAY_MODEL_VERSION,
        usage: {
          latency_ms: 0,
          provider_calls: 0,
          input_tokens: null,
          output_tokens: null,
          actual_cost_usd: 0,
        },
      };
    },
  };
}

export async function runInterviewerBenchmark(
  adapter: InterviewerQualityJudgeAdapterV1,
  runtimeSourceSha256: string
): Promise<InterviewerBenchmarkReportV1> {
  if (!/^[a-f0-9]{64}$/.test(runtimeSourceSha256)) {
    throw new Error("interviewer_benchmark_runtime_source_hash_invalid");
  }
  const scenarios = createInterviewerBenchmarkScenarios();
  const baseline = scenarios.filter(
    ({ fixture_kind: kind }) => kind === "current_runtime_baseline"
  );
  const controls = scenarios.filter(
    ({ fixture_kind: kind }) => kind === "invariant_control"
  );
  const controlResults = controls.map((scenario) => ({
    scenario,
    violations: evaluateInterviewerInvariants(scenario),
  }));
  const controlsDetected = controlResults.filter(
    ({ scenario, violations }) =>
      stableJson(violations.map(({ code }) => code).sort()) ===
      stableJson([...scenario.expected_invariant_codes].sort())
  ).length;

  let providerCalls = 0;
  let actualCostUsd = 0;
  const judgeLatencies: number[] = [];
  const modelVersions = new Set<string>();
  const reports: ScenarioReport[] = [];

  for (const scenario of baseline) {
    const outputs: InterviewerQualityJudgeOutputV1[] = [];
    for (const seed of INTERVIEWER_BENCHMARK_REPLAY_SEEDS) {
      const result = await adapter.judge(
        buildInterviewerQualityJudgeRequestV1(scenario, seed)
      );
      const output = decodeInterviewerQualityJudgeOutputV1(result.raw_output);
      if (
        !output ||
        output.scenario_id !== scenario.scenario_id ||
        output.seed !== seed ||
        output.failures.some(({ turn_ids: ids }) =>
          ids.some(
            (id) => !scenario.turns.some(({ turn_id }) => turn_id === id)
          )
        )
      ) {
        throw new Error("interviewer_benchmark_judge_output_invalid");
      }
      validateUsage(result.usage);
      providerCalls += result.usage.provider_calls;
      actualCostUsd =
        Math.round((actualCostUsd + result.usage.actual_cost_usd) * 1_000_000) /
        1_000_000;
      if (
        providerCalls > INTERVIEWER_BENCHMARK_MAX_PROVIDER_CALLS ||
        actualCostUsd > INTERVIEWER_BENCHMARK_MAX_ACTUAL_COST_USD
      ) {
        throw new Error("interviewer_benchmark_provider_budget_exceeded");
      }
      judgeLatencies.push(result.usage.latency_ms);
      modelVersions.add(result.model_version);
      outputs.push(output);
    }
    reports.push(buildScenarioReport(scenario, outputs));
  }

  const baselineViolations = reports.reduce(
    (total, report) => total + report.invariantViolations.length,
    0
  );
  const allResponseLatencies = baseline.flatMap(responseLatencies);
  const responseLatency = distribution(allResponseLatencies);
  const aggregateQuality = round(
    mean(reports.map(({ quality }) => quality.overall.mean))
  );
  const maximumDimensionRange = Math.max(
    ...reports.map(({ quality }) => quality.maximumDimensionRange)
  );
  const calibrationExamples = INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS.flatMap(
    ({ strong, weak }) => [strong, weak]
  );
  const adjudicationManifestSha256 = sha256(
    stableJson(
      calibrationExamples.map((example) => ({
        example,
        scenario: scenarios.find(
          ({ scenario_id: id }) => id === example.scenario_id
        ),
        output: createInterviewerBenchmarkJudgeOutputs().find(
          ({ scenario_id: id, seed }) =>
            id === example.scenario_id && seed === example.seed
        ),
      }))
    )
  );
  const inputSha256 = sha256(
    stableJson({
      runtimeSourceSha256,
      scenarios,
      outputs: createInterviewerBenchmarkJudgeOutputs(),
      calibrationPairs: INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS,
    })
  );
  const latencyCeiling = Math.ceil(
    responseLatency.p95 + Math.max(responseLatency.p95 * 0.15, 250)
  );
  const reportWithoutHash: InterviewerBenchmarkReportV1 = {
    contractVersion: INTERVIEWER_BENCHMARK_REPORT_VERSION,
    recordedAt: INTERVIEWER_BENCHMARK_REPLAY_CLOCK,
    execution: {
      kind: adapter.execution_mode,
      fullySyntheticOnly: true as const,
      customerDataUsed: false as const,
      providerCredentialRead: false as const,
      productionCalled: false as const,
      providerCalls,
      actualCostUsd,
      judgeLatencyMs: distribution(judgeLatencies),
      modelVersions: [...modelVersions].sort(),
    },
    versions: {
      suite: INTERVIEWER_BENCHMARK_SUITE_VERSION,
      baseline: INTERVIEWER_BENCHMARK_BASELINE_VERSION,
      sourceCommit: INTERVIEWER_BENCHMARK_SOURCE_COMMIT,
      runtimeSourceSha256,
      promptContract: "full_interview_prompt_v1" as const,
    },
    corpus: {
      scenarios: scenarios.length,
      baselineSessions: baseline.length,
      rounds: new Set(baseline.map(({ round_type }) => round_type)).size,
      candidateBehaviors: new Set(
        baseline.flatMap(({ candidate_behaviors: behaviors }) => behaviors)
      ).size,
      invariantControls: controls.length,
      replaySeeds: [...INTERVIEWER_BENCHMARK_REPLAY_SEEDS],
      judgeRuns: reports.reduce((total, report) => total + report.judgeRuns, 0),
      calibrationPairs: INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS.length,
      calibrationExamples: calibrationExamples.length,
      adjudicationStatus: INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS,
      adjudicationManifestSha256,
    },
    deterministicInvariants: {
      controlsDetected,
      controlsTotal: controls.length,
      baselineViolations,
      status:
        controlsDetected === controls.length && baselineViolations === 0
          ? ("passed" as const)
          : ("failed" as const),
    },
    scenarios: reports,
    aggregate: {
      qualityScore: aggregateQuality,
      responseLatencyMs: responseLatency,
      maximumDimensionRange,
      actionableFailures: reports.reduce(
        (total, { actionableFailures }) => total + actionableFailures.length,
        0
      ),
    },
    thresholds: {
      regression: {
        aggregateQualityFloor: round(aggregateQuality - 2),
        scenarioQualityFloors: Object.fromEntries(
          reports.map(({ scenarioId, quality }) => [
            scenarioId,
            round(quality.overall.mean - 5),
          ])
        ),
        responseLatencyP95CeilingMs: latencyCeiling,
        requireNoInvariantViolations: true as const,
        maximumDimensionRange: INTERVIEWER_BENCHMARK_MAX_DIMENSION_RANGE,
      },
      shadowEntry: {
        aggregateQualityFloor: round(aggregateQuality + 5),
        everyScenarioQualityFloor: 75 as const,
        responseLatencyP95CeilingMs: latencyCeiling,
        maximumProviderCalls: INTERVIEWER_BENCHMARK_MAX_PROVIDER_CALLS,
        maximumActualCostUsd: INTERVIEWER_BENCHMARK_MAX_ACTUAL_COST_USD,
        requireNoInvariantViolations: true as const,
        requireOwnerCalibrationApproval: true as const,
        eligible: false as const,
        blockers: [
          "eight calibration examples require product-owner adjudication",
          "provider-backed candidate evidence has not been run",
        ],
      },
    },
    ownerAdjudication: {
      status: INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS,
      examples: 8 as const,
      requiredAction:
        "Product owner reviews the four strong/weak pairs in the manifest and records accept or reject for each of the eight examples.",
      reusedHumanAdjudication: false as const,
      note: "SAV-198 evidence concerns candidate feedback scoring and does not adjudicate interviewer-quality examples.",
    },
    conclusion: "baseline_recorded_owner_adjudication_pending" as const,
    reproducibility: {
      inputSha256,
      reportSha256: "",
    },
  };
  const reportSha256 = sha256(stableJson(reportWithoutHash));
  return {
    ...reportWithoutHash,
    reproducibility: { inputSha256, reportSha256 },
  };
}

export function serializeInterviewerBenchmarkReport(
  report: InterviewerBenchmarkReportV1
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function buildScenarioReport(
  scenario: InterviewerBenchmarkScenarioV1,
  outputs: InterviewerQualityJudgeOutputV1[]
): ScenarioReport {
  const dimensionMeans = {} as Record<InterviewerQualityDimension, number>;
  let maximumDimensionRange = 0;
  for (const dimension of INTERVIEWER_QUALITY_DIMENSIONS) {
    const values = outputs.map(({ scores }) => scores[dimension]);
    dimensionMeans[dimension] = round(mean(values));
    maximumDimensionRange = Math.max(
      maximumDimensionRange,
      Math.max(...values) - Math.min(...values)
    );
  }
  return {
    scenarioId: scenario.scenario_id,
    roundType: scenario.round_type,
    candidateBehaviors: [...scenario.candidate_behaviors],
    judgeRuns: outputs.length,
    quality: {
      overall: distribution(outputs.map(({ overall_score }) => overall_score)),
      dimensionMeans,
      maximumDimensionRange,
    },
    responseLatencyMs: distribution(responseLatencies(scenario)),
    invariantViolations: evaluateInterviewerInvariants(scenario),
    actionableFailures: deduplicateFailures(
      outputs.flatMap(({ failures }) => failures)
    ),
  };
}

function responseLatencies(scenario: InterviewerBenchmarkScenarioV1): number[] {
  const values: number[] = [];
  for (let index = 0; index < scenario.turns.length - 1; index += 1) {
    const current = scenario.turns[index]!;
    const next = scenario.turns[index + 1]!;
    if (current.speaker === "candidate" && next.speaker === "interviewer") {
      values.push(Math.max(0, next.started_at_ms - current.ended_at_ms));
    }
  }
  return values;
}

function deduplicateFailures(
  failures: InterviewerJudgeFailureV1[]
): InterviewerJudgeFailureV1[] {
  const seen = new Set<string>();
  return failures.filter((failure) => {
    const key = `${failure.code}:${failure.dimension}:${failure.turn_ids.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validateUsage(
  usage: Awaited<ReturnType<InterviewerQualityJudgeAdapterV1["judge"]>>["usage"]
): void {
  if (
    !Number.isSafeInteger(usage.latency_ms) ||
    usage.latency_ms < 0 ||
    (usage.provider_calls !== 0 && usage.provider_calls !== 1) ||
    !Number.isFinite(usage.actual_cost_usd) ||
    usage.actual_cost_usd < 0
  ) {
    throw new Error("interviewer_benchmark_judge_usage_invalid");
  }
}

function distribution(values: number[]): NumericDistribution {
  if (values.length === 0) {
    return { count: 0, min: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
  return {
    count: sorted.length,
    min: sorted[0]!,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1)!,
    mean: round(mean(sorted)),
  };
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
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
