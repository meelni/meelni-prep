import { createHash } from "node:crypto";

import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  parseFeedbackV2,
  type FeedbackEvaluationState,
  type FeedbackV2Result,
} from "@meelni/core";
import {
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  evaluationCalibrationCases,
  type EvaluationCalibrationCase,
} from "@meelni/test-fixtures";

import {
  FEEDBACK_GENERATION_DEADLINE_MS,
  FEEDBACK_GENERATION_PERSISTENCE_RESERVE_MS,
} from "./feedback-generation-policy";
import {
  createDeterministicCalibrationEvaluator,
  runEvaluationCalibration,
} from "./calibration";
import { structuredCalibrationInputTokenCeiling } from "./calibration-budget";
import {
  createNumericDistribution,
  simulateProviderFreeQueue,
  type NumericDistribution,
  type ProviderFreeQueuePolicy,
  type ProviderFreeQueueResult,
  type ProviderFreeQueueScenario,
} from "./provider-free-queue-simulation";

export type {
  ProviderFreeQueuePolicy,
  ProviderFreeQueueResult,
} from "./provider-free-queue-simulation";

export const PROVIDER_FREE_BAKEOFF_CONFIG_VERSION =
  "feedback-provider-free-bakeoff-config.v1" as const;
export const PROVIDER_FREE_BAKEOFF_REPORT_VERSION =
  "feedback-provider-free-bakeoff-report.v1" as const;
export const PROVIDER_FREE_TOKEN_ESTIMATOR_VERSION =
  "utf8-byte-upper-bound.v1" as const;

export interface ProviderFreeBakeoffCandidate {
  id: string;
  role: "baseline" | "candidate";
  simulatedLatency: {
    baseMs: number;
    perInputKiBMs: number;
    perOutputKiBMs: number;
  };
  comparisonCostUnitsPerMillionTokens: {
    input: number;
    output: number;
  };
}

export interface ProviderFreeBakeoffConfig {
  contractVersion: typeof PROVIDER_FREE_BAKEOFF_CONFIG_VERSION;
  replayClock: string;
  currentMaxCompletionTokens: number;
  outputTokenHeadroomBasisPoints: number;
  outputTokenRoundTo: number;
  queueScenario: ProviderFreeQueueScenario;
  evaluatorCandidates: ProviderFreeBakeoffCandidate[];
  queuePolicies: ProviderFreeQueuePolicy[];
}

interface CandidateMeasurement {
  fixtureId: string;
  structuredOutputAccepted: boolean;
  promptTokenUpperBound: number;
  outputBytes: number;
  outputTokenUpperBound: number;
  simulatedProviderLatencyMs: number;
  estimatedComparisonCostUnits: number;
}

export interface ProviderFreeCandidateReport {
  id: string;
  role: "baseline" | "candidate";
  evidence: {
    fullySyntheticCases: number;
    scoredCases: number;
    insufficientCases: number;
    calibrationEvaluatorCalls: number;
    measurementReplayCalls: number;
    totalEvaluatorCalls: number;
    providerCalls: 0;
    evidenceValidityRate: number;
    structuredOutputAcceptedOutputs: number;
    structuredOutputAcceptanceRate: number;
    adjudicatedEvidenceMatchRate: number;
    scoreBandAgreementRate: number;
    insufficientHandlingRate: number;
    deterministicHarness: "passed" | "failed";
  };
  measurements: {
    promptTokenUpperBound: NumericDistribution;
    outputBytes: NumericDistribution;
    outputTokenUpperBound: NumericDistribution;
    simulatedProviderLatencyMs: NumericDistribution;
    estimatedComparisonCostUnits: {
      unit: "configured_comparison_units";
      total: number;
      perEvaluation: NumericDistribution;
    };
  };
  conclusion: "deterministic_contract_passed" | "deterministic_contract_failed";
}

