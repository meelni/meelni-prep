import {
  DIRECTOR_RECOMMENDATION_CONTRACT_VERSION,
  INTERVIEWER_MOVE_CONTRACT_VERSION,
  INTERVIEWER_MOVE_TYPES,
  INTERVIEWER_TOOL_CONTRACT_VERSION,
  INTERVIEWER_TOOL_NAMES,
  INTERVIEWER_TOOL_RESULT_STATUSES,
  INTERVIEW_PHASES,
  type InterviewerMoveType,
  type InterviewerToolName,
  type InterviewerToolResultStatus,
  type InterviewPhase,
} from "./interviewer-contract-types";

export const INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION =
  "interviewer-observability.v1" as const;
export const INTERVIEWER_OBSERVABILITY_REPORT_VERSION =
  "interviewer-observability-report.v1" as const;

export const INTERVIEWER_ROLLOUT_COHORTS = [
  "current",
  "shadow",
  "canary",
] as const;
export type InterviewerRolloutCohort =
  (typeof INTERVIEWER_ROLLOUT_COHORTS)[number];

export const INTERVIEWER_RUNTIME_VERSIONS = [
  "current-prompt.v1",
  "director-shadow.v1",
  "adaptive-canary.v1",
] as const;
export type InterviewerRuntimeVersion =
  (typeof INTERVIEWER_RUNTIME_VERSIONS)[number];

export const INTERVIEWER_MOVE_OBSERVABILITY_STAGES = [
  "planned",
  "admitted",
  "generated",
  "scheduled",
  "spoken",
  "interrupted",
  "aborted",
  "canonically_delivered",
] as const;
export type InterviewerMoveObservabilityStage =
  (typeof INTERVIEWER_MOVE_OBSERVABILITY_STAGES)[number];

export const DIRECTOR_OBSERVABILITY_OUTCOMES = [
  "ready",
  "admitted",
  "rejected",
  "stale",
  "malformed",
  "timeout",
  "unavailable",
] as const;
export type DirectorObservabilityOutcome =
  (typeof DIRECTOR_OBSERVABILITY_OUTCOMES)[number];

export const DIRECTOR_RECOMMENDATION_FRESHNESS = [
  "fresh",
  "stale",
  "speculative",
  "missing",
] as const;
export type DirectorRecommendationFreshness =
  (typeof DIRECTOR_RECOMMENDATION_FRESHNESS)[number];

export const INTERVIEWER_LATENCY_KINDS = [
  "user_speech_to_first_audio",
  "controller_decision_to_first_audio",
  "director_ready",
  "tool_execution",
  "interruption_recovery",
] as const;
export type InterviewerLatencyKind = (typeof INTERVIEWER_LATENCY_KINDS)[number];

export const INTERVIEWER_INTERRUPTION_STAGES = [
  "interrupted",
  "recovery_started",
  "recovered",
  "unrecovered",
] as const;
export type InterviewerInterruptionStage =
  (typeof INTERVIEWER_INTERRUPTION_STAGES)[number];

export const INTERVIEWER_DELIVERY_OBSERVATIONS = [
  "no_prefix",
  "partial_prefix",
  "full_delivery",
  "unknown",
] as const;
export type InterviewerDeliveryObservation =
  (typeof INTERVIEWER_DELIVERY_OBSERVATIONS)[number];

export const INTERVIEWER_FALLBACK_REASONS = [
  "controller_policy",
  "director_unavailable",
  "director_stale",
  "director_malformed",
  "director_timeout",
  "tool_timeout",
  "tool_failure",
  "prompt_build_failure",
  "provider_failure",
] as const;
export type InterviewerFallbackReason =
  (typeof INTERVIEWER_FALLBACK_REASONS)[number];

export const INTERVIEWER_CLOSE_REASONS = [
  "user_end",
  "time_limit",
  "candidate_request",
  "disconnect",
  "provider_failure",
  "runtime_closed",
  "unknown",
] as const;
export type InterviewerCloseReason = (typeof INTERVIEWER_CLOSE_REASONS)[number];

