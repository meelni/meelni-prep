import {
  ALL_INTERVIEW_TYPES,
  DIFFICULTY_LEVELS,
  type DifficultyLevel,
  type RoundType,
} from "@meelni/core";
import { getSafeInternalRedirect } from "@/lib/auth/safe-redirect";

export const NEW_INTERVIEW_PATH = "/dashboard/new-interview";

export interface InterviewLaunchContext {
  questionId: string | null;
  roundType: RoundType | null;
  difficulty: DifficultyLevel | null;
  focus: string | null;
  company: string | null;
  returnTo: string | null;
}

type SearchParamsReader = Pick<URLSearchParams, "get">;

export type InterviewLaunchPageSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function parseInterviewLaunchContext(
  searchParams: SearchParamsReader
): InterviewLaunchContext {
  const roundType =
    parseRoundType(searchParams.get("interview_type")) ??
    parseRoundType(searchParams.get("roundType"));

  return {
    questionId: cleanValue(searchParams.get("questionId")),
    roundType,
    difficulty: parseDifficulty(searchParams.get("difficulty")),
    focus: cleanValue(searchParams.get("focus")),
    company: cleanValue(searchParams.get("company")),
    returnTo: parseInternalReturnTo(searchParams.get("returnTo")),
  };
}

export function buildNewInterviewHref(
  searchParams?: URLSearchParams | string | null
): string {
  const query =
    typeof searchParams === "string"
      ? searchParams.replace(/^\?/, "")
      : (searchParams?.toString() ?? "");

  return `${NEW_INTERVIEW_PATH}${query ? `?${query}` : ""}`;
}

export function buildNewInterviewHrefFromPageSearchParams(
  searchParams: InterviewLaunchPageSearchParams
): string {
  const preserved = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) preserved.append(key, entry);
    } else if (value !== undefined) {
      preserved.append(key, value);
    }
  }

  return buildNewInterviewHref(preserved);
}

export function buildQuestionInterviewHref(
  questionId: string,
  returnTo?: string | null
): string {
  const searchParams = new URLSearchParams({ questionId });
  const safeReturnTo = getSafeInternalRedirect(returnTo, null);
  if (safeReturnTo) {
    searchParams.set("returnTo", safeReturnTo);
  }
  return buildNewInterviewHref(searchParams);
}

export function buildInterviewHrefWithoutQuestion(
  searchParams: URLSearchParams | string
): string {
  const preserved = new URLSearchParams(
    typeof searchParams === "string" ? searchParams : searchParams.toString()
  );
  preserved.delete("questionId");
  return buildNewInterviewHref(preserved);
}

function cleanValue(value: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function parseRoundType(value: string | null): RoundType | null {
  return ALL_INTERVIEW_TYPES.includes(value as RoundType)
    ? (value as RoundType)
    : null;
}

function parseDifficulty(value: string | null): DifficultyLevel | null {
  return value && value in DIFFICULTY_LEVELS
    ? (value as DifficultyLevel)
    : null;
}

function parseInternalReturnTo(value: string | null): string | null {
  return getSafeInternalRedirect(value, null);
}
