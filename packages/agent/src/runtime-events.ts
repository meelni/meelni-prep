import {
  isSafeInterviewBillingFaultCode,
  type InterviewTerminalReason,
} from "@meelni/core";

export const INTERVIEW_RUNTIME_EVENT_CONTRACT_VERSION = 1 as const;
export const INTERVIEW_RUNTIME_EVENT_TOPIC = "interview.lifecycle.v1";

export const INTERVIEW_RUNTIME_EVENT_TYPES = [
  "runtime_provisioned",
  "runtime_activated",
  "connection_lost",
  "connection_restored",
  "provider_failed",
] as const;

export type InterviewRuntimeEventType =
  (typeof INTERVIEW_RUNTIME_EVENT_TYPES)[number];

export interface InterviewRuntimeReference {
  provider: string;
  id: string;
}

export interface InterviewRuntimeEvent {
  contract_version: typeof INTERVIEW_RUNTIME_EVENT_CONTRACT_VERSION;
  event_id: string;
  session_id: string;
  type: InterviewRuntimeEventType;
  occurred_at: string;
  runtime_ref?: InterviewRuntimeReference;
  failure?: {
    reason: Extract<InterviewTerminalReason, "provider_failure">;
    code: string;
    retryable: boolean;
  };
}

export type CreateInterviewRuntimeEventInput = Omit<
  InterviewRuntimeEvent,
  "contract_version"
>;

export function createInterviewRuntimeEvent(
  input: CreateInterviewRuntimeEventInput
): InterviewRuntimeEvent {
  const event: InterviewRuntimeEvent = {
    contract_version: INTERVIEW_RUNTIME_EVENT_CONTRACT_VERSION,
    ...input,
  };

  if (!isInterviewRuntimeEvent(event)) {
    throw new Error("Invalid interview runtime lifecycle event");
  }

  return event;
}

export function isInterviewRuntimeEvent(
  value: unknown
): value is InterviewRuntimeEvent {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(value, [
      "contract_version",
      "event_id",
      "session_id",
      "type",
      "occurred_at",
      "runtime_ref",
      "failure",
    ])
  ) {
    return false;
  }

  if (
    value.contract_version !== INTERVIEW_RUNTIME_EVENT_CONTRACT_VERSION ||
    !isNonEmptyString(value.event_id) ||
    !isNonEmptyString(value.session_id) ||
    !isInterviewRuntimeEventType(value.type) ||
    !isIsoDate(value.occurred_at)
  ) {
    return false;
  }

  if (
    value.runtime_ref !== undefined &&
    (!isRecord(value.runtime_ref) ||
      !hasOnlyKeys(value.runtime_ref, ["provider", "id"]) ||
      !isNonEmptyString(value.runtime_ref.provider) ||
      !isNonEmptyString(value.runtime_ref.id))
  ) {
    return false;
  }

  if (value.type === "provider_failed") {
    return (
      isRecord(value.failure) &&
      hasOnlyKeys(value.failure, ["reason", "code", "retryable"]) &&
      value.failure.reason === "provider_failure" &&
      isSafeInterviewBillingFaultCode(value.failure.code) &&
      typeof value.failure.retryable === "boolean"
    );
  }

  return value.failure === undefined;
}

export function parseInterviewRuntimeEvent(
  rawEvent: string
): InterviewRuntimeEvent | null {
  try {
    const parsed: unknown = JSON.parse(rawEvent);
    return isInterviewRuntimeEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isInterviewRuntimeEventType(
  value: unknown
): value is InterviewRuntimeEventType {
  return INTERVIEW_RUNTIME_EVENT_TYPES.some((type) => type === value);
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}