export type InterviewerCompletionStatus =
  | "completed"
  | "abandoned"
  | "failed"
  | "unknown";

interface InterviewerObservabilityEventBase {
  contract_version: typeof INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION;
  runtime_correlation_id: string;
  turn_correlation_id: string | null;
  runtime_version: InterviewerRuntimeVersion;
  rollout_cohort: InterviewerRolloutCohort;
  emitted_at: string;
}

export type InterviewerObservabilityEvent =
  | (InterviewerObservabilityEventBase & {
      event_kind: "phase";
      phase: InterviewPhase;
    })
  | (InterviewerObservabilityEventBase & {
      event_kind: "move";
      move_contract_version: typeof INTERVIEWER_MOVE_CONTRACT_VERSION;
      move_stage: InterviewerMoveObservabilityStage;
      move_type: InterviewerMoveType;
      probe_target_id: string | null;
    })
  | (InterviewerObservabilityEventBase & {
      event_kind: "tool";
      tool_contract_version: typeof INTERVIEWER_TOOL_CONTRACT_VERSION;
      tool_name: InterviewerToolName;
      tool_outcome: InterviewerToolResultStatus;
      latency_ms: number;
    })
  | (InterviewerObservabilityEventBase & {
      event_kind: "director";
      recommendation_contract_version: typeof DIRECTOR_RECOMMENDATION_CONTRACT_VERSION;
      recommendation_outcome: DirectorObservabilityOutcome;
      recommendation_freshness: DirectorRecommendationFreshness;
      ready_latency_ms: number | null;
      recommendation_age_ms: number | null;
    })
  | (InterviewerObservabilityEventBase & {
      event_kind: "latency";
      latency_kind: InterviewerLatencyKind;
      latency_ms: number;
    })
  | (InterviewerObservabilityEventBase & {
      event_kind: "interruption";
      interruption_stage: InterviewerInterruptionStage;
      delivery_observation: InterviewerDeliveryObservation;
      recovery_latency_ms: number | null;
    })
  | (InterviewerObservabilityEventBase & {
      event_kind: "fallback";
      fallback_reason: InterviewerFallbackReason;
      fallback_source: "controller" | "director" | "tool" | "runtime";
    })
  | (InterviewerObservabilityEventBase & {
      event_kind: "close";
      close_reason: InterviewerCloseReason;
      close_outcome: "observed" | "settled" | "deferred" | "failed";
      completion_status: InterviewerCompletionStatus;
      completion_authority: "canonical_lifecycle" | "runtime_observed";
    });

const COMMON_KEYS = [
  "contract_version",
  "event_kind",
  "runtime_correlation_id",
  "turn_correlation_id",
  "runtime_version",
  "rollout_cohort",
  "emitted_at",
] as const;

export class InterviewerObservabilityContractError extends Error {
  constructor() {
    super("Invalid interviewer observability event");
    this.name = "InterviewerObservabilityContractError";
  }
}

export function parseInterviewerObservabilityEvent(
  value: unknown
): InterviewerObservabilityEvent {
  if (!isInterviewerObservabilityEvent(value)) {
    throw new InterviewerObservabilityContractError();
  }
  return value;
}

