import {
  FEEDBACK_GENERATION_DEADLINE_MS,
  planFeedbackProviderAttempt,
} from "./feedback-generation-policy";

export interface NumericDistribution {
  minimum: number;
  p50: number;
  p95: number;
  maximum: number;
}

export interface ProviderFreeQueuePolicy {
  id: string;
  role: "baseline" | "candidate";
  maxConcurrency: number;
  throttle: null | {
    limit: number;
    periodMs: number;
  };
}

export interface ProviderFreeQueueScenario {
  burstSize: number;
  arrivalSpacingMs: number;
  claimMs: number;
  validationMs: number;
  persistenceMs: number;
}

export interface ProviderFreeQueueResult {
  evaluatorCandidateId: string;
  queuePolicyId: string;
  totalJobs: number;
  providerStartedJobs: number;
  completedWithinDeadlineJobs: number;
  expiredBeforeProviderJobs: number;
  timedOutProviderJobs: number;
  deadlineSuccessRate: number;
  stagesMs: {
    throttleWait: NumericDistribution;
    concurrencyWait: NumericDistribution;
    claim: NumericDistribution;
    provider: NumericDistribution;
    validation: NumericDistribution;
    persistence: NumericDistribution;
    total: NumericDistribution;
  };
}

export function simulateProviderFreeQueue(input: {
  evaluatorCandidateId: string;
  policy: ProviderFreeQueuePolicy;
  scenario: ProviderFreeQueueScenario;
  providerLatenciesMs: number[];
}): ProviderFreeQueueResult {
  const { evaluatorCandidateId, policy, scenario, providerLatenciesMs } = input;
  if (providerLatenciesMs.length === 0) {
    throw new Error("provider_free_bakeoff_queue_has_no_measurements");
  }
  const starts: number[] = [];
  let activeFinishes: number[] = [];
  const throttleWait: number[] = [];
  const concurrencyWait: number[] = [];
  const claim: number[] = [];
  const provider: number[] = [];
  const validation: number[] = [];
  const persistence: number[] = [];
  const total: number[] = [];
  let providerStartedJobs = 0;
  let completedWithinDeadlineJobs = 0;
  let expiredBeforeProviderJobs = 0;
  let timedOutProviderJobs = 0;

  for (let index = 0; index < scenario.burstSize; index += 1) {
    const arrivalAt = index * scenario.arrivalSpacingMs;
    const throttleReadyAt = earliestThrottleStart(
      arrivalAt,
      starts,
      policy.throttle
    );
    const orderedReadyAt = Math.max(
      throttleReadyAt,
      starts[starts.length - 1] ?? throttleReadyAt
    );
    activeFinishes = activeFinishes.filter(
      (finishAt) => finishAt > orderedReadyAt
    );
    const concurrencyReadyAt =
      activeFinishes.length < policy.maxConcurrency
        ? orderedReadyAt
        : Math.min(...activeFinishes);
    const startedAt = Math.max(orderedReadyAt, concurrencyReadyAt);
    activeFinishes = activeFinishes.filter((finishAt) => finishAt > startedAt);
    starts.push(startedAt);
    const providerStartedAt = startedAt + scenario.claimMs;
    const deadlineAt = arrivalAt + FEEDBACK_GENERATION_DEADLINE_MS;
    const providerPlan = planFeedbackProviderAttempt({
      attempt: 1,
      deadlineAtMs: deadlineAt,
      nowMs: providerStartedAt,
    });
    const providerLatencyMs =
      providerLatenciesMs[index % providerLatenciesMs.length]!;
    let finishedAt = providerStartedAt;
    let providerStageMs = 0;
    let validationStageMs = 0;
    let persistenceStageMs = 0;
    if (!providerPlan) {
      expiredBeforeProviderJobs += 1;
    } else {
      providerStartedJobs += 1;
      providerStageMs = Math.min(
        providerLatencyMs,
        providerPlan.requestTimeoutMs
      );
      finishedAt += providerStageMs;
      if (providerLatencyMs > providerPlan.requestTimeoutMs) {
        timedOutProviderJobs += 1;
      } else {
        validationStageMs = scenario.validationMs;
        persistenceStageMs = scenario.persistenceMs;
        finishedAt += validationStageMs + persistenceStageMs;
        if (finishedAt <= deadlineAt) completedWithinDeadlineJobs += 1;
      }
    }
    activeFinishes.push(finishedAt);
    throttleWait.push(throttleReadyAt - arrivalAt);
    concurrencyWait.push(startedAt - throttleReadyAt);
    claim.push(scenario.claimMs);
    provider.push(providerStageMs);
    validation.push(validationStageMs);
    persistence.push(persistenceStageMs);
    total.push(finishedAt - arrivalAt);
  }

  return {
    evaluatorCandidateId,
    queuePolicyId: policy.id,
    totalJobs: scenario.burstSize,
    providerStartedJobs,
    completedWithinDeadlineJobs,
    expiredBeforeProviderJobs,
    timedOutProviderJobs,
    deadlineSuccessRate: completedWithinDeadlineJobs / scenario.burstSize,
    stagesMs: {
      throttleWait: createNumericDistribution(throttleWait),
      concurrencyWait: createNumericDistribution(concurrencyWait),
      claim: createNumericDistribution(claim),
      provider: createNumericDistribution(provider),
      validation: createNumericDistribution(validation),
      persistence: createNumericDistribution(persistence),
      total: createNumericDistribution(total),
    },
  };
}

export function createNumericDistribution(
  values: number[]
): NumericDistribution {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("provider_free_bakeoff_distribution_invalid");
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    minimum: sorted[0]!,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    maximum: sorted[sorted.length - 1]!,
  };
}

function earliestThrottleStart(
  arrivalAt: number,
  starts: number[],
  throttle: ProviderFreeQueuePolicy["throttle"]
): number {
  if (!throttle) return arrivalAt;
  let candidate = arrivalAt;
  while (true) {
    const recent = starts.filter(
      (startedAt) =>
        startedAt > candidate - throttle.periodMs && startedAt <= candidate
    );
    if (recent.length < throttle.limit) return candidate;
    candidate = recent[recent.length - throttle.limit]! + throttle.periodMs;
  }
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
}
