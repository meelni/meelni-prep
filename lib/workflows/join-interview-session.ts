import {
  issueInterviewParticipantToken,
  type LiveKitEnvironment,
} from "@/lib/internal/integrations";
import { getSessionForLiveKitJoin } from "@/lib/db/sessions";
import { consumeReconnectRateLimit } from "@/lib/db/rate-limits";
import {
  deriveInterviewDeadlineAt,
  isInterviewDeadlineReached,
  normalizeInterviewDurationMinutes,
  type InterviewLifecycleState,
} from "@/lib/internal/core";
import {
  readOwnedInterviewSessionCorrelationId,
  reportOperationalFailure,
  type InterviewSessionCorrelationId,
} from "@/lib/operations/operational-events";

const PARTICIPANT_TOKEN_TTL_SECONDS = 5 * 60;

export interface JoinInterviewUser {
  id: string;
}

export interface JoinableInterviewSession {
  id: string;
  userId: string;
  mode: string;
  livekitRoomName: string | null;
  config: unknown;
  startedAt: Date | null;
  endedAt: Date | null;
  startContractVersion?: number;
  provisioningState?: string;
  provisionedAt?: Date | null;
  status: string;
  lifecycleState: InterviewLifecycleState;
  lifecycleVersion: number;
  reconnectDeadlineAt?: Date | null;
  reconnectDeadlineOwner?: "reconnect_grace" | "hard_deadline" | null;
  databaseNow: Date;
}

export interface JoinInterviewSessionInput {
  user: JoinInterviewUser;
  sessionId: unknown;
  env: LiveKitEnvironment;
}

export interface JoinInterviewSessionDeps {
  audit(event: {
    outcome: "allowed" | "denied" | "failed";
    reason:
      | "invalid_session_id"
      | "livekit_token_expiry_invalid_after_authorization"
      | "livekit_token_unavailable"
      | "reconnect_authorization_changed"
      | "reconnect_rate_limit_unavailable"
      | "reconnect_token_issued"
      | "reconnect_token_rate_limited"
      | "session_not_found"
      | "session_not_joinable";
    diagnostic?:
      | "missing_migration"
      | "permission"
      | "timeout"
      | "malformed_result"
      | "unknown";
    correlationId?: InterviewSessionCorrelationId | null;
  }): void;
  consumeRateLimit(userId: string): Promise<{
    allowed: boolean;
    retryAfterSeconds: number;
  }>;
  getSession(sessionId: string): Promise<JoinableInterviewSession | undefined>;
  issueToken(input: {
    identity: string;
    participantName: string;
    roomName: string;
    ttlSeconds: number;
    observedAt: Date;
    expiresAt: Date;
    env: LiveKitEnvironment;
  }): ReturnType<typeof issueInterviewParticipantToken>;
}

export type JoinInterviewSessionResult =
  | {
      ok: true;
      body: {
        token: string;
        url: string;
        roomName: string;
        authorizationVersion: number;
        expiresAt: string;
      };
    }
  | {
      ok: false;
      status: number;
      body: { error: string; message?: string };
      retryAfterSeconds?: number;
    };