export function isInterviewerObservabilityEvent(
  value: unknown
): value is InterviewerObservabilityEvent {
  if (!isRecord(value) || typeof value.event_kind !== "string") return false;
  const keys = eventKeys(value.event_kind);
  if (!keys || !hasExactKeys(value, keys)) return false;
  if (
    value.contract_version !== INTERVIEWER_OBSERVABILITY_CONTRACT_VERSION ||
    !isRuntimeCorrelationId(value.runtime_correlation_id) ||
    !isNullableTurnCorrelationId(value.turn_correlation_id) ||
    !includes(INTERVIEWER_RUNTIME_VERSIONS, value.runtime_version) ||
    !includes(INTERVIEWER_ROLLOUT_COHORTS, value.rollout_cohort) ||
    !isCanonicalTimestamp(value.emitted_at)
  ) {
    return false;
  }

  switch (value.event_kind) {
    case "phase":
      return includes(INTERVIEW_PHASES, value.phase);
    case "move":
      return (
        value.move_contract_version === INTERVIEWER_MOVE_CONTRACT_VERSION &&
        includes(INTERVIEWER_MOVE_OBSERVABILITY_STAGES, value.move_stage) &&
        includes(INTERVIEWER_MOVE_TYPES, value.move_type) &&
        isNullableProbeTargetId(value.probe_target_id)
      );
    case "tool":
      return (
        value.tool_contract_version === INTERVIEWER_TOOL_CONTRACT_VERSION &&
        includes(INTERVIEWER_TOOL_NAMES, value.tool_name) &&
        includes(INTERVIEWER_TOOL_RESULT_STATUSES, value.tool_outcome) &&
        isLatency(value.latency_ms)
      );
    case "director":
      return (
        value.recommendation_contract_version ===
          DIRECTOR_RECOMMENDATION_CONTRACT_VERSION &&
        includes(
          DIRECTOR_OBSERVABILITY_OUTCOMES,
          value.recommendation_outcome
        ) &&
        includes(
          DIRECTOR_RECOMMENDATION_FRESHNESS,
          value.recommendation_freshness
        ) &&
        isNullableLatency(value.ready_latency_ms) &&
        isNullableLatency(value.recommendation_age_ms)
      );
    case "latency":
      return (
        includes(INTERVIEWER_LATENCY_KINDS, value.latency_kind) &&
        isLatency(value.latency_ms)
      );
    case "interruption":
      return (
        includes(INTERVIEWER_INTERRUPTION_STAGES, value.interruption_stage) &&
        includes(
          INTERVIEWER_DELIVERY_OBSERVATIONS,
          value.delivery_observation
        ) &&
        isNullableLatency(value.recovery_latency_ms)
      );
    case "fallback":
      return (
        includes(INTERVIEWER_FALLBACK_REASONS, value.fallback_reason) &&
        includes(
          ["controller", "director", "tool", "runtime"] as const,
          value.fallback_source
        )
      );
    case "close":
      return (
        includes(INTERVIEWER_CLOSE_REASONS, value.close_reason) &&
        includes(
          ["observed", "settled", "deferred", "failed"] as const,
          value.close_outcome
        ) &&
        includes(
          ["completed", "abandoned", "failed", "unknown"] as const,
          value.completion_status
        ) &&
        includes(
          ["canonical_lifecycle", "runtime_observed"] as const,
          value.completion_authority
        )
      );
    default:
      return false;
  }
}

function eventKeys(eventKind: string): readonly string[] | null {
  switch (eventKind) {
    case "phase":
      return [...COMMON_KEYS, "phase"];
    case "move":
      return [
        ...COMMON_KEYS,
        "move_contract_version",
        "move_stage",
        "move_type",
        "probe_target_id",
      ];
    case "tool":
      return [
        ...COMMON_KEYS,
        "tool_contract_version",
        "tool_name",
        "tool_outcome",
        "latency_ms",
      ];
    case "director":
      return [
        ...COMMON_KEYS,
        "recommendation_contract_version",
        "recommendation_outcome",
        "recommendation_freshness",
        "ready_latency_ms",
        "recommendation_age_ms",
      ];
    case "latency":
      return [...COMMON_KEYS, "latency_kind", "latency_ms"];
    case "interruption":
      return [
        ...COMMON_KEYS,
        "interruption_stage",
        "delivery_observation",
        "recovery_latency_ms",
      ];
    case "fallback":
      return [...COMMON_KEYS, "fallback_reason", "fallback_source"];
    case "close":
      return [
        ...COMMON_KEYS,
        "close_reason",
        "close_outcome",
        "completion_status",
        "completion_authority",
      ];
    default:
      return null;
  }
}