export interface ProviderFreeBakeoffReport {
  contractVersion: typeof PROVIDER_FREE_BAKEOFF_REPORT_VERSION;
  generatedAt: string;
  execution: {
    kind: "provider_free_deterministic_replay";
    customerDataUsed: false;
    providerCredentialRead: false;
    paidProviderCalled: false;
    productionConfigurationChanged: false;
    defaultActivationChanged: false;
  };
  versions: {
    goldSet: typeof EVALUATION_GOLD_SET_VERSION;
    adjudication: typeof EVALUATION_ADJUDICATION_VERSION;
    schema: typeof FEEDBACK_SCHEMA_VERSION;
    prompt: typeof FEEDBACK_PROMPT_VERSION;
    rubric: typeof FEEDBACK_RUBRIC_VERSION;
    candidateArtifactHash: string;
    corpusHash: string;
    configHash: string;
  };
  candidates: ProviderFreeCandidateReport[];
  outputTokenCeiling: {
    estimator: typeof PROVIDER_FREE_TOKEN_ESTIMATOR_VERSION;
    validMeasuredOutputs: number;
    maximumMeasuredOutputBytes: number;
    maximumMeasuredOutputTokenUpperBound: number;
    headroomBasisPoints: number;
    roundTo: number;
    currentMaxCompletionTokens: number;
    candidateMaxCompletionTokens: number;
    status:
      | "lower_candidate_for_owner_review"
      | "retain_current_ceiling"
      | "measured_candidate_exceeds_current_ceiling";
    activated: false;
  };
  queue: {
    deadlineMs: typeof FEEDBACK_GENERATION_DEADLINE_MS;
    persistenceReserveMs: typeof FEEDBACK_GENERATION_PERSISTENCE_RESERVE_MS;
    scenario: ProviderFreeBakeoffConfig["queueScenario"];
    results: ProviderFreeQueueResult[];
    recommendation: {
      status:
        | "provider_free_candidate_ready_for_staging_review"
        | "insufficient_provider_free_improvement";
      baselinePolicyId: string;
      candidatePolicyId: string | null;
      productionChangeAuthorized: false;
    };
  };
  evaluatorDecision: {
    status: "provider_free_contract_evidence_only";
    recommendedModelOrTier: null;
    liveQualityLatencyEvidenceRequired: true;
  };
  reproducibility: {
    inputSha256: string;
    reportSha256: string;
  };
}

export function parseProviderFreeBakeoffConfig(
  value: unknown
): ProviderFreeBakeoffConfig {
  const root = record(value, "config");
  exactKeys(root, "config", [
    "contractVersion",
    "replayClock",
    "currentMaxCompletionTokens",
    "outputTokenHeadroomBasisPoints",
    "outputTokenRoundTo",
    "queueScenario",
    "evaluatorCandidates",
    "queuePolicies",
  ]);
  if (root.contractVersion !== PROVIDER_FREE_BAKEOFF_CONFIG_VERSION) {
    throw new Error("provider_free_bakeoff_config_version_invalid");
  }
  const replayClock = string(root.replayClock, "replayClock");
  if (new Date(replayClock).toISOString() !== replayClock) {
    throw new Error("provider_free_bakeoff_replay_clock_invalid");
  }
  const queueScenario = parseQueueScenario(root.queueScenario);
  const evaluatorCandidates = array(
    root.evaluatorCandidates,
    "evaluatorCandidates"
  ).map(parseCandidate);
  const queuePolicies = array(root.queuePolicies, "queuePolicies").map(
    parseQueuePolicy
  );
  requireOneBaseline(evaluatorCandidates, "evaluatorCandidates");
  requireOneBaseline(queuePolicies, "queuePolicies");
  requireUniqueIds(evaluatorCandidates, "evaluatorCandidates");
  requireUniqueIds(queuePolicies, "queuePolicies");
  if (evaluatorCandidates.length < 2 || queuePolicies.length < 2) {
    throw new Error("provider_free_bakeoff_comparison_requires_candidates");
  }
  return {
    contractVersion: PROVIDER_FREE_BAKEOFF_CONFIG_VERSION,
    replayClock,
    currentMaxCompletionTokens: positiveInteger(
      root.currentMaxCompletionTokens,
      "currentMaxCompletionTokens"
    ),
    outputTokenHeadroomBasisPoints: nonNegativeInteger(
      root.outputTokenHeadroomBasisPoints,
      "outputTokenHeadroomBasisPoints"
    ),
    outputTokenRoundTo: positiveInteger(
      root.outputTokenRoundTo,
      "outputTokenRoundTo"
    ),
    queueScenario,
    evaluatorCandidates,
    queuePolicies,
  };
}

