import type { CompletedFeedbackView } from "./feedback-view-model";

export const FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION =
  "feedback-quality-signal.v1" as const;
export const FEEDBACK_QUALITY_SIGNAL_RATE_LIMIT = 20 as const;
export const FEEDBACK_QUALITY_SIGNAL_RATE_WINDOW_SECONDS = 60 * 60;
export const FEEDBACK_QUALITY_MINIMUM_DISTINCT_USERS = 10 as const;

export const FEEDBACK_QUALITY_OUTCOMES = [
  "full_scorecard",
  "partial_scorecard",
  "coaching_review",
] as const;
export type FeedbackQualityOutcome = (typeof FEEDBACK_QUALITY_OUTCOMES)[number];

export const FEEDBACK_QUALITY_RESPONSES = ["helpful", "not_helpful"] as const;
export type FeedbackQualityResponse =
  (typeof FEEDBACK_QUALITY_RESPONSES)[number];

export const FEEDBACK_QUALITY_COMMON_REASONS = [
  "not_specific_enough",
  "evidence_did_not_match",
  "next_step_unclear",
  "too_much_to_use",
] as const;
export const FEEDBACK_QUALITY_SCORE_REASONS = [
  "score_explanation_unclear",
] as const;
export const FEEDBACK_QUALITY_COACHING_REASONS = [
  "score_withholding_unclear",
] as const;
export const FEEDBACK_QUALITY_REASONS = [
  ...FEEDBACK_QUALITY_COMMON_REASONS,
  ...FEEDBACK_QUALITY_SCORE_REASONS,
  ...FEEDBACK_QUALITY_COACHING_REASONS,
] as const;
export type FeedbackQualityReason = (typeof FEEDBACK_QUALITY_REASONS)[number];

const OUTCOME_SET = new Set<string>(FEEDBACK_QUALITY_OUTCOMES);
const RESPONSE_SET = new Set<string>(FEEDBACK_QUALITY_RESPONSES);
const REASON_SET = new Set<string>(FEEDBACK_QUALITY_REASONS);
const COMMON_REASON_SET = new Set<string>(FEEDBACK_QUALITY_COMMON_REASONS);
const SCORE_REASON_SET = new Set<string>(FEEDBACK_QUALITY_SCORE_REASONS);
const COACHING_REASON_SET = new Set<string>(FEEDBACK_QUALITY_COACHING_REASONS);

export interface FeedbackQualitySignalCommand {
  contractVersion: typeof FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION;
  response: FeedbackQualityResponse;
  reason: FeedbackQualityReason | null;
  expectedRevision: number | null;
}