export async function joinInterviewSessionWorkflow(
  input: JoinInterviewSessionInput,
  deps: JoinInterviewSessionDeps = createJoinInterviewSessionDeps()
): Promise<JoinInterviewSessionResult> {
  if (typeof input.sessionId !== "string" || !isUuid(input.sessionId)) {
    deps.audit({
      outcome: "denied",
      reason: "invalid_session_id",
    });
    return {
      ok: false,
      status: 400,
      body: { error: "invalid_session_id" },
    };
  }

  let rateLimit: { allowed: boolean; retryAfterSeconds: number };
  try {
    rateLimit = await deps.consumeRateLimit(input.user.id);
  } catch (error) {
    deps.audit({
      outcome: "failed",
      reason: "reconnect_rate_limit_unavailable",
      diagnostic: classifyReconnectRateLimitError(error),
    });
    return {
      ok: false,
      status: 503,
      body: {
        error: "rate_limit_unavailable",
        message: "Reconnect authorization is temporarily unavailable.",
      },
    };
  }
  if (!rateLimit.allowed) {
    deps.audit({
      outcome: "denied",
      reason: "reconnect_token_rate_limited",
    });
    return {
      ok: false,
      status: 429,
      body: {
        error: "rate_limit_exceeded",
        message: "Too many reconnect attempts. Please try again shortly.",
      },
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  const session = await deps.getSession(input.sessionId);

  // Use the same response for absent and cross-user sessions so this endpoint
  // cannot be used to enumerate another user's interview history.
  if (!session || session.userId !== input.user.id) {
    deps.audit({
      outcome: "denied",
      reason: "session_not_found",
    });
    return {
      ok: false,
      status: 404,
      body: { error: "session_not_found" },
    };
  }

  const correlationId = readOwnedInterviewSessionCorrelationId({
    kind: "owned_interview_session",
    session,
    authenticatedUserId: input.user.id,
  });

  // Stable session creation already owns one reservation. The ready voice
  // session is the join entitlement; checking the user's remaining balance
  // here would reject the credit already bound to this attempt.
  const authorization = deriveJoinAuthorization(session, session.databaseNow);
  if (!authorization) {
    deps.audit({
      outcome: "denied",
      reason: "session_not_joinable",
      correlationId,
    });
    return {
      ok: false,
      status: 409,
      body: {
        error: "session_not_joinable",
        message: "This interview session is no longer active.",
      },
    };
  }

  const tokenResult = await deps.issueToken({
    identity: input.user.id,
    participantName: "Candidate",
    roomName: session.livekitRoomName!,
    ttlSeconds: authorization.ttlSeconds,
    observedAt: session.databaseNow,
    expiresAt: authorization.expiresAt,
    env: input.env,
  });

  if (!tokenResult.ok) {
    deps.audit({
      outcome: "failed",
      reason: "livekit_token_unavailable",
      correlationId,
    });
    return {
      ok: false,
      status: tokenResult.error.retryable ? 503 : 500,
      body: { error: "livekit_token_unavailable" },
    };
  }

  const current = await deps.getSession(input.sessionId);
  const currentAuthorization = current
    ? deriveJoinAuthorization(current, current.databaseNow)
    : null;
  if (
    !current ||
    current.userId !== input.user.id ||
    current.livekitRoomName !== session.livekitRoomName ||
    current.lifecycleVersion !== authorization.lifecycleVersion ||
    current.reconnectDeadlineOwner !== authorization.reconnectDeadlineOwner ||
    !sameInstant(
      current.reconnectDeadlineAt ?? null,
      authorization.reconnectDeadlineAt
    ) ||
    !currentAuthorization ||
    !sameInstant(currentAuthorization.expiresAt, authorization.expiresAt)
  ) {
    deps.audit({
      outcome: "denied",
      reason: "reconnect_authorization_changed",
      correlationId,
    });
    return {
      ok: false,
      status: 409,
      body: {
        error: "session_not_joinable",
        message: "This interview session is no longer active.",
      },
    };
  }

  const tokenExpirationMs = tokenResult.data.expiresAt.getTime();
  const canonicalCutoffMs =
    Math.floor(currentAuthorization.expiresAt.getTime() / 1_000) * 1_000;
  if (
    !Number.isFinite(tokenExpirationMs) ||
    tokenExpirationMs <= current.databaseNow.getTime() ||
    tokenExpirationMs > canonicalCutoffMs
  ) {
    deps.audit({
      outcome: "failed",
      reason: "livekit_token_expiry_invalid_after_authorization",
      correlationId,
    });
    return {
      ok: false,
      status: 503,
      body: { error: "livekit_token_unavailable" },
    };
  }

  deps.audit({
    outcome: "allowed",
    reason: "reconnect_token_issued",
    correlationId,
  });

  return {
    ok: true,
    body: {
      ...tokenResult.data,
      authorizationVersion: authorization.lifecycleVersion,
      expiresAt: authorization.expiresAt.toISOString(),
    },
  };
}

export function classifyReconnectRateLimitError(
  error: unknown
):
  | "missing_migration"
  | "permission"
  | "timeout"
  | "malformed_result"
  | "unknown" {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : undefined;
  if (code === "42P01" || code === "42883") return "missing_migration";
  if (code === "42501") return "permission";
  if (code === "57014") return "timeout";

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid reconnect rate-limit result")) {
    return "malformed_result";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  return "unknown";
}

export function createJoinInterviewSessionDeps(): JoinInterviewSessionDeps {
  return {
    audit: reportJoinInterviewFailure,
    consumeRateLimit: consumeReconnectRateLimit,
    getSession: getSessionForLiveKitJoin,
    issueToken: issueInterviewParticipantToken,
  };
}

function reportJoinInterviewFailure(
  event: Parameters<JoinInterviewSessionDeps["audit"]>[0]
) {
  if (event.outcome !== "failed") return;

  const errorCode =
    event.reason === "reconnect_rate_limit_unavailable"
      ? "livekit_reconnect_rate_limit_unavailable"
      : event.reason === "livekit_token_expiry_invalid_after_authorization"
        ? "livekit_token_issue_failed"
        : event.reason === "livekit_token_unavailable"
          ? "livekit_token_unavailable"
          : null;
  if (!errorCode) return;

  reportOperationalFailure({
    operation: "interview_token",
    errorCode,
    severity: "critical",
    retryable: true,
    correlationId: event.correlationId,
  });
}

function deriveJoinAuthorization(
  session: JoinableInterviewSession,
  now: Date
): {
  lifecycleVersion: number;
  reconnectDeadlineAt: Date | null;
  reconnectDeadlineOwner: "reconnect_grace" | "hard_deadline" | null;
  expiresAt: Date;
  ttlSeconds: number;
} | null {
  if (
    !isValidDate(now) ||
    session.mode !== "voice_video" ||
    !["connecting", "active", "reconnecting"].includes(
      session.lifecycleState
    ) ||
    session.endedAt ||
    !session.livekitRoomName ||
    !isValidDate(session.startedAt)
  ) {
    return null;
  }

  const startContractVersion = session.startContractVersion ?? 0;
  if (
    (startContractVersion !== 0 && startContractVersion !== 1) ||
    (startContractVersion === 1 &&
      (session.provisioningState !== "ready" ||
        !isValidDate(session.provisionedAt)))
  ) {
    return null;
  }

  if (
    session.lifecycleState === "reconnecting" &&
    (!session.reconnectDeadlineAt ||
      now.getTime() >= session.reconnectDeadlineAt.getTime())
  ) {
    return null;
  }

  const durationMinutes = getSessionDurationMinutes(session.config);
  const deadlineAt = deriveInterviewDeadlineAt({
    startedAt: session.startedAt,
    durationMinutes,
  });

  if (isInterviewDeadlineReached({ deadlineAt, now })) return null;

  const expiresAt =
    session.lifecycleState === "reconnecting"
      ? new Date(
          Math.min(session.reconnectDeadlineAt!.getTime(), deadlineAt.getTime())
        )
      : deadlineAt;
  const remainingSeconds = Math.floor(
    (expiresAt.getTime() - now.getTime()) / 1_000
  );
  if (remainingSeconds < 1) return null;
  return {
    lifecycleVersion: session.lifecycleVersion,
    reconnectDeadlineAt: session.reconnectDeadlineAt ?? null,
    reconnectDeadlineOwner: session.reconnectDeadlineOwner ?? null,
    expiresAt,
    ttlSeconds: Math.min(PARTICIPANT_TOKEN_TTL_SECONDS, remainingSeconds),
  };
}

function sameInstant(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function getSessionDurationMinutes(config: unknown): number {
  return normalizeInterviewDurationMinutes(
    isRecord(config) ? config.duration : undefined
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