export interface InterviewerObservabilityAggregate {
  rollout_cohort: InterviewerRolloutCohort;
  runtime_version: string;
  runtime_count: number;
  measured_turn_count: number;
  delivered_probe_count: number;
  repeated_probe_count: number;
  repeated_probe_rate: number | null;
  fallback_count: number;
  fallback_rate: number;
  tool_call_count: number;
  tool_failure_count: number;
  tool_failure_rate: number | null;
  director_result_count: number;
  stale_recommendation_count: number;
  stale_recommendation_rate: number | null;
  interruption_count: number;
  recovered_interruption_count: number;
  interruption_recovery_rate: number | null;
  canonical_close_count: number;
  completed_session_count: number;
  completion_rate: number | null;
  user_speech_to_first_audio_ms: PercentileSummary;
  director_ready_ms: PercentileSummary;
  tool_latency_ms: PercentileSummary;
  interruption_recovery_ms: PercentileSummary;
}

export interface PercentileSummary {
  count: number;
  p50: number | null;
  p95: number | null;
}

export interface InterviewerObservabilityRollbackThresholds {
  minimum_runtime_count: number;
  max_p95_user_speech_to_first_audio_increase_ms: number;
  max_fallback_rate_increase: number;
  max_repeated_probe_rate_increase: number;
  max_completion_rate_drop: number;
  max_stale_recommendation_rate: number;
  max_tool_failure_rate: number;
  max_unrecovered_interruption_rate: number;
}

export type InterviewerRollbackSignalCode =
  | "insufficient_sample"
  | "p95_user_speech_to_first_audio_regression"
  | "fallback_rate_regression"
  | "repeated_probe_rate_regression"
  | "completion_rate_regression"
  | "stale_recommendation_rate_high"
  | "tool_failure_rate_high"
  | "interruption_recovery_rate_low";

export interface InterviewerObservabilityRollbackAssessment {
  rollout_cohort: Exclude<InterviewerRolloutCohort, "current">;
  runtime_version: string;
  recommendation: "pass" | "hold" | "rollback";
  signals: InterviewerRollbackSignalCode[];
}

export interface InterviewerObservabilityComparisonReport {
  contract_version: typeof INTERVIEWER_OBSERVABILITY_REPORT_VERSION;
  baseline_runtime_version: string;
  aggregates: InterviewerObservabilityAggregate[];
  rollback_assessments: InterviewerObservabilityRollbackAssessment[];
}

export function buildInterviewerObservabilityComparisonReport(
  events: readonly InterviewerObservabilityEvent[],
  input: {
    baselineRuntimeVersion: string;
    thresholds: InterviewerObservabilityRollbackThresholds;
  }
): InterviewerObservabilityComparisonReport {
  if (
    !isBoundedLabel(input.baselineRuntimeVersion) ||
    !areValidThresholds(input.thresholds)
  ) {
    throw new InterviewerObservabilityContractError();
  }
  const parsed = events.map(parseInterviewerObservabilityEvent);
  const grouped = new Map<string, InterviewerObservabilityEvent[]>();
  for (const event of parsed) {
    const key = `${event.rollout_cohort}\u0000${event.runtime_version}`;
    const group = grouped.get(key) ?? [];
    group.push(event);
    grouped.set(key, group);
  }
  const aggregates = [...grouped.values()]
    .map(aggregateInterviewerObservabilityEvents)
    .sort((left, right) =>
      `${left.rollout_cohort}:${left.runtime_version}`.localeCompare(
        `${right.rollout_cohort}:${right.runtime_version}`
      )
    );
  const baseline = aggregates.find(
    (aggregate) =>
      aggregate.rollout_cohort === "current" &&
      aggregate.runtime_version === input.baselineRuntimeVersion
  );
  if (!baseline) throw new InterviewerObservabilityContractError();

  const rollbackAssessments = aggregates
    .filter(
      (
        aggregate
      ): aggregate is InterviewerObservabilityAggregate & {
        rollout_cohort: "shadow" | "canary";
      } => aggregate.rollout_cohort !== "current"
    )
    .map((aggregate) => assessRollback(baseline, aggregate, input.thresholds));

  return {
    contract_version: INTERVIEWER_OBSERVABILITY_REPORT_VERSION,
    baseline_runtime_version: input.baselineRuntimeVersion,
    aggregates,
    rollback_assessments: rollbackAssessments,
  };
}

