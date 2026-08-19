import { createHash } from "node:crypto";

import {
  INTERVIEWER_BENCHMARK_EXECUTION_AUTHORIZATION_VERSION,
  INTERVIEWER_INVARIANT_CODES,
  INTERVIEWER_QUALITY_JUDGE_ADAPTER_VERSION,
  INTERVIEWER_QUALITY_DIMENSIONS,
  buildInterviewerQualityJudgeRequestV1,
  decodeInterviewerQualityJudgeOutputV1,
  evaluateInterviewerInvariants,
  type InterviewerBenchmarkExecutionAuthorizationV1,
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
import {
  INTERVIEWER_BENCHMARK_ACCEPTED_ADJUDICATION_STATUS,
  getInterviewerBenchmarkAdjudicationCandidateManifestSha256,
  hashInterviewerBenchmarkAdjudicationApproval,
  parseInterviewerBenchmarkAdjudicationApprovalV1,
  type InterviewerBenchmarkAdjudicationApprovalV1,
} from "./adjudication-approval";

export const INTERVIEWER_BENCHMARK_REPORT_VERSION =
  "meelni.interviewer-benchmark-report.v3" as const;
export const INTERVIEWER_BENCHMARK_REPLAY_CLOCK =
  "2026-08-18T00:00:00.000Z" as const;
export const INTERVIEWER_BENCHMARK_MAX_PROVIDER_CALLS = 12;
export const INTERVIEWER_BENCHMARK_MAX_TOKENS_PER_CALL = 100_000;
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

export interface InterviewerBenchmarkReportV3 {
  contractVersion: typeof INTERVIEWER_BENCHMARK_REPORT_VERSION;
  recordedAt: typeof INTERVIEWER_BENCHMARK_REPLAY_CLOCK;
  execution: {
    kind: InterviewerQualityJudgeAdapterV1["execution_mode"];
    adapterContractVersion: typeof INTERVIEWER_QUALITY_JUDGE_ADAPTER_VERSION;
    authorization: {
      contractVersion: typeof INTERVIEWER_BENCHMARK_EXECUTION_AUTHORIZATION_VERSION;
      kind: InterviewerBenchmarkExecutionAuthorizationV1["authorization"];
      allowProviderCredentials: boolean;
      allowProduction: false;
      maximumProviderCalls: number;
      maximumInputTokensPerCall: number;
      maximumOutputTokensPerCall: number;
      maximumActualCostUsd: number;
    };
    fullySyntheticOnly: true;
    customerDataUsed: false;
    providerCredentialRead: boolean;
    productionCalled: boolean;
    providerCalls: number;
    inputTokens: number | null;
    outputTokens: number | null;
    actualCostUsd: number;
    judgeLatencyMs: NumericDistribution;
    modelVersions: string[];
  };
  versions: {
    suite: typeof INTERVIEWER_BENCHMARK_SUITE_VERSION;
    baseline: typeof INTERVIEWER_BENCHMARK_BASELINE_VERSION;
    sourceCommit: typeof INTERVIEWER_BENCHMARK_SOURCE_COMMIT;
    runtimeSourceSha256: string;
    benchmarkSourceSha256: string;
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
    adjudicationStatus:
      | typeof INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS
      | typeof INTERVIEWER_BENCHMARK_ACCEPTED_ADJUDICATION_STATUS;
    adjudicationManifestSha256: string;
    adjudicationApprovalSha256: string | null;
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
    status:
      | typeof INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS
      | typeof INTERVIEWER_BENCHMARK_ACCEPTED_ADJUDICATION_STATUS;
    examples: 8;
    acceptedExamples: number;
    requiredAction: string | null;
    approval: {
      contractVersion: InterviewerBenchmarkAdjudicationApprovalV1["contractVersion"];
      artifactSha256: string;
      authorityProvenance: InterviewerBenchmarkAdjudicationApprovalV1["authorityProvenance"];
      authorityScope: InterviewerBenchmarkAdjudicationApprovalV1["authorityScope"];
    } | null;
    reusedSav198Adjudication: false;
    note: string;
  };
  conclusion:
    | "baseline_recorded_owner_adjudication_pending"
    | "baseline_recorded_owner_adjudication_accepted";
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
    contract_version: INTERVIEWER_QUALITY_JUDGE_ADAPTER_VERSION,
    execution_mode: "provider_free_replay",
    expected_model_version: INTERVIEWER_BENCHMARK_REPLAY_MODEL_VERSION,
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
          provider_credential_read: false,
          production_called: false,
        },
      };
    },
  };
}

