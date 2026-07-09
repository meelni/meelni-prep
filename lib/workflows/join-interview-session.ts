import {
  issueInterviewParticipantToken,
  type LiveKitEnvironment,
} from "@/lib/internal/integrations";
import { getSessionForLiveKitJoin } from "@/lib/db/sessions";
import { consumeReconnectRateLimit } from "@/lib/db/rate-limits";

const DEFAULT_SESSION_DURATION_MINUTES = 30;
const MAX_SESSION_DURATION_MINUTES = 60;
const RECONNECT_GRACE_MINUTES = 10;
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
    env: LiveKitEnvironment;
  }): ReturnType<typeof issueInterviewParticipantToken>;
  now(): Date;
}

export type JoinInterviewSessionResult =
  | {
      ok: true;
      body: { token: string; url: string; roomName: string };
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
  if (!isJoinableSession(session, deps.now())) {
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
    ttlSeconds: PARTICIPANT_TOKEN_TTL_SECONDS,
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

  deps.audit({
    outcome: "allowed",
    reason: "reconnect_token_issued",
    sessionId: input.sessionId,
    userId: input.user.id,
  });

  return {
    ok: true,
    body: tokenResult.data,
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
    now: () => new Date(),
  };
}

function isJoinableSession(
  session: JoinableInterviewSession,
  now: Date
): boolean {
  if (
    session.mode !== "voice_video" ||
    session.status !== "in_progress" ||
    session.endedAt ||
    !session.livekitRoomName ||
    !session.startedAt
  ) {
    return false;
  }

  const durationMinutes = getSessionDurationMinutes(session.config);
  const expiresAt =
    session.startedAt.getTime() +
    (durationMinutes + RECONNECT_GRACE_MINUTES) * 60 * 1000;

  return now.getTime() <= expiresAt;
}

function getSessionDurationMinutes(config: unknown): number {
  if (!isRecord(config)) {
    return DEFAULT_SESSION_DURATION_MINUTES;
  }

  const duration = config.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration)) {
    return DEFAULT_SESSION_DURATION_MINUTES;
  }

  return Math.min(
    MAX_SESSION_DURATION_MINUTES,
    Math.max(1, Math.round(duration))
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
