export const INTERVIEW_LIFECYCLE_STATES = [
  "created",
  "connecting",
  "active",
  "reconnecting",
  "ending",
  "completed",
  "abandoned",
  "failed",
] as const;

export type InterviewLifecycleState =
  (typeof INTERVIEW_LIFECYCLE_STATES)[number];

export const INTERVIEW_TERMINAL_STATES = [
  "completed",
  "abandoned",
  "failed",
] as const;

export type InterviewTerminalState = (typeof INTERVIEW_TERMINAL_STATES)[number];

export const INTERVIEW_TERMINAL_REASONS = [
  "user_end",
  "time_limit",
  "disconnect_timeout",
  "provider_failure",
  "insufficient_signal",
  "legacy_unknown",
] as const;

export type InterviewTerminalReason =
  (typeof INTERVIEW_TERMINAL_REASONS)[number];

export type NewInterviewTerminalReason = Exclude<
  InterviewTerminalReason,
  "legacy_unknown"
>;

export type LegacyInterviewSessionStatus =
  | "in_progress"
  | "completed"
  | "abandoned"
  | "too_short"
  | "error";

export interface InterviewTerminalOutcome {
  state: InterviewTerminalState;
  reason: InterviewTerminalReason;
}

export type InterviewLifecycleTransitionErrorCode =
  | "invalid_transition"
  | "terminal_reason_required"
  | "terminal_reason_not_allowed"
  | "terminal_outcome_mismatch";

export type InterviewLifecycleTransitionValidation =
  | { ok: true }
  | { ok: false; code: InterviewLifecycleTransitionErrorCode };

export interface ValidateInterviewLifecycleTransitionInput {
  from: InterviewLifecycleState;
  to: InterviewLifecycleState;
  terminalReason?: InterviewTerminalReason | null;
  activated?: boolean;
}

export interface DeriveInterviewTerminalStateInput {
  reason: InterviewTerminalReason;
  activated: boolean;
}

export interface ProjectLegacyInterviewSessionStatusInput {
  state: InterviewLifecycleState;
  terminalReason?: InterviewTerminalReason | null;
}

export interface ReadInterviewCompletionInput {
  state: InterviewLifecycleState;
  legacyStatus: LegacyInterviewSessionStatus;
}

export interface ResolveInterviewTerminalOutcomeRequest {
  reason: NewInterviewTerminalReason;
  activated: boolean;
}

export type InterviewTerminalResolutionDisposition =
  | "accepted"
  | "idempotent"
  | "conflict";

export interface InterviewTerminalResolution {
  disposition: InterviewTerminalResolutionDisposition;
  outcome: InterviewTerminalOutcome;
  requested: InterviewTerminalOutcome;
}

const ALLOWED_TRANSITIONS = {
  created: ["connecting", "ending"],
  connecting: ["active", "ending"],
  active: ["reconnecting", "ending"],
  reconnecting: ["active", "ending"],
  ending: ["completed", "abandoned", "failed"],
  completed: [],
  abandoned: [],
  failed: [],
} as const satisfies Record<
  InterviewLifecycleState,
  readonly InterviewLifecycleState[]
>;

const TERMINAL_STATE_SET = new Set<InterviewLifecycleState>(
  INTERVIEW_TERMINAL_STATES
);

export function isInterviewTerminalState(
  state: InterviewLifecycleState
): state is InterviewTerminalState {
  return TERMINAL_STATE_SET.has(state);
}

export function canTransitionInterviewLifecycle(
  from: InterviewLifecycleState,
  to: InterviewLifecycleState
): boolean {
  return ALLOWED_TRANSITIONS[from].some((candidate) => candidate === to);
}

export function validateInterviewLifecycleTransition({
  from,
  to,
  terminalReason = null,
  activated = false,
}: ValidateInterviewLifecycleTransitionInput): InterviewLifecycleTransitionValidation {
  if (!canTransitionInterviewLifecycle(from, to)) {
    return { ok: false, code: "invalid_transition" };
  }

  const claimsTerminalReason = to === "ending" || isInterviewTerminalState(to);

  if (claimsTerminalReason && terminalReason === null) {
    return { ok: false, code: "terminal_reason_required" };
  }

  if (!claimsTerminalReason && terminalReason !== null) {
    return { ok: false, code: "terminal_reason_not_allowed" };
  }

  if (terminalReason === "legacy_unknown") {
    return { ok: false, code: "terminal_reason_not_allowed" };
  }

  if (
    isInterviewTerminalState(to) &&
    terminalReason !== null &&
    deriveInterviewTerminalState({ reason: terminalReason, activated }) !== to
  ) {
    return { ok: false, code: "terminal_outcome_mismatch" };
  }

  return { ok: true };
}

export function deriveInterviewTerminalState({
  reason,
  activated,
}: DeriveInterviewTerminalStateInput): InterviewTerminalState {
  if (reason === "provider_failure") {
    return "failed";
  }

  if (reason === "insufficient_signal") {
    return "abandoned";
  }

  return activated ? "completed" : "abandoned";
}

export function projectLegacyInterviewSessionStatus({
  state,
  terminalReason = null,
}: ProjectLegacyInterviewSessionStatusInput): LegacyInterviewSessionStatus {
  if (state === "completed") {
    return "completed";
  }

  if (state === "abandoned") {
    return terminalReason === "insufficient_signal" ? "too_short" : "abandoned";
  }

  if (state === "failed") {
    return "error";
  }

  return "in_progress";
}

export function isInterviewSessionCompletedForRead({
  state,
  legacyStatus,
}: ReadInterviewCompletionInput): boolean {
  if (state === "completed") return true;
  if (isInterviewTerminalState(state)) return false;

  return legacyStatus === "completed";
}

export function resolveInterviewTerminalOutcome(
  current: InterviewTerminalOutcome | null,
  request: ResolveInterviewTerminalOutcomeRequest
): InterviewTerminalResolution {
  const requested: InterviewTerminalOutcome = {
    state: deriveInterviewTerminalState(request),
    reason: request.reason,
  };

  if (current === null) {
    return { disposition: "accepted", outcome: requested, requested };
  }

  if (
    current.state === requested.state &&
    current.reason === requested.reason
  ) {
    return { disposition: "idempotent", outcome: current, requested };
  }

  return { disposition: "conflict", outcome: current, requested };
}