export function aggregateInterviewerObservabilityEvents(
  events: readonly InterviewerObservabilityEvent[]
): InterviewerObservabilityAggregate {
  if (events.length === 0) throw new InterviewerObservabilityContractError();
  const parsed = events.map(parseInterviewerObservabilityEvent);
  const { rollout_cohort, runtime_version } = parsed[0];
  if (
    parsed.some(
      (event) =>
        event.rollout_cohort !== rollout_cohort ||
        event.runtime_version !== runtime_version
    )
  ) {
    throw new InterviewerObservabilityContractError();
  }

  const runtimeIds = new Set(
    parsed.map((event) => event.runtime_correlation_id)
  );
  const deliveredProbeTargets = new Map<string, Set<string>>();
  const latencies = {
    user: [] as number[],
    director: [] as number[],
    tool: [] as number[],
    recovery: [] as number[],
  };
  let measuredTurnCount = 0;
  let deliveredProbeCount = 0;
  let repeatedProbeCount = 0;
  let fallbackCount = 0;
  const fallbackRuntimeIds = new Set<string>();
  let toolCallCount = 0;
  let toolFailureCount = 0;
  let directorResultCount = 0;
  let staleRecommendationCount = 0;
  const interruptionStates = new Map<
    string,
    {
      interrupted: boolean;
      recovered: boolean;
      unrecovered: boolean;
      recoveryLatencyMs: number | null;
    }
  >();
  let canonicalCloseCount = 0;
  let completedSessionCount = 0;

  for (const event of parsed) {
    switch (event.event_kind) {
      case "move":
        if (
          event.move_stage === "canonically_delivered" &&
          event.probe_target_id !== null
        ) {
          deliveredProbeCount += 1;
          const targets =
            deliveredProbeTargets.get(event.runtime_correlation_id) ??
            new Set();
          if (targets.has(event.probe_target_id)) repeatedProbeCount += 1;
          targets.add(event.probe_target_id);
          deliveredProbeTargets.set(event.runtime_correlation_id, targets);
        }
        break;
      case "latency":
        if (event.latency_kind === "user_speech_to_first_audio") {
          measuredTurnCount += 1;
          latencies.user.push(event.latency_ms);
        } else if (event.latency_kind === "director_ready") {
          latencies.director.push(event.latency_ms);
        } else if (event.latency_kind === "tool_execution") {
          latencies.tool.push(event.latency_ms);
        } else if (
          event.latency_kind === "interruption_recovery" &&
          event.turn_correlation_id !== null
        ) {
          const state = interruptionStates.get(event.turn_correlation_id) ?? {
            interrupted: false,
            recovered: false,
            unrecovered: false,
            recoveryLatencyMs: null,
          };
          state.recoveryLatencyMs = Math.max(
            state.recoveryLatencyMs ?? 0,
            event.latency_ms
          );
          interruptionStates.set(event.turn_correlation_id, state);
        }
        break;
      case "director":
        directorResultCount += 1;
        if (
          event.recommendation_freshness === "stale" ||
          event.recommendation_outcome === "stale"
        ) {
          staleRecommendationCount += 1;
        }
        if (event.ready_latency_ms !== null) {
          latencies.director.push(event.ready_latency_ms);
        }
        break;
      case "tool":
        toolCallCount += 1;
        latencies.tool.push(event.latency_ms);
        if (event.tool_outcome !== "ok" && event.tool_outcome !== "duplicate") {
          toolFailureCount += 1;
        }
        break;
      case "interruption":
        if (event.turn_correlation_id !== null) {
          const state = interruptionStates.get(event.turn_correlation_id) ?? {
            interrupted: false,
            recovered: false,
            unrecovered: false,
            recoveryLatencyMs: null,
          };
          if (event.interruption_stage === "interrupted") {
            state.interrupted = true;
          } else if (event.interruption_stage === "recovered") {
            state.recovered = true;
            if (event.recovery_latency_ms !== null) {
              state.recoveryLatencyMs = Math.max(
                state.recoveryLatencyMs ?? 0,
                event.recovery_latency_ms
              );
            }
          } else if (event.interruption_stage === "unrecovered") {
            state.unrecovered = true;
          }
          interruptionStates.set(event.turn_correlation_id, state);
        }
        break;
      case "fallback":
        fallbackCount += 1;
        fallbackRuntimeIds.add(event.runtime_correlation_id);
        break;
      case "close":
        if (event.completion_authority === "canonical_lifecycle") {
          canonicalCloseCount += 1;
          if (event.completion_status === "completed") {
            completedSessionCount += 1;
          }
        }
        break;
      case "phase":
        break;
    }
  }

  let interruptionCount = 0;
  let recoveredInterruptionCount = 0;
  for (const state of interruptionStates.values()) {
    if (!state.interrupted) continue;
    interruptionCount += 1;
    if (!state.recovered || state.unrecovered) continue;
    recoveredInterruptionCount += 1;
    if (state.recoveryLatencyMs !== null) {
      latencies.recovery.push(state.recoveryLatencyMs);
    }
  }

  return {
    rollout_cohort,
    runtime_version,
    runtime_count: runtimeIds.size,
    measured_turn_count: measuredTurnCount,
    delivered_probe_count: deliveredProbeCount,
    repeated_probe_count: repeatedProbeCount,
    repeated_probe_rate: rate(repeatedProbeCount, deliveredProbeCount),
    fallback_count: fallbackCount,
    fallback_rate: rate(fallbackRuntimeIds.size, runtimeIds.size) ?? 0,
    tool_call_count: toolCallCount,
    tool_failure_count: toolFailureCount,
    tool_failure_rate: rate(toolFailureCount, toolCallCount),
    director_result_count: directorResultCount,
    stale_recommendation_count: staleRecommendationCount,
    stale_recommendation_rate: rate(
      staleRecommendationCount,
      directorResultCount
    ),
    interruption_count: interruptionCount,
    recovered_interruption_count: recoveredInterruptionCount,
    interruption_recovery_rate: rate(
      recoveredInterruptionCount,
      interruptionCount
    ),
    canonical_close_count: canonicalCloseCount,
    completed_session_count: completedSessionCount,
    completion_rate: rate(completedSessionCount, canonicalCloseCount),
    user_speech_to_first_audio_ms: percentileSummary(latencies.user),
    director_ready_ms: percentileSummary(latencies.director),
    tool_latency_ms: percentileSummary(latencies.tool),
    interruption_recovery_ms: percentileSummary(latencies.recovery),
  };
}

