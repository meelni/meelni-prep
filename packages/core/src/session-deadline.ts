export const INTERVIEW_DURATION_MINUTES = [15, 30, 45] as const;

export type InterviewDurationMinutes =
  (typeof INTERVIEW_DURATION_MINUTES)[number];

export const DEFAULT_INTERVIEW_DURATION_MINUTES: InterviewDurationMinutes = 30;

export interface DeriveInterviewDeadlineAtInput {
  startedAt: Date;
  durationMinutes: unknown;
}

export interface InterviewDeadlineClockInput {
  deadlineAt: Date;
  now: Date;
}

const CANONICAL_UTC_ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isInterviewDurationMinutes(
  value: unknown
): value is InterviewDurationMinutes {
  return INTERVIEW_DURATION_MINUTES.some((duration) => duration === value);
}

export function normalizeInterviewDurationMinutes(
  value: unknown
): InterviewDurationMinutes {
  return isInterviewDurationMinutes(value)
    ? value
    : DEFAULT_INTERVIEW_DURATION_MINUTES;
}

export function deriveInterviewDeadlineAt({
  startedAt,
  durationMinutes,
}: DeriveInterviewDeadlineAtInput): Date {
  assertValidDate(startedAt, "startedAt");
  const duration = normalizeInterviewDurationMinutes(durationMinutes);
  return new Date(startedAt.getTime() + duration * 60 * 1000);
}

export function parseInterviewDeadlineAt(value: unknown): Date | null {
  if (typeof value !== "string" || !CANONICAL_UTC_ISO_PATTERN.test(value)) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    return null;
  }

  return parsed;
}

export function serializeInterviewDeadlineAt(deadlineAt: Date): string {
  assertValidDate(deadlineAt, "deadlineAt");
  return deadlineAt.toISOString();
}

export function isInterviewDeadlineReached({
  deadlineAt,
  now,
}: InterviewDeadlineClockInput): boolean {
  assertValidDate(deadlineAt, "deadlineAt");
  assertValidDate(now, "now");
  return now.getTime() >= deadlineAt.getTime();
}

export function getInterviewDeadlineRemainingMs({
  deadlineAt,
  now,
}: InterviewDeadlineClockInput): number {
  assertValidDate(deadlineAt, "deadlineAt");
  assertValidDate(now, "now");
  return Math.max(0, deadlineAt.getTime() - now.getTime());
}

function assertValidDate(value: Date, name: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new RangeError(`${name} must be a valid Date`);
  }
}