export async function runProviderFreeBakeoff(
  configInput: ProviderFreeBakeoffConfig | unknown
): Promise<ProviderFreeBakeoffReport> {
  const config = parseProviderFreeBakeoffConfig(configInput);
  const candidateReports: ProviderFreeCandidateReport[] = [];
  const measurements = new Map<string, CandidateMeasurement[]>();
  let sharedVersions:
    | Pick<
        ProviderFreeBakeoffReport["versions"],
        "candidateArtifactHash" | "corpusHash"
      >
    | undefined;

  for (const candidate of config.evaluatorCandidates) {
    const evaluator = createDeterministicCalibrationEvaluator(candidate.id);
    const calibration = await runEvaluationCalibration({
      executionKind: "deterministic_self_test",
      evaluator,
      modelVersion: candidate.id,
      now: new Date(config.replayClock),
    });
    if (
      calibration.execution.paidProviderCalled ||
      calibration.metrics.providerEvaluationCalls !== 0 ||
      calibration.execution.cost !== null
    ) {
      throw new Error("provider_free_bakeoff_provider_boundary_opened");
    }
    const versions = {
      candidateArtifactHash: calibration.versions.candidateArtifactHash,
      corpusHash: calibration.versions.corpusHash,
    };
    if (sharedVersions && stableJson(sharedVersions) !== stableJson(versions)) {
      throw new Error("provider_free_bakeoff_corpus_changed_during_run");
    }
    sharedVersions = versions;
    const candidateMeasurements = await measureCandidate(candidate, evaluator);
    measurements.set(candidate.id, candidateMeasurements);
    const acceptedMeasurements = candidateMeasurements.filter(
      ({ structuredOutputAccepted }) => structuredOutputAccepted
    );
    if (acceptedMeasurements.length === 0) {
      throw new Error("provider_free_bakeoff_has_no_valid_structured_outputs");
    }
    const costValues = candidateMeasurements.map(
      (entry) => entry.estimatedComparisonCostUnits
    );
    const passed = calibration.gate.deterministicHarness === "passed";
    candidateReports.push({
      id: candidate.id,
      role: candidate.role,
      evidence: {
        fullySyntheticCases: calibration.corpus.totalCases,
        scoredCases: calibration.corpus.scoredCases,
        insufficientCases: calibration.corpus.insufficientCases,
        calibrationEvaluatorCalls: calibration.metrics.evaluatorCalls,
        measurementReplayCalls: candidateMeasurements.length,
        totalEvaluatorCalls:
          calibration.metrics.evaluatorCalls + candidateMeasurements.length,
        providerCalls: 0,
        evidenceValidityRate: calibration.metrics.evidenceValidityRate ?? 0,
        structuredOutputAcceptedOutputs: acceptedMeasurements.length,
        structuredOutputAcceptanceRate:
          acceptedMeasurements.length / calibration.corpus.scoredCases,
        adjudicatedEvidenceMatchRate:
          calibration.metrics.adjudicatedEvidenceMatchRate ?? 0,
        scoreBandAgreementRate: calibration.metrics.scoreBandAgreementRate ?? 0,
        insufficientHandlingRate: calibration.metrics.insufficientHandlingRate,
        deterministicHarness: passed ? "passed" : "failed",
      },
      measurements: {
        promptTokenUpperBound: createNumericDistribution(
          candidateMeasurements.map((entry) => entry.promptTokenUpperBound)
        ),
        outputBytes: createNumericDistribution(
          acceptedMeasurements.map((entry) => entry.outputBytes)
        ),
        outputTokenUpperBound: createNumericDistribution(
          acceptedMeasurements.map((entry) => entry.outputTokenUpperBound)
        ),
        simulatedProviderLatencyMs: createNumericDistribution(
          candidateMeasurements.map((entry) => entry.simulatedProviderLatencyMs)
        ),
        estimatedComparisonCostUnits: {
          unit: "configured_comparison_units",
          total: costValues.reduce((total, value) => total + value, 0),
          perEvaluation: createNumericDistribution(costValues),
        },
      },
      conclusion: passed
        ? "deterministic_contract_passed"
        : "deterministic_contract_failed",
    });
  }

  if (!sharedVersions) {
    throw new Error("provider_free_bakeoff_has_no_candidate_versions");
  }
  const allMeasurements = [...measurements.values()]
    .flat()
    .filter(({ structuredOutputAccepted }) => structuredOutputAccepted);
  if (allMeasurements.length === 0) {
    throw new Error("provider_free_bakeoff_has_no_valid_structured_outputs");
  }
  const maximumOutputBytes = Math.max(
    ...allMeasurements.map((entry) => entry.outputBytes)
  );
  const maximumOutputTokenUpperBound = Math.max(
    ...allMeasurements.map((entry) => entry.outputTokenUpperBound)
  );
  const candidateMaxCompletionTokens = roundUp(
    Math.ceil(
      (maximumOutputTokenUpperBound *
        (10_000 + config.outputTokenHeadroomBasisPoints)) /
        10_000
    ),
    config.outputTokenRoundTo
  );
  const queueResults = config.evaluatorCandidates.flatMap((candidate) =>
    config.queuePolicies.map((policy) =>
      simulateProviderFreeQueue({
        evaluatorCandidateId: candidate.id,
        policy,
        scenario: config.queueScenario,
        providerLatenciesMs: (measurements.get(candidate.id) ?? []).map(
          ({ simulatedProviderLatencyMs }) => simulatedProviderLatencyMs
        ),
      })
    )
  );
  const queueRecommendation = recommendQueuePolicy(config, queueResults);
  const configHash = sha256(stableJson(config));
  const inputSha256 = sha256(
    stableJson({
      configHash,
      goldSet: EVALUATION_GOLD_SET_VERSION,
      adjudication: EVALUATION_ADJUDICATION_VERSION,
      schema: FEEDBACK_SCHEMA_VERSION,
      prompt: FEEDBACK_PROMPT_VERSION,
      rubric: FEEDBACK_RUBRIC_VERSION,
      ...sharedVersions,
    })
  );
  const reportWithoutReproducibility: Omit<
    ProviderFreeBakeoffReport,
    "reproducibility"
  > = {
    contractVersion: PROVIDER_FREE_BAKEOFF_REPORT_VERSION,
    generatedAt: config.replayClock,
    execution: {
      kind: "provider_free_deterministic_replay" as const,
      customerDataUsed: false as const,
      providerCredentialRead: false as const,
      paidProviderCalled: false as const,
      productionConfigurationChanged: false as const,
      defaultActivationChanged: false as const,
    },
    versions: {
      goldSet: EVALUATION_GOLD_SET_VERSION,
      adjudication: EVALUATION_ADJUDICATION_VERSION,
      schema: FEEDBACK_SCHEMA_VERSION,
      prompt: FEEDBACK_PROMPT_VERSION,
      rubric: FEEDBACK_RUBRIC_VERSION,
      ...sharedVersions,
      configHash,
    },
    candidates: candidateReports,
    outputTokenCeiling: {
      estimator: PROVIDER_FREE_TOKEN_ESTIMATOR_VERSION,
      validMeasuredOutputs: allMeasurements.length,
      maximumMeasuredOutputBytes: maximumOutputBytes,
      maximumMeasuredOutputTokenUpperBound: maximumOutputTokenUpperBound,
      headroomBasisPoints: config.outputTokenHeadroomBasisPoints,
      roundTo: config.outputTokenRoundTo,
      currentMaxCompletionTokens: config.currentMaxCompletionTokens,
      candidateMaxCompletionTokens,
      status:
        candidateMaxCompletionTokens < config.currentMaxCompletionTokens
          ? ("lower_candidate_for_owner_review" as const)
          : candidateMaxCompletionTokens === config.currentMaxCompletionTokens
            ? ("retain_current_ceiling" as const)
            : ("measured_candidate_exceeds_current_ceiling" as const),
      activated: false as const,
    },
    queue: {
      deadlineMs: FEEDBACK_GENERATION_DEADLINE_MS,
      persistenceReserveMs: FEEDBACK_GENERATION_PERSISTENCE_RESERVE_MS,
      scenario: config.queueScenario,
      results: queueResults,
      recommendation: queueRecommendation,
    },
    evaluatorDecision: {
      status: "provider_free_contract_evidence_only" as const,
      recommendedModelOrTier: null,
      liveQualityLatencyEvidenceRequired: true as const,
    },
  };
  return {
    ...reportWithoutReproducibility,
    reproducibility: {
      inputSha256,
      reportSha256: sha256(stableJson(reportWithoutReproducibility)),
    },
  };
}

