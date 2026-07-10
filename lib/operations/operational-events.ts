export const OPERATIONAL_FAILURE_OPERATIONS = [
  "auth_callback",
  "interview_token",
  "interview_start",
  "interview_end",
  "feedback_queue",
  "stripe_webhook",
  "question_sync",
  "account_deletion",
] as const;

export const OPERATIONAL_FAILURE_ERROR_CODES = [
  "account_deletion_failed",
  "auth_code_exchange_failed",
  "auth_user_upsert_failed",
  "completion_achievements_update_failed",
  "completion_streak_update_failed",
  "feedback_dispatch_exhausted",
  "feedback_generation_failed",
  "feedback_read_failed",
  "feedback_retry_failed",
  "interview_end_failed",
  "interview_start_failed",
  "interview_start_rejected",
  "livekit_agent_config_missing",
  "livekit_config_missing",
  "livekit_reconnect_rate_limit_unavailable",
  "livekit_token_issue_failed",
  "livekit_token_unavailable",
  "question_sync_failed",
  "question_sync_unavailable",
  "stripe_signature_invalid",
  "stripe_webhook_failed",
] as const;

export type OperationalFailureOperation =
  (typeof OPERATIONAL_FAILURE_OPERATIONS)[number];
export type OperationalFailureErrorCode =
  (typeof OPERATIONAL_FAILURE_ERROR_CODES)[number];

export type OperationalFailureSeverity = "warning" | "error" | "critical";

declare const operationalRequestIdBrand: unique symbol;
declare const interviewSessionCorrelationIdBrand: unique symbol;

export type OperationalRequestId = string & {
  readonly [operationalRequestIdBrand]: true;
};
export type InterviewSessionCorrelationId = string & {
  readonly [interviewSessionCorrelationIdBrand]: true;
};

export interface OwnedInterviewSessionCorrelationSource {
  readonly kind: "owned_interview_session";
  readonly session: {
    readonly id: unknown;
    readonly userId: unknown;
  };
  readonly authenticatedUserId: unknown;
}

export interface OperationalFailureInput {
  operation: OperationalFailureOperation;
  errorCode: OperationalFailureErrorCode;
  severity?: OperationalFailureSeverity;
  retryable: boolean;
  requestId?: OperationalRequestId | null;
  correlationId?: InterviewSessionCorrelationId | null;
}

export interface OperationalFailureEvent {
  event: "meelni_operational_failure";
  version: 1;
  occurredAt: string;
  environment:
    | "local"
    | "development"
    | "preview"
    | "production"
    | "test"
    | "unknown";
  release: string | null;
  operation: OperationalFailureOperation;
  errorCode: OperationalFailureErrorCode;
  severity: OperationalFailureSeverity;
  retryable: boolean;
  requestId: string | null;
  correlationId: string | null;
}

interface OperationalEventDependencies {
  now(): Date;
  env: Readonly<Record<string, string | undefined>>;
  write(serialized: string): void;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const RELEASE_PATTERN = /^[0-9a-f]{7,40}$/i;
const OPERATIONAL_FAILURE_ERROR_CODE_SET = new Set<string>(
  OPERATIONAL_FAILURE_ERROR_CODES
);

const defaultDependencies: OperationalEventDependencies = {
  now: () => new Date(),
  env: process.env,
  write: (serialized) => console.error(serialized),
};

/**
 * Emits an alertable runtime-log event whose schema cannot accept arbitrary
 * exception messages, stack traces, payloads, user identifiers, or content.
 */
export function reportOperationalFailure(
  input: OperationalFailureInput,
  dependencies: OperationalEventDependencies = defaultDependencies
): OperationalFailureEvent {
  if (!isOperationalFailureErrorCode(input.errorCode)) {
    throw new Error("Operational error code is not in the versioned contract");
  }

  const event: OperationalFailureEvent = {
    event: "meelni_operational_failure",
    version: 1,
    occurredAt: dependencies.now().toISOString(),
    environment: readEnvironment(dependencies.env),
    release: readRelease(dependencies.env),
    operation: input.operation,
    errorCode: input.errorCode,
    severity: input.severity ?? "error",
    retryable: input.retryable,
    requestId: sanitizeRequestId(input.requestId),
    correlationId: sanitizeCorrelationId(input.correlationId),
  };

  dependencies.write(JSON.stringify(event));
  return event;
}

export function readOperationalRequestId(
  request: Request
): OperationalRequestId | null {
  return sanitizeRequestId(request.headers.get("x-vercel-id"));
}

export function readInterviewSessionCorrelationId(
  source: OwnedInterviewSessionCorrelationSource
): InterviewSessionCorrelationId | null {
  const sessionId = source?.session?.id;
  const ownerUserId = source?.session?.userId;
  const authenticatedUserId = source?.authenticatedUserId;
  return source?.kind === "owned_interview_session" &&
    typeof sessionId === "string" &&
    typeof ownerUserId === "string" &&
    typeof authenticatedUserId === "string" &&
    UUID_PATTERN.test(sessionId) &&
    UUID_PATTERN.test(ownerUserId) &&
    UUID_PATTERN.test(authenticatedUserId) &&
    ownerUserId === authenticatedUserId &&
    sessionId !== ownerUserId
    ? (sessionId as InterviewSessionCorrelationId)
    : null;
}

export function isOperationalFailureErrorCode(
  value: unknown
): value is OperationalFailureErrorCode {
  return (
    typeof value === "string" && OPERATIONAL_FAILURE_ERROR_CODE_SET.has(value)
  );
}

function readEnvironment(
  env: Readonly<Record<string, string | undefined>>
): OperationalFailureEvent["environment"] {
  const value = env.VERCEL_ENV ?? env.MEELNI_ENV ?? env.NODE_ENV;
  switch (value) {
    case "local":
    case "development":
    case "preview":
    case "production":
    case "test":
      return value;
    default:
      return "unknown";
  }
}

function readRelease(
  env: Readonly<Record<string, string | undefined>>
): string | null {
  const value = env.VERCEL_GIT_COMMIT_SHA ?? env.GIT_COMMIT_SHA;
  return value && RELEASE_PATTERN.test(value) ? value.slice(0, 12) : null;
}

function sanitizeRequestId(
  value: string | null | undefined
): OperationalRequestId | null {
  return value && SAFE_REQUEST_ID_PATTERN.test(value)
    ? (value as OperationalRequestId)
    : null;
}

function sanitizeCorrelationId(
  value: InterviewSessionCorrelationId | null | undefined
): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}
