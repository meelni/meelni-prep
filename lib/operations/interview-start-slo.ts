export const INTERVIEW_START_SLOS = {
  launch_request: { targetMs: 3_000, upperBoundMs: 10_000 },
  authorization_gate: { targetMs: 500, upperBoundMs: 2_000 },
  account_trial: { targetMs: 500, upperBoundMs: 2_000 },
  question_selection: { targetMs: 300, upperBoundMs: 1_500 },
  credit_reservation: { targetMs: 1_000, upperBoundMs: 3_000 },
  durable_session_claim: { targetMs: 500, upperBoundMs: 2_000 },
  deadline_scheduling: { targetMs: 500, upperBoundMs: 2_000 },
  livekit_room_create: { targetMs: 1_000, upperBoundMs: 4_000 },
  livekit_room_verification: { targetMs: 500, upperBoundMs: 2_000 },
  livekit_dispatch_verification: { targetMs: 500, upperBoundMs: 2_000 },
  readiness_persistence: { targetMs: 500, upperBoundMs: 2_000 },
  token_issuance: { targetMs: 250, upperBoundMs: 1_000 },
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

export interface InterviewStartStageEvent<
  TStage extends InterviewStartSlo = InterviewStartSlo,
> {
  event: "meelni_interview_start_stage";
  version: 1;
  stage: TStage;
  outcome: InterviewStartStageOutcome;
  durationMs: number;
  sloTargetMs: number;
  sloUpperBoundMs: number;
  latencyClass: InterviewStartLatencyClass;
}

/** Builds a closed, content-free event safe for client analytics or logs. */
export function buildInterviewStartStageEvent<
  TStage extends InterviewStartSlo,
>(input: {
  stage: TStage;
  outcome: InterviewStartStageOutcome;
  durationMs: number;
}): InterviewStartStageEvent<TStage> | null {
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

/** Emits only the closed event fields defined above. */
export function reportInterviewStartStage(input: {
  stage: InterviewStartSlo;
  outcome: InterviewStartStageOutcome;
  durationMs: number;
}): void {
  const event = buildInterviewStartStageEvent(input);
  if (event) console.info(JSON.stringify(event));
}
