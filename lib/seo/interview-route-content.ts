import {
  ALL_INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  ROUND_TYPES,
  type RoundType,
} from "@meelni/core";

export const INTERVIEW_TYPE_ROUTE_SEGMENTS = [
  ...ALL_INTERVIEW_TYPES,
] as readonly RoundType[];

export function assertInterviewTypeRoute(
  value: string
): value is RoundType {
  return (INTERVIEW_TYPE_ROUTE_SEGMENTS as readonly string[]).includes(value);
}

export function interviewTypeLabel(roundType: RoundType): string {
  return INTERVIEW_TYPE_LABELS[roundType];
}

export function interviewTypePath(roundType: RoundType): string {
  return `/interview-types/${roundType}`;
}

export function questionPath(questionId: string): string {
  return `/questions/${encodeURIComponent(questionId)}`;
}

export function interviewTypeDescription(roundType: RoundType): string {
  const config = ROUND_TYPES[roundType];
  return `${config.label} PM interview practice questions for ${config.description.toLowerCase()}.`;
}

export function interviewTypePracticeDescription(roundType: RoundType): string {
  const config = ROUND_TYPES[roundType];
  return `Choose a ${config.label} PM interview question, answer it out loud, and review evidence-grounded feedback after a completed mock interview.`;
}
