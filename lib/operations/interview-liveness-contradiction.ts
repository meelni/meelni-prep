export const INTERVIEW_LIVENESS_CONTRADICTION_VERSION = 1 as const;

export type InterviewLivenessContradictionResolution =
  | "pending"
  | "canonical_ready"
  | "transport_interrupted"
  | "terminal"
  | "unmounted";

export type InterviewLivenessContradictionDurationClass =
  | "pending"
  | "under_5s"
  | "under_30s"
  | "under_2m"
  | "at_least_2m";

export function buildInterviewLivenessContradictionEvent(input: {
  phase: "observed" | "resolved";
  durationMs: number;
  resolution: InterviewLivenessContradictionResolution;
}) {
  return {
    version: INTERVIEW_LIVENESS_CONTRADICTION_VERSION,
    phase: input.phase,
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    duration_class:
      input.phase === "observed"
        ? ("pending" as const)
        : classifyContradictionDuration(input.durationMs),
    resolution: input.resolution,
  };
}

function classifyContradictionDuration(
  durationMs: number
): Exclude<InterviewLivenessContradictionDurationClass, "pending"> {
  if (durationMs < 5_000) return "under_5s";
  if (durationMs < 30_000) return "under_30s";
  if (durationMs < 120_000) return "under_2m";
  return "at_least_2m";
}
