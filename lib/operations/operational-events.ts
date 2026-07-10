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

export type OperationalFailureOperation =
  (typeof OPERATIONAL_FAILURE_OPERATIONS)[number];

export type OperationalFailureSeverity = "warning" | "error" | "critical";

declare const operationalRequestIdBrand: unique symbol;
declare const interviewSessionCorrelationIdBrand: unique symbol;

export type OperationalRequestId = string & {
  readonly [operationalRequestIdBrand]: true;
};
export type InterviewSessionCorrelationId = string & {
  readonly [interviewSessionCorrelationIdBrand]: true;
};

export interface InterviewSessionCorrelationSource {
  readonly kind: "interview_session";
  readonly sessionId: unknown;
}

export interface OperationalFailureInput {
  operation: OperationalFailureOperation;
  errorCode: string;
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
  errorCode: string;
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
const SAFE_CODE_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const RELEASE_PATTERN = /^[0-9a-f]{7,40}$/i;

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
  if (!SAFE_CODE_PATTERN.test(input.errorCode)) {
    throw new Error(
      "Operational error code must be a bounded snake_case value"
    );
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
  source: InterviewSessionCorrelationSource
): InterviewSessionCorrelationId | null {
  return source?.kind === "interview_session" &&
    typeof source.sessionId === "string" &&
    UUID_PATTERN.test(source.sessionId)
    ? (source.sessionId as InterviewSessionCorrelationId)
    : null;
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
