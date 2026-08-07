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

export const INTERVIEW_END_STAGE_REASONS = [
  "accepted",
  "runtime_settled",
  "runtime_timeout",
  "runtime_unavailable",
  "runtime_not_ready",
  "runtime_failed",
  "transcript_evidence_degraded",
  "transcript_evidence_missing",
  "finalized",
  "already_complete",
  "terminal_repaired",
  "feedback_queued",
  "feedback_in_progress",
  "feedback_not_required",
  "feedback_dispatch_failed",
  "cleanup_scheduled",
  "cleanup_not_required",
  "credit_settled",
  "session_not_found",
  "stage_exception",
] as const;

export type InterviewEndStageReason =
  (typeof INTERVIEW_END_STAGE_REASONS)[number];

export interface InterviewEndStageEvent {
  event: "meelni_interview_end_stage";
  version: 2;
  occurredAt: string;
  stage: InterviewEndStage;
  outcome: InterviewEndStageOutcome;
  durationMs: number;
  reason: InterviewEndStageReason | null;
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
const REASONS = new Set<string>(INTERVIEW_END_STAGE_REASONS);

/** Emits aggregateable latency without accepting transcript, provider, or user data. */
export function reportInterviewEndStage(
  input: {
    stage: InterviewEndStage;
    outcome: InterviewEndStageOutcome;
    durationMs: number;
    reason?: InterviewEndStageReason;
    sessionId?: unknown;
  },
  write: (serialized: string) => void = console.info
): InterviewEndStageEvent | null {
  if (
    !STAGES.has(input.stage) ||
    !OUTCOMES.has(input.outcome) ||
    (input.reason !== undefined && !REASONS.has(input.reason)) ||
    !Number.isFinite(input.durationMs) ||
    input.durationMs < 0
  ) {
    return null;
  }
  const event: InterviewEndStageEvent = {
    event: "meelni_interview_end_stage",
    version: 2,
    occurredAt: new Date().toISOString(),
    stage: input.stage,
    outcome: input.outcome,
    durationMs: Math.round(input.durationMs),
    reason: input.reason ?? null,
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
