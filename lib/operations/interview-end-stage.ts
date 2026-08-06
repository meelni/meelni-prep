export const INTERVIEW_END_STAGES = [
  "accept",
  "runtime_settlement",
  "finalize",
  "feedback_dispatch",
  "feedback_generation",
  "cleanup_schedule",
  "credit_settlement",
] as const;

export type InterviewEndStage = (typeof INTERVIEW_END_STAGES)[number];
export type InterviewEndStageOutcome =
  | "succeeded"
  | "deferred"
  | "skipped"
  | "failed";

export interface InterviewEndStageEvent {
  event: "meelni_interview_end_stage";
  version: 1;
  occurredAt: string;
  stage: InterviewEndStage;
  outcome: InterviewEndStageOutcome;
  durationMs: number;
  correlationId: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGES = new Set<string>(INTERVIEW_END_STAGES);
const OUTCOMES = new Set<string>([
  "succeeded",
  "deferred",
  "skipped",
  "failed",
]);

/** Emits aggregateable latency without accepting transcript, provider, or user data. */
export function reportInterviewEndStage(
  input: {
    stage: InterviewEndStage;
    outcome: InterviewEndStageOutcome;
    durationMs: number;
    sessionId?: unknown;
  },
  write: (serialized: string) => void = console.info
): InterviewEndStageEvent | null {
  if (
    !STAGES.has(input.stage) ||
    !OUTCOMES.has(input.outcome) ||
    !Number.isFinite(input.durationMs) ||
    input.durationMs < 0
  ) {
    return null;
  }
  const event: InterviewEndStageEvent = {
    event: "meelni_interview_end_stage",
    version: 1,
    occurredAt: new Date().toISOString(),
    stage: input.stage,
    outcome: input.outcome,
    durationMs: Math.round(input.durationMs),
    correlationId:
      typeof input.sessionId === "string" && UUID_PATTERN.test(input.sessionId)
        ? input.sessionId
        : null,
  };
  try {
    write(JSON.stringify(event));
  } catch {
    return null;
  }
  return event;
}
