export const INTERVIEW_LIFECYCLE_SLOS = {
  end_acceptance: { targetMs: 1_000, upperBoundMs: 3_000 },
  terminalization: { targetMs: 10_000, upperBoundMs: 30_000 },
  feedback_dispatch: { targetMs: 5_000, upperBoundMs: 30_000 },
  feedback_completion: { targetMs: 45_000, upperBoundMs: 90_000 },
  lifecycle_read: { targetMs: 5_000, upperBoundMs: 8_000 },
} as const;

export type InterviewLifecycleSlo = keyof typeof INTERVIEW_LIFECYCLE_SLOS;
export type InterviewLifecycleLatencyClass =
  | "within_target"
  | "above_target"
  | "above_upper_bound";

export function classifyInterviewLifecycleLatency(
  slo: InterviewLifecycleSlo,
  durationMs: number
): InterviewLifecycleLatencyClass | null {
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  const threshold = INTERVIEW_LIFECYCLE_SLOS[slo];
  if (durationMs >= threshold.upperBoundMs) return "above_upper_bound";
  if (durationMs >= threshold.targetMs) return "above_target";
  return "within_target";
}

export function elapsedInterviewLifecycleMs(
  startedAt: Date | string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!startedAt || !Number.isFinite(now.getTime())) return null;
  const startedMs =
    startedAt instanceof Date ? startedAt.getTime() : Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return null;
  return Math.max(0, now.getTime() - startedMs);
}
