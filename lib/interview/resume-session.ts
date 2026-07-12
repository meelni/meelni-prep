import { parseInterviewDeadlineAt } from "@/lib/internal/core";

export function requireInterviewResumeTiming(input: {
  startedAt: unknown;
  deadlineAt: unknown;
}): { startedAt: string; deadlineAt: string } {
  if (
    typeof input.startedAt !== "string" ||
    !Number.isFinite(new Date(input.startedAt).getTime())
  ) {
    throw new Error("Interview session start time is unavailable.");
  }
  if (
    typeof input.deadlineAt !== "string" ||
    !parseInterviewDeadlineAt(input.deadlineAt)
  ) {
    throw new Error("Interview session deadline is unavailable.");
  }

  return { startedAt: input.startedAt, deadlineAt: input.deadlineAt };
}
