export const OPERATIONAL_FAILURE_OPERATIONS = [
  "auth_callback",
  "interview_token",
  "interview_start",
  "interview_end",
  "feedback_dispatch",
  "stripe_webhook",
  "question_sync",
  "account_deletion",
  "interview_recovery",
  "billing_read",
  "billing_portal",
  "checkout_confirmation",
  "service_health",
] as const;

export const OPERATIONAL_FAILURE_ERROR_CODES = [
  "account_deletion_failed",
  "account_deletion_auth_check_failed",
  "account_deletion_request_failed",
  "account_deletion_recovery_failed",
  "account_deletion_retry_state_failed",
  "account_deletion_sign_out_failed",
  "auth_code_exchange_failed",
  "auth_user_upsert_failed",
  "billing_credit_read_failed",
  "billing_payment_history_read_failed",
  "billing_portal_customer_lookup_failed",
  "billing_portal_session_failed",
  "billing_portal_subscription_read_failed",
  "billing_subscription_read_failed",
  "billing_usage_read_failed",
  "checkout_confirmation_auth_failed",
  "checkout_confirmation_settlement_read_failed",
  "feedback_dispatch_failed",
  "feedback_generation_failed",
  "feedback_integrity_invalid",
  "feedback_read_failed",
  "feedback_retry_failed",
  "interview_deadline_enforcement_failed",
  "interview_credit_recovery_failed",
  "interview_end_failed",
  "interview_presence_reconciliation_failed",
  "interview_reconnect_enforcement_failed",
  "interview_room_cleanup_deferred",
  "interview_room_cleanup_failed",
  "interview_start_recovery_failed",
  "interview_start_failed",
  "livekit_agent_config_missing",
  "livekit_config_missing",
  "livekit_reconnect_rate_limit_unavailable",
  "livekit_token_issue_failed",
  "livekit_token_unavailable",
  "operational_reporter_failed",
  "question_sync_failed",
  "question_sync_unavailable",
  "service_health_database_query_failed",
  "service_health_database_timeout",
  "stripe_owner_metadata_missing",
  "stripe_signature_invalid",
  "stripe_webhook_failed",
] as const;

export type OperationalFailureOperation =
  (typeof OPERATIONAL_FAILURE_OPERATIONS)[number];
export type OperationalFailureErrorCode =
  (typeof OPERATIONAL_FAILURE_ERROR_CODES)[number];
export type OperationalFailureSeverity = "warning" | "error" | "critical";

declare const interviewSessionCorrelationIdBrand: unique symbol;

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
  requestId: null;
  correlationId: string | null;
}

interface OperationalEventDependencies {
  now(): Date;
  env: Readonly<Record<string, string | undefined>>;
  write(serialized: string): void;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELEASE_PATTERN = /^[0-9a-f]{7,40}$/i;
const OPERATION_SET = new Set<string>(OPERATIONAL_FAILURE_OPERATIONS);
const ERROR_CODE_SET = new Set<string>(OPERATIONAL_FAILURE_ERROR_CODES);
const SEVERITY_SET = new Set<string>(["warning", "error", "critical"]);

const defaultDependencies: OperationalEventDependencies = {
  now: () => new Date(),
  env: process.env,
  write: (serialized) => console.error(serialized),
};

const REPORTER_FALLBACK: OperationalFailureEvent = {
  event: "meelni_operational_failure",
  version: 1,
  occurredAt: "1970-01-01T00:00:00.000Z",
  environment: "unknown",
  release: null,
  operation: "interview_start",
  errorCode: "operational_reporter_failed",
  severity: "error",
  retryable: false,
  requestId: null,
  correlationId: null,
};

/**
 * Emit one alertable server event whose interface cannot accept exception text,
 * stacks, provider payloads, user identifiers, transcripts, email, or tokens.
 */
export function reportOperationalFailure(
  input: OperationalFailureInput,
  dependencies: OperationalEventDependencies = defaultDependencies
): OperationalFailureEvent {
  try {
    const severity = input.severity ?? "error";
    if (
      !isOperation(input.operation) ||
      !isErrorCode(input.errorCode) ||
      !isSeverity(severity) ||
      typeof input.retryable !== "boolean"
    ) {
      return REPORTER_FALLBACK;
    }

    const event: OperationalFailureEvent = {
      ...REPORTER_FALLBACK,
      occurredAt: dependencies.now().toISOString(),
      environment: readEnvironment(dependencies.env),
      release: readRelease(dependencies.env),
      operation: input.operation,
      errorCode: input.errorCode,
      severity,
      retryable: input.retryable,
      correlationId: sanitizeCorrelationId(input.correlationId),
    };

    try {
      dependencies.write(JSON.stringify(event));
    } catch {
      return REPORTER_FALLBACK;
    }
    return event;
  } catch {
    return REPORTER_FALLBACK;
  }
}

export function readOwnedInterviewSessionCorrelationId(
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

function isOperation(value: unknown): value is OperationalFailureOperation {
  return typeof value === "string" && OPERATION_SET.has(value);
}

function isErrorCode(value: unknown): value is OperationalFailureErrorCode {
  return typeof value === "string" && ERROR_CODE_SET.has(value);
}

function isSeverity(value: unknown): value is OperationalFailureSeverity {
  return typeof value === "string" && SEVERITY_SET.has(value);
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

function sanitizeCorrelationId(
  value: InterviewSessionCorrelationId | null | undefined
): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}