export interface FeedbackQualitySignalView {
  contractVersion: typeof FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION;
  outcome: FeedbackQualityOutcome;
  response: FeedbackQualityResponse;
  reason: FeedbackQualityReason | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export function deriveFeedbackQualityOutcome(
  feedback: CompletedFeedbackView
): FeedbackQualityOutcome | null {
  if (feedback.kind === "dimension-coverage") return feedback.mode;
  if (feedback.kind === "evidence-limited") return "coaching_review";
  return null;
}

export function parseFeedbackQualitySignalCommand(
  value: unknown
): FeedbackQualitySignalCommand | null {
  if (
    !hasExactKeys(value, [
      "contractVersion",
      "response",
      "reason",
      "expectedRevision",
    ])
  ) {
    return null;
  }
  if (
    value.contractVersion !== FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION ||
    !isFeedbackQualityResponse(value.response) ||
    !isReasonOrNull(value.reason) ||
    !isRevisionOrNull(value.expectedRevision)
  ) {
    return null;
  }
  return {
    contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
    response: value.response,
    reason: value.reason,
    expectedRevision: value.expectedRevision,
  };
}

export function parseFeedbackQualitySignalView(
  value: unknown
): FeedbackQualitySignalView | null {
  if (
    !hasExactKeys(value, [
      "contractVersion",
      "outcome",
      "response",
      "reason",
      "revision",
      "createdAt",
      "updatedAt",
    ])
  ) {
    return null;
  }
  if (
    value.contractVersion !== FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION ||
    !isFeedbackQualityOutcome(value.outcome) ||
    !isFeedbackQualityResponse(value.response) ||
    !isReasonOrNull(value.reason) ||
    !isRevision(value.revision) ||
    !isCanonicalDate(value.createdAt) ||
    !isCanonicalDate(value.updatedAt) ||
    new Date(value.updatedAt).getTime() < new Date(value.createdAt).getTime() ||
    !isFeedbackQualitySelectionValid(
      value.outcome,
      value.response,
      value.reason
    )
  ) {
    return null;
  }
  return value as unknown as FeedbackQualitySignalView;
}

export function isFeedbackQualitySelectionValid(
  outcome: FeedbackQualityOutcome,
  response: FeedbackQualityResponse,
  reason: FeedbackQualityReason | null
): boolean {
  if (response === "helpful") return reason === null;
  if (reason === null || COMMON_REASON_SET.has(reason)) return true;
  return outcome === "coaching_review"
    ? COACHING_REASON_SET.has(reason)
    : SCORE_REASON_SET.has(reason);
}

export function isFeedbackQualityOutcome(
  value: unknown
): value is FeedbackQualityOutcome {
  return typeof value === "string" && OUTCOME_SET.has(value);
}

export function isFeedbackQualityResponse(
  value: unknown
): value is FeedbackQualityResponse {
  return typeof value === "string" && RESPONSE_SET.has(value);
}

export function isFeedbackQualityReason(
  value: unknown
): value is FeedbackQualityReason {
  return typeof value === "string" && REASON_SET.has(value);
}

export interface FeedbackQualityAggregateInput {
  userKey: string;
  outcome: FeedbackQualityOutcome;
  response: FeedbackQualityResponse;
  reason: FeedbackQualityReason | null;
}

export interface FeedbackQualityAggregateCell {
  response: FeedbackQualityResponse;
  reason: FeedbackQualityReason | "not_provided";
  responseCount: number;
  distinctUsers: number;
}

export interface FeedbackQualityAggregateOutcome {
  outcome: FeedbackQualityOutcome;
  responseCount: number;
  distinctUsers: number;
  cells: FeedbackQualityAggregateCell[];
}

export interface FeedbackQualityAggregate {
  minimumDistinctUsers: number;
  outcomes: FeedbackQualityAggregateOutcome[];
}

/**
 * Produce report-safe current-state cohorts. If one observed cell under an
 * outcome is small, suppress the entire outcome so a published total cannot
 * reveal the complementary cell by subtraction.
 */
export function aggregateFeedbackQualitySignals(
  rows: readonly FeedbackQualityAggregateInput[]
): FeedbackQualityAggregate {
  const minimumDistinctUsers = FEEDBACK_QUALITY_MINIMUM_DISTINCT_USERS;
  const byOutcome = new Map<
    FeedbackQualityOutcome,
    Map<string, { rows: number; users: Set<string> }>
  >();
  for (const row of rows) {
    if (
      !isFeedbackQualityOutcome(row.outcome) ||
      !isFeedbackQualityResponse(row.response) ||
      !isReasonOrNull(row.reason) ||
      !isFeedbackQualitySelectionValid(row.outcome, row.response, row.reason) ||
      typeof row.userKey !== "string" ||
      row.userKey.length < 1 ||
      row.userKey.length > 256
    ) {
      throw new Error("feedback quality aggregate input is invalid");
    }
    const cells = byOutcome.get(row.outcome) ?? new Map();
    byOutcome.set(row.outcome, cells);
    const reason = row.reason ?? "not_provided";
    const key = `${row.response}:${reason}`;
    const cell = cells.get(key) ?? { rows: 0, users: new Set<string>() };
    cell.rows += 1;
    cell.users.add(row.userKey);
    cells.set(key, cell);
  }

  const outcomes: FeedbackQualityAggregateOutcome[] = [];
  for (const outcome of FEEDBACK_QUALITY_OUTCOMES) {
    const source = byOutcome.get(outcome);
    if (!source || source.size === 0) continue;
    if (
      [...source.values()].some(
        (cell) => cell.users.size < minimumDistinctUsers
      )
    ) {
      continue;
    }
    const users = new Set<string>();
    let responseCount = 0;
    const cells = [...source.entries()]
      .map(([key, cell]) => {
        const separator = key.indexOf(":");
        const response = key.slice(0, separator) as FeedbackQualityResponse;
        const reason = key.slice(separator + 1) as
          | FeedbackQualityReason
          | "not_provided";
        responseCount += cell.rows;
        cell.users.forEach((user) => users.add(user));
        return {
          response,
          reason,
          responseCount: cell.rows,
          distinctUsers: cell.users.size,
        };
      })
      .sort((left, right) =>
        `${left.response}:${left.reason}`.localeCompare(
          `${right.response}:${right.reason}`
        )
      );
    outcomes.push({
      outcome,
      responseCount,
      distinctUsers: users.size,
      cells,
    });
  }
  return { minimumDistinctUsers, outcomes };
}

function isReasonOrNull(value: unknown): value is FeedbackQualityReason | null {
  return value === null || isFeedbackQualityReason(value);
}

function isRevisionOrNull(value: unknown): value is number | null {
  return value === null || isRevision(value);
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function isCanonicalDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function hasExactKeys<T extends readonly string[]>(
  value: unknown,
  keys: T
): value is Record<T[number], unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}