export function createProviderFreeInterviewerBenchmarkAuthorization(): InterviewerBenchmarkExecutionAuthorizationV1 {
  return {
    contract_version: INTERVIEWER_BENCHMARK_EXECUTION_AUTHORIZATION_VERSION,
    execution_mode: "provider_free_replay",
    authorization: "provider_free",
    allow_provider_credentials: false,
    allow_production: false,
    maximum_provider_calls: 0,
    maximum_input_tokens_per_call: 0,
    maximum_output_tokens_per_call: 0,
    maximum_actual_cost_usd: 0,
  };
}

export async function runInterviewerBenchmark(
  adapter: InterviewerQualityJudgeAdapterV1,
  runtimeSourceSha256: string,
  benchmarkSourceSha256: string,
  authorization: InterviewerBenchmarkExecutionAuthorizationV1 = createProviderFreeInterviewerBenchmarkAuthorization(),
  adjudicationApprovalInput: unknown = null
): Promise<InterviewerBenchmarkReportV3> {
  if (
    !/^[a-f0-9]{64}$/.test(runtimeSourceSha256) ||
    !/^[a-f0-9]{64}$/.test(benchmarkSourceSha256)
  ) {
    throw new Error("interviewer_benchmark_runtime_source_hash_invalid");
  }
  const adjudicationApproval =
    adjudicationApprovalInput === null
      ? null
      : parseInterviewerBenchmarkAdjudicationApprovalV1(
          adjudicationApprovalInput
        );
  const adjudicationAccepted = adjudicationApproval !== null;
  const scenarios = createInterviewerBenchmarkScenarios();
  const baseline = scenarios.filter(
    ({ fixture_kind: kind }) => kind === "current_runtime_baseline"
  );
  const controls = scenarios.filter(
    ({ fixture_kind: kind }) => kind === "invariant_control"
  );
  validateExecutionAuthorization(
    adapter,
    authorization,
    baseline.length * INTERVIEWER_BENCHMARK_REPLAY_SEEDS.length
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
  const controlFamilies = new Set(
    controlResults.flatMap(({ scenario }) => scenario.expected_invariant_codes)
  );
  const requiredInvariantFamiliesCovered = INTERVIEWER_INVARIANT_CODES.every(
    (code) => controlFamilies.has(code)
  );

  let providerCalls = 0;
  let actualCostUsd = 0;
  let providerCredentialRead = false;
  let productionCalled = false;
  let inputTokens: number | null =
    adapter.execution_mode === "provider_free_replay" ? null : 0;
  let outputTokens: number | null =
    adapter.execution_mode === "provider_free_replay" ? null : 0;
  const judgeLatencies: number[] = [];
  const modelVersions = new Set<string>();
  const reports: ScenarioReport[] = [];

  for (const scenario of baseline) {
    const outputs: InterviewerQualityJudgeOutputV1[] = [];
    for (const seed of INTERVIEWER_BENCHMARK_REPLAY_SEEDS) {
      const result = await adapter.judge(
        buildInterviewerQualityJudgeRequestV1(scenario, seed)
      );
      validateAdapterResult(result, adapter, authorization);
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
      providerCalls += result.usage.provider_calls;
      actualCostUsd =
        Math.round((actualCostUsd + result.usage.actual_cost_usd) * 1_000_000) /
        1_000_000;
      if (
        providerCalls > authorization.maximum_provider_calls ||
        actualCostUsd > authorization.maximum_actual_cost_usd
      ) {
        throw new Error("interviewer_benchmark_provider_budget_exceeded");
      }
      providerCredentialRead ||= result.usage.provider_credential_read;
      productionCalled ||= result.usage.production_called;
      if (inputTokens !== null && result.usage.input_tokens !== null) {
        inputTokens += result.usage.input_tokens;
      }
      if (outputTokens !== null && result.usage.output_tokens !== null) {
        outputTokens += result.usage.output_tokens;
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
  const adjudicationManifestSha256 =
    getInterviewerBenchmarkAdjudicationCandidateManifestSha256();
  const adjudicationApprovalSha256 = adjudicationApproval
    ? hashInterviewerBenchmarkAdjudicationApproval(adjudicationApproval)
    : null;
  const inputSha256 = sha256(
    stableJson({
      runtimeSourceSha256,
      benchmarkSourceSha256,
      scenarios,
      outputs: createInterviewerBenchmarkJudgeOutputs(),
      calibrationPairs: INTERVIEWER_BENCHMARK_CALIBRATION_PAIRS,
      adjudicationApproval,
    })
  );
  const latencyCeiling = Math.ceil(
    responseLatency.p95 + Math.max(responseLatency.p95 * 0.15, 250)
  );
  const reportWithoutHash: InterviewerBenchmarkReportV3 = {
    contractVersion: INTERVIEWER_BENCHMARK_REPORT_VERSION,
    recordedAt: INTERVIEWER_BENCHMARK_REPLAY_CLOCK,
    execution: {
      kind: adapter.execution_mode,
      adapterContractVersion: adapter.contract_version,
      authorization: {
        contractVersion: authorization.contract_version,
        kind: authorization.authorization,
        allowProviderCredentials: authorization.allow_provider_credentials,
        allowProduction: authorization.allow_production,
        maximumProviderCalls: authorization.maximum_provider_calls,
        maximumInputTokensPerCall: authorization.maximum_input_tokens_per_call,
        maximumOutputTokensPerCall:
          authorization.maximum_output_tokens_per_call,
        maximumActualCostUsd: authorization.maximum_actual_cost_usd,
      },
      fullySyntheticOnly: true as const,
      customerDataUsed: false as const,
      providerCredentialRead,
      productionCalled,
      providerCalls,
      inputTokens,
      outputTokens,
      actualCostUsd,
      judgeLatencyMs: distribution(judgeLatencies),
      modelVersions: [...modelVersions].sort(),
    },
    versions: {
      suite: INTERVIEWER_BENCHMARK_SUITE_VERSION,
      baseline: INTERVIEWER_BENCHMARK_BASELINE_VERSION,
      sourceCommit: INTERVIEWER_BENCHMARK_SOURCE_COMMIT,
      runtimeSourceSha256,
      benchmarkSourceSha256,
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
      adjudicationStatus: adjudicationAccepted
        ? INTERVIEWER_BENCHMARK_ACCEPTED_ADJUDICATION_STATUS
        : INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS,
      adjudicationManifestSha256,
      adjudicationApprovalSha256,
    },
    deterministicInvariants: {
      controlsDetected,
      controlsTotal: controls.length,
      baselineViolations,
      status:
        controls.length > 0 &&
        requiredInvariantFamiliesCovered &&
        controlsDetected === controls.length &&
        baselineViolations === 0
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
          ...(!adjudicationAccepted
            ? ["eight calibration examples require product-owner adjudication"]
            : []),
          "provider-backed candidate evidence has not been run",
        ],
      },
    },
    ownerAdjudication: {
      status: adjudicationAccepted
        ? INTERVIEWER_BENCHMARK_ACCEPTED_ADJUDICATION_STATUS
        : INTERVIEWER_BENCHMARK_ADJUDICATION_STATUS,
      examples: 8 as const,
      acceptedExamples: adjudicationAccepted ? 8 : 0,
      requiredAction: adjudicationAccepted
        ? null
        : "Product owner reviews the four strong/weak pairs in the manifest and records accept or reject for each of the eight examples.",
      approval: adjudicationApproval
        ? {
            contractVersion: adjudicationApproval.contractVersion,
            artifactSha256: adjudicationApprovalSha256!,
            authorityProvenance: adjudicationApproval.authorityProvenance,
            authorityScope: adjudicationApproval.authorityScope,
          }
        : null,
      reusedSav198Adjudication: false as const,
      note: adjudicationAccepted
        ? "The exact SAV-467 interviewer-quality labels are accepted; the artifact grants no runtime, provider, canary, launch, default-on, Production, or SAV-476 GO/NO-GO authority."
        : "SAV-198 evidence concerns candidate feedback scoring and does not adjudicate interviewer-quality examples.",
    },
    conclusion: adjudicationAccepted
      ? ("baseline_recorded_owner_adjudication_accepted" as const)
      : ("baseline_recorded_owner_adjudication_pending" as const),
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
  report: InterviewerBenchmarkReportV3
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

function validateExecutionAuthorization(
  adapter: InterviewerQualityJudgeAdapterV1,
  authorization: InterviewerBenchmarkExecutionAuthorizationV1,
  requiredJudgeRuns: number
): void {
  if (
    adapter.contract_version !== INTERVIEWER_QUALITY_JUDGE_ADAPTER_VERSION ||
    !hasExactKeys(authorization, [
      "contract_version",
      "execution_mode",
      "authorization",
      "allow_provider_credentials",
      "allow_production",
      "maximum_provider_calls",
      "maximum_input_tokens_per_call",
      "maximum_output_tokens_per_call",
      "maximum_actual_cost_usd",
    ]) ||
    authorization.contract_version !==
      INTERVIEWER_BENCHMARK_EXECUTION_AUTHORIZATION_VERSION ||
    authorization.execution_mode !== adapter.execution_mode ||
    authorization.allow_production !== false ||
    !Number.isSafeInteger(authorization.maximum_provider_calls) ||
    authorization.maximum_provider_calls < 0 ||
    authorization.maximum_provider_calls >
      INTERVIEWER_BENCHMARK_MAX_PROVIDER_CALLS ||
    !Number.isSafeInteger(authorization.maximum_input_tokens_per_call) ||
    authorization.maximum_input_tokens_per_call < 0 ||
    authorization.maximum_input_tokens_per_call >
      INTERVIEWER_BENCHMARK_MAX_TOKENS_PER_CALL ||
    !Number.isSafeInteger(authorization.maximum_output_tokens_per_call) ||
    authorization.maximum_output_tokens_per_call < 0 ||
    authorization.maximum_output_tokens_per_call >
      INTERVIEWER_BENCHMARK_MAX_TOKENS_PER_CALL ||
    !Number.isFinite(authorization.maximum_actual_cost_usd) ||
    authorization.maximum_actual_cost_usd < 0 ||
    authorization.maximum_actual_cost_usd >
      INTERVIEWER_BENCHMARK_MAX_ACTUAL_COST_USD ||
    !isVersionedModelIdentity(adapter.expected_model_version)
  ) {
    throw new Error("interviewer_benchmark_execution_authorization_invalid");
  }

  if (adapter.execution_mode === "provider_free_replay") {
    if (
      authorization.authorization !== "provider_free" ||
      authorization.allow_provider_credentials !== false ||
      authorization.maximum_provider_calls !== 0 ||
      authorization.maximum_input_tokens_per_call !== 0 ||
      authorization.maximum_output_tokens_per_call !== 0 ||
      authorization.maximum_actual_cost_usd !== 0
    ) {
      throw new Error("interviewer_benchmark_execution_authorization_invalid");
    }
    return;
  }

  if (
    adapter.execution_mode !== "provider_backed_explicit_opt_in" ||
    authorization.authorization !== "explicit_provider_opt_in" ||
    authorization.allow_provider_credentials !== true ||
    authorization.maximum_provider_calls < requiredJudgeRuns ||
    authorization.maximum_input_tokens_per_call === 0 ||
    authorization.maximum_output_tokens_per_call === 0
  ) {
    throw new Error("interviewer_benchmark_execution_authorization_invalid");
  }
}

function validateAdapterResult(
  result: Awaited<ReturnType<InterviewerQualityJudgeAdapterV1["judge"]>>,
  adapter: InterviewerQualityJudgeAdapterV1,
  authorization: InterviewerBenchmarkExecutionAuthorizationV1
): void {
  if (
    !hasExactKeys(result, ["raw_output", "model_version", "usage"]) ||
    !isVersionedModelIdentity(result.model_version) ||
    result.model_version !== adapter.expected_model_version ||
    !hasExactKeys(result.usage, [
      "latency_ms",
      "provider_calls",
      "input_tokens",
      "output_tokens",
      "actual_cost_usd",
      "provider_credential_read",
      "production_called",
    ]) ||
    !Number.isSafeInteger(result.usage.latency_ms) ||
    result.usage.latency_ms < 0 ||
    (result.usage.provider_calls !== 0 && result.usage.provider_calls !== 1) ||
    !Number.isFinite(result.usage.actual_cost_usd) ||
    result.usage.actual_cost_usd < 0 ||
    result.usage.actual_cost_usd > authorization.maximum_actual_cost_usd ||
    typeof result.usage.provider_credential_read !== "boolean" ||
    typeof result.usage.production_called !== "boolean" ||
    result.usage.production_called ||
    (result.usage.provider_credential_read &&
      !authorization.allow_provider_credentials)
  ) {
    throw new Error("interviewer_benchmark_judge_usage_invalid");
  }

  if (adapter.execution_mode === "provider_free_replay") {
    if (
      result.usage.provider_calls !== 0 ||
      result.usage.input_tokens !== null ||
      result.usage.output_tokens !== null ||
      result.usage.actual_cost_usd !== 0 ||
      result.usage.provider_credential_read ||
      result.usage.production_called
    ) {
      throw new Error("interviewer_benchmark_judge_usage_invalid");
    }
    return;
  }

  if (
    result.usage.provider_calls !== 1 ||
    !isNonnegativeSafeInteger(result.usage.input_tokens) ||
    !isNonnegativeSafeInteger(result.usage.output_tokens) ||
    result.usage.input_tokens > authorization.maximum_input_tokens_per_call ||
    result.usage.output_tokens > authorization.maximum_output_tokens_per_call ||
    !result.usage.provider_credential_read ||
    result.usage.production_called
  ) {
    throw new Error("interviewer_benchmark_judge_usage_invalid");
  }
}

function isVersionedModelIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z0-9][a-z0-9._:/-]{0,199}$/i.test(value) &&
    /(?:^|[._:/-])(?:v\d+|\d+)(?:$|[._:/-])/i.test(value)
  );
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function hasExactKeys(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
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
