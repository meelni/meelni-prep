export const INTERVIEW_START_SLOS = {
  launch_request: { targetMs: 3_000, upperBoundMs: 10_000 },
  transport_connection: { targetMs: 5_000, upperBoundMs: 10_000 },
  canonical_readiness: { targetMs: 10_000, upperBoundMs: 25_000 },
  presence_reconciliation: { targetMs: 1_000, upperBoundMs: 3_000 },
  customer_read: { targetMs: 5_000, upperBoundMs: 8_000 },
} as const;

export type InterviewStartSlo = keyof typeof INTERVIEW_START_SLOS;
export type InterviewStartLatencyClass =
  | "within_target"
  | "above_target"
  | "above_upper_bound";

export function classifyInterviewStartLatency(
  slo: InterviewStartSlo,
  durationMs: number
): InterviewStartLatencyClass | null {
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  const threshold = INTERVIEW_START_SLOS[slo];
  if (durationMs >= threshold.upperBoundMs) return "above_upper_bound";
  if (durationMs >= threshold.targetMs) return "above_target";
  return "within_target";
}

export const INTERVIEW_START_STAGE_OUTCOMES = [
  "succeeded",
  "delayed",
  "terminal",
  "aborted",
  "failed",
] as const;

export type InterviewStartStageOutcome =
  (typeof INTERVIEW_START_STAGE_OUTCOMES)[number];

export interface InterviewStartStageEvent {
  event: "meelni_interview_start_stage";
  version: 1;
  stage: InterviewStartSlo;
  outcome: InterviewStartStageOutcome;
  durationMs: number;
  sloTargetMs: number;
  sloUpperBoundMs: number;
  latencyClass: InterviewStartLatencyClass;
}

/** Builds a closed, content-free event safe for client analytics or logs. */
export function buildInterviewStartStageEvent(input: {
  stage: InterviewStartSlo;
  outcome: InterviewStartStageOutcome;
  durationMs: number;
}): InterviewStartStageEvent | null {
  const latencyClass = classifyInterviewStartLatency(
    input.stage,
    input.durationMs
  );
  if (!latencyClass) return null;
  const threshold = INTERVIEW_START_SLOS[input.stage];
  return {
    event: "meelni_interview_start_stage",
    version: 1,
    stage: input.stage,
    outcome: input.outcome,
    durationMs: Math.round(input.durationMs),
    sloTargetMs: threshold.targetMs,
    sloUpperBoundMs: threshold.upperBoundMs,
    latencyClass,
  };
}