function assessRollback(
  baseline: InterviewerObservabilityAggregate,
  candidate: InterviewerObservabilityAggregate & {
    rollout_cohort: "shadow" | "canary";
  },
  thresholds: InterviewerObservabilityRollbackThresholds
): InterviewerObservabilityRollbackAssessment {
  const signals: InterviewerRollbackSignalCode[] = [];
  if (
    baseline.runtime_count < thresholds.minimum_runtime_count ||
    candidate.runtime_count < thresholds.minimum_runtime_count ||
    !hasRequiredRollbackEvidence(baseline, candidate)
  ) {
    signals.push("insufficient_sample");
  }
  if (
    exceedsIncrease(
      baseline.user_speech_to_first_audio_ms.p95,
      candidate.user_speech_to_first_audio_ms.p95,
      thresholds.max_p95_user_speech_to_first_audio_increase_ms
    )
  ) {
    signals.push("p95_user_speech_to_first_audio_regression");
  }
  if (
    candidate.fallback_rate - baseline.fallback_rate >
    thresholds.max_fallback_rate_increase
  ) {
    signals.push("fallback_rate_regression");
  }
  if (
    exceedsRateIncrease(
      baseline.repeated_probe_rate,
      candidate.repeated_probe_rate,
      thresholds.max_repeated_probe_rate_increase
    )
  ) {
    signals.push("repeated_probe_rate_regression");
  }
  if (
    exceedsRateDrop(
      baseline.completion_rate,
      candidate.completion_rate,
      thresholds.max_completion_rate_drop
    )
  ) {
    signals.push("completion_rate_regression");
  }
  if (
    candidate.stale_recommendation_rate !== null &&
    candidate.stale_recommendation_rate >
      thresholds.max_stale_recommendation_rate
  ) {
    signals.push("stale_recommendation_rate_high");
  }
  if (
    candidate.tool_failure_rate !== null &&
    candidate.tool_failure_rate > thresholds.max_tool_failure_rate
  ) {
    signals.push("tool_failure_rate_high");
  }
  if (
    candidate.interruption_recovery_rate !== null &&
    1 - candidate.interruption_recovery_rate >
      thresholds.max_unrecovered_interruption_rate
  ) {
    signals.push("interruption_recovery_rate_low");
  }

  const regression = signals.some((signal) => signal !== "insufficient_sample");
  return {
    rollout_cohort: candidate.rollout_cohort,
    runtime_version: candidate.runtime_version,
    recommendation: signals.includes("insufficient_sample")
      ? "hold"
      : regression
        ? "rollback"
        : "pass",
    signals,
  };
}