export function serializeProviderFreeBakeoffReport(
  report: ProviderFreeBakeoffReport
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

async function measureCandidate(
  candidate: ProviderFreeBakeoffCandidate,
  evaluator: ReturnType<typeof createDeterministicCalibrationEvaluator>
): Promise<CandidateMeasurement[]> {
  const scoredCases = evaluationCalibrationCases
    .filter(
      (
        fixture
      ): fixture is EvaluationCalibrationCase & {
        expectedCompletionState: FeedbackEvaluationState;
      } =>
        fixture.expectedCompletionState === "full" ||
        fixture.expectedCompletionState === "partial"
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  return Promise.all(
    scoredCases.map(async (fixture) => {
      const result = await evaluator({
        fixture,
        evaluationState: fixture.expectedCompletionState,
        runIndex: 0,
      });
      const providerPayload = toProviderPayload(result);
      let structuredOutputAccepted = false;
      try {
        parseFeedbackV2(providerPayload, {
          transcript: fixture.transcript,
          evaluationState: fixture.expectedCompletionState,
          modelVersion: candidate.id,
        });
        structuredOutputAccepted = true;
      } catch {
        structuredOutputAccepted = false;
      }
      const outputBytes = Buffer.byteLength(
        JSON.stringify(providerPayload),
        "utf8"
      );
      const promptTokenUpperBound =
        structuredCalibrationInputTokenCeiling(fixture);
      const outputTokenUpperBound = outputBytes;
      const simulatedProviderLatencyMs =
        candidate.simulatedLatency.baseMs +
        Math.ceil(promptTokenUpperBound / 1_024) *
          candidate.simulatedLatency.perInputKiBMs +
        Math.ceil(outputTokenUpperBound / 1_024) *
          candidate.simulatedLatency.perOutputKiBMs;
      return {
        fixtureId: fixture.id,
        structuredOutputAccepted,
        promptTokenUpperBound,
        outputBytes,
        outputTokenUpperBound,
        simulatedProviderLatencyMs,
        estimatedComparisonCostUnits:
          tokenCostUnits(
            promptTokenUpperBound,
            candidate.comparisonCostUnitsPerMillionTokens.input
          ) +
          tokenCostUnits(
            outputTokenUpperBound,
            candidate.comparisonCostUnitsPerMillionTokens.output
          ),
      };
    })
  );
}

function toProviderPayload(result: FeedbackV2Result) {
  return {
    schemaVersion: result.schemaVersion,
    promptVersion: result.promptVersion,
    rubricVersion: result.rubricVersion,
    evaluationState: result.evaluationState,
    scores: result.scores,
    strengths: result.strengths,
    improvements: result.improvements,
    drills: result.drills,
    summary: result.summary,
  };
}

function recommendQueuePolicy(
  config: ProviderFreeBakeoffConfig,
  results: ProviderFreeQueueResult[]
): ProviderFreeBakeoffReport["queue"]["recommendation"] {
  const baselineCandidate = config.evaluatorCandidates.find(
    ({ role }) => role === "baseline"
  )!;
  const baselinePolicy = config.queuePolicies.find(
    ({ role }) => role === "baseline"
  )!;
  const baseline = results.find(
    (result) =>
      result.evaluatorCandidateId === baselineCandidate.id &&
      result.queuePolicyId === baselinePolicy.id
  )!;
  const candidateResults = results
    .filter(
      (result) =>
        result.evaluatorCandidateId === baselineCandidate.id &&
        config.queuePolicies.find(({ id }) => id === result.queuePolicyId)
          ?.role === "candidate"
    )
    .sort(
      (left, right) =>
        right.deadlineSuccessRate - left.deadlineSuccessRate ||
        left.stagesMs.total.p95 - right.stagesMs.total.p95 ||
        left.queuePolicyId.localeCompare(right.queuePolicyId)
    );
  const best = candidateResults[0];
  const improved =
    best !== undefined &&
    best.deadlineSuccessRate === 1 &&
    best.deadlineSuccessRate > baseline.deadlineSuccessRate;
  return {
    status: improved
      ? "provider_free_candidate_ready_for_staging_review"
      : "insufficient_provider_free_improvement",
    baselinePolicyId: baselinePolicy.id,
    candidatePolicyId: improved ? best.queuePolicyId : null,
    productionChangeAuthorized: false,
  };
}

function parseCandidate(
  value: unknown,
  index: number
): ProviderFreeBakeoffCandidate {
  const item = record(value, `evaluatorCandidates[${index}]`);
  exactKeys(item, `evaluatorCandidates[${index}]`, [
    "id",
    "role",
    "simulatedLatency",
    "comparisonCostUnitsPerMillionTokens",
  ]);
  const simulatedLatency = record(
    item.simulatedLatency,
    `evaluatorCandidates[${index}].simulatedLatency`
  );
  exactKeys(
    simulatedLatency,
    `evaluatorCandidates[${index}].simulatedLatency`,
    ["baseMs", "perInputKiBMs", "perOutputKiBMs"]
  );
  const cost = record(
    item.comparisonCostUnitsPerMillionTokens,
    `evaluatorCandidates[${index}].comparisonCostUnitsPerMillionTokens`
  );
  exactKeys(
    cost,
    `evaluatorCandidates[${index}].comparisonCostUnitsPerMillionTokens`,
    ["input", "output"]
  );
  return {
    id: identifier(item.id, `evaluatorCandidates[${index}].id`),
    role: role(item.role, `evaluatorCandidates[${index}].role`),
    simulatedLatency: {
      baseMs: positiveInteger(
        simulatedLatency.baseMs,
        `evaluatorCandidates[${index}].simulatedLatency.baseMs`
      ),
      perInputKiBMs: nonNegativeInteger(
        simulatedLatency.perInputKiBMs,
        `evaluatorCandidates[${index}].simulatedLatency.perInputKiBMs`
      ),
      perOutputKiBMs: nonNegativeInteger(
        simulatedLatency.perOutputKiBMs,
        `evaluatorCandidates[${index}].simulatedLatency.perOutputKiBMs`
      ),
    },
    comparisonCostUnitsPerMillionTokens: {
      input: nonNegativeInteger(
        cost.input,
        `evaluatorCandidates[${index}].comparisonCostUnitsPerMillionTokens.input`
      ),
      output: nonNegativeInteger(
        cost.output,
        `evaluatorCandidates[${index}].comparisonCostUnitsPerMillionTokens.output`
      ),
    },
  };
}

function parseQueuePolicy(
  value: unknown,
  index: number
): ProviderFreeQueuePolicy {
  const item = record(value, `queuePolicies[${index}]`);
  exactKeys(item, `queuePolicies[${index}]`, [
    "id",
    "role",
    "maxConcurrency",
    "throttle",
  ]);
  let throttle: ProviderFreeQueuePolicy["throttle"] = null;
  if (item.throttle !== null) {
    const rawThrottle = record(
      item.throttle,
      `queuePolicies[${index}].throttle`
    );
    exactKeys(rawThrottle, `queuePolicies[${index}].throttle`, [
      "limit",
      "periodMs",
    ]);
    throttle = {
      limit: positiveInteger(
        rawThrottle.limit,
        `queuePolicies[${index}].throttle.limit`
      ),
      periodMs: positiveInteger(
        rawThrottle.periodMs,
        `queuePolicies[${index}].throttle.periodMs`
      ),
    };
  }
  return {
    id: identifier(item.id, `queuePolicies[${index}].id`),
    role: role(item.role, `queuePolicies[${index}].role`),
    maxConcurrency: positiveInteger(
      item.maxConcurrency,
      `queuePolicies[${index}].maxConcurrency`
    ),
    throttle,
  };
}

function parseQueueScenario(
  value: unknown
): ProviderFreeBakeoffConfig["queueScenario"] {
  const scenario = record(value, "queueScenario");
  exactKeys(scenario, "queueScenario", [
    "burstSize",
    "arrivalSpacingMs",
    "claimMs",
    "validationMs",
    "persistenceMs",
  ]);
  return {
    burstSize: positiveInteger(scenario.burstSize, "queueScenario.burstSize"),
    arrivalSpacingMs: nonNegativeInteger(
      scenario.arrivalSpacingMs,
      "queueScenario.arrivalSpacingMs"
    ),
    claimMs: positiveInteger(scenario.claimMs, "queueScenario.claimMs"),
    validationMs: positiveInteger(
      scenario.validationMs,
      "queueScenario.validationMs"
    ),
    persistenceMs: positiveInteger(
      scenario.persistenceMs,
      "queueScenario.persistenceMs"
    ),
  };
}

function requireOneBaseline<T extends { role: string }>(
  values: T[],
  field: string
): void {
  if (values.filter(({ role }) => role === "baseline").length !== 1) {
    throw new Error(`provider_free_bakeoff_${field}_baseline_invalid`);
  }
}

function requireUniqueIds<T extends { id: string }>(
  values: T[],
  field: string
): void {
  if (new Set(values.map(({ id }) => id)).size !== values.length) {
    throw new Error(`provider_free_bakeoff_${field}_id_duplicate`);
  }
}

function roundUp(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

function tokenCostUnits(tokens: number, unitsPerMillion: number): number {
  return Math.ceil((tokens * unitsPerMillion) / 1_000_000);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`provider_free_bakeoff_${field}_invalid`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`provider_free_bakeoff_${field}_invalid`);
  }
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  field: string,
  keys: string[]
): void {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (stableJson(expected) !== stableJson(actual)) {
    throw new Error(`provider_free_bakeoff_${field}_schema_invalid`);
  }
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`provider_free_bakeoff_${field}_invalid`);
  }
  return value;
}

function identifier(value: unknown, field: string): string {
  const result = string(value, field);
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(result)) {
    throw new Error(`provider_free_bakeoff_${field}_invalid`);
  }
  return result;
}

function role(value: unknown, field: string): "baseline" | "candidate" {
  if (value !== "baseline" && value !== "candidate") {
    throw new Error(`provider_free_bakeoff_${field}_invalid`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`provider_free_bakeoff_${field}_invalid`);
  }
  return value as number;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`provider_free_bakeoff_${field}_invalid`);
  }
  return value as number;
}
