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
    reason: string;
    diagnostic?:
      | "missing_migration"
      | "permission"
      | "timeout"
      | "malformed_result"
      | "unknown";
    sessionId?: string;
    userId: string;
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
      userId: input.user.id,
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
      sessionId: input.sessionId,
      userId: input.user.id,
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
      sessionId: input.sessionId,
      userId: input.user.id,
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
      sessionId: input.sessionId,
      userId: input.user.id,
    });
    return {
      ok: false,
      status: 404,
      body: { error: "session_not_found" },
    };
  }

  // Session creation already reserved and consumed one interview credit. The
  // owned, active voice session is the reconnect entitlement; checking the
  // user's remaining balance here would reject the credit they just consumed.
  const authorization = deriveJoinAuthorization(session, session.databaseNow);
  if (!authorization) {
    deps.audit({
      outcome: "denied",
      reason: "session_not_joinable",
      sessionId: input.sessionId,
      userId: input.user.id,
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
    expiresAt: authorization.expiresAt,
    env: input.env,
  });

  if (!tokenResult.ok) {
    deps.audit({
      outcome: "failed",
      reason: "livekit_token_unavailable",
      sessionId: input.sessionId,
      userId: input.user.id,
    });
    return {
      ok: false,
      status: tokenResult.error.retryable ? 503 : 500,
      body: { error: "livekit_token_unavailable" },
    };
  }

  const current = await deps.getSession(input.sessionId);
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
    !deriveJoinAuthorization(current, current.databaseNow)
  ) {
    deps.audit({
      outcome: "denied",
      reason: "reconnect_authorization_changed",
      sessionId: input.sessionId,
      userId: input.user.id,
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

  deps.audit({
    outcome: "allowed",
    reason: "reconnect_token_issued",
    sessionId: input.sessionId,
    userId: input.user.id,
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
    audit: (event) => console.info("[LiveKitJoinAudit]", event),
    consumeRateLimit: consumeReconnectRateLimit,
    getSession: getSessionForLiveKitJoin,
    issueToken: issueInterviewParticipantToken,
  };
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
    session.mode !== "voice_video" ||
    !["connecting", "active", "reconnecting"].includes(
      session.lifecycleState
    ) ||
    session.endedAt ||
    !session.livekitRoomName ||
    !session.startedAt
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