function percentileSummary(values: number[]): PercentileSummary {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

function percentile(sorted: number[], quantile: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? null;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0
    ? null
    : Math.min(1, Math.max(0, numerator / denominator));
}

function hasRequiredRollbackEvidence(
  baseline: InterviewerObservabilityAggregate,
  candidate: InterviewerObservabilityAggregate
): boolean {
  return (
    baseline.user_speech_to_first_audio_ms.p95 !== null &&
    candidate.user_speech_to_first_audio_ms.p95 !== null &&
    baseline.repeated_probe_rate !== null &&
    candidate.repeated_probe_rate !== null &&
    baseline.completion_rate !== null &&
    candidate.completion_rate !== null &&
    candidate.stale_recommendation_rate !== null &&
    candidate.director_ready_ms.p95 !== null &&
    candidate.tool_failure_rate !== null &&
    candidate.tool_latency_ms.p95 !== null &&
    candidate.interruption_recovery_rate !== null &&
    candidate.interruption_recovery_ms.p95 !== null
  );
}

function exceedsIncrease(
  baseline: number | null,
  candidate: number | null,
  threshold: number
): boolean {
  return (
    baseline !== null && candidate !== null && candidate - baseline > threshold
  );
}

function exceedsRateIncrease(
  baseline: number | null,
  candidate: number | null,
  threshold: number
): boolean {
  return (
    baseline !== null && candidate !== null && candidate - baseline > threshold
  );
}

function exceedsRateDrop(
  baseline: number | null,
  candidate: number | null,
  threshold: number
): boolean {
  return (
    baseline !== null && candidate !== null && baseline - candidate > threshold
  );
}

function areValidThresholds(
  value: InterviewerObservabilityRollbackThresholds
): boolean {
  return (
    Number.isSafeInteger(value.minimum_runtime_count) &&
    value.minimum_runtime_count > 0 &&
    isLatency(value.max_p95_user_speech_to_first_audio_increase_ms) &&
    isRate(value.max_fallback_rate_increase) &&
    isRate(value.max_repeated_probe_rate_increase) &&
    isRate(value.max_completion_rate_drop) &&
    isRate(value.max_stale_recommendation_rate) &&
    isRate(value.max_tool_failure_rate) &&
    isRate(value.max_unrecovered_interruption_rate)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function includes<const T extends readonly unknown[]>(
  values: T,
  value: unknown
): value is T[number] {
  return values.includes(value);
}

function isBoundedLabel(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:/-]{1,120}$/u.test(value);
}

function isRuntimeCorrelationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^run:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      value
    )
  );
}

function isTurnCorrelationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^turn:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      value
    )
  );
}

function isNullableTurnCorrelationId(value: unknown): value is string | null {
  return value === null || isTurnCorrelationId(value);
}

function isNullableProbeTargetId(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && /^probe:[0-9a-f]{32,64}$/u.test(value))
  );
}

function isLatency(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 86_400_000
  );
}

function isNullableLatency(value: unknown): value is number | null {
  return value === null || isLatency(value);
}

function isRate(value: unknown): value is number {
  return isLatency(value) && value <= 1;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  if (year < 1 || year > 9999) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
