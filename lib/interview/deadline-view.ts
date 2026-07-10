import { getInterviewDeadlineRemainingMs } from "@meelni/core";

export function getRemainingSeconds(
  deadlineAt: Date | null,
  now: Date
): number | null {
  if (!deadlineAt) return null;
  return Math.ceil(getInterviewDeadlineRemainingMs({ deadlineAt, now }) / 1000);
}

export function formatInterviewTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}
