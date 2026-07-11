export type InterviewConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "recovered"
  | "disconnected";

export interface InterviewRoomCredentials {
  token: string;
  url: string;
  roomName: string;
  authorizationVersion?: number;
  expiresAt?: string;
}

export type RealtimeConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "signalReconnecting";

export interface InterviewConnectionTracker {
  attemptObserved: boolean;
  recoveryObserved: boolean;
}

export function reduceInterviewConnectionState(
  tracker: InterviewConnectionTracker,
  state: RealtimeConnectionState
): {
  tracker: InterviewConnectionTracker;
  status: InterviewConnectionStatus | null;
} {
  const attemptObserved = tracker.attemptObserved || state !== "disconnected";

  if (state === "disconnected" && !attemptObserved) {
    return { tracker: { ...tracker, attemptObserved }, status: null };
  }

  const recoveryObserved =
    tracker.recoveryObserved ||
    state === "reconnecting" ||
    state === "signalReconnecting" ||
    (state === "disconnected" && attemptObserved);

  const status: InterviewConnectionStatus =
    state === "connected"
      ? recoveryObserved
        ? "recovered"
        : "connected"
      : state === "reconnecting" || state === "signalReconnecting"
        ? "reconnecting"
        : state === "disconnected"
          ? "disconnected"
          : "connecting";

  return {
    tracker: {
      attemptObserved,
      recoveryObserved: status === "recovered" ? false : recoveryObserved,
    },
    status,
  };
}

const DEFAULT_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 10_000;

export function getCanonicalInterviewHref(sessionId: string): string {
  return `/interview?sessionId=${encodeURIComponent(sessionId)}`;
}

export function parseInterviewRoomCredentials(
  value: unknown,
  expectedRoomName: string,
  now = new Date()
): InterviewRoomCredentials | null {
  if (!isRecord(value)) return null;

  const { token, url, roomName, authorizationVersion, expiresAt } = value;
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    typeof url !== "string" ||
    !url.startsWith("wss://") ||
    typeof roomName !== "string" ||
    roomName !== expectedRoomName
  ) {
    return null;
  }

  const hasAuthorizationFence =
    authorizationVersion !== undefined || expiresAt !== undefined;
  if (hasAuthorizationFence) {
    const parsedExpiry =
      typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
    if (
      !Number.isSafeInteger(authorizationVersion) ||
      Number(authorizationVersion) < 1 ||
      !Number.isFinite(parsedExpiry) ||
      parsedExpiry <= now.getTime()
    ) {
      return null;
    }
    return {
      token,
      url,
      roomName,
      authorizationVersion: Number(authorizationVersion),
      expiresAt: new Date(parsedExpiry).toISOString(),
    };
  }

  return { token, url, roomName };
}

export function isInterviewRoomCredentialAuthorizationCurrent(
  credentials: InterviewRoomCredentials,
  lifecycle: unknown,
  now = new Date()
): boolean {
  if (
    credentials.authorizationVersion === undefined ||
    credentials.expiresAt === undefined ||
    !isRecord(lifecycle)
  ) {
    return false;
  }
  const expiresAt = Date.parse(credentials.expiresAt);
  if (
    lifecycle.lifecycleVersion !== credentials.authorizationVersion ||
    !["connecting", "active", "reconnecting"].includes(
      String(lifecycle.lifecycleState)
    ) ||
    lifecycle.endedAt !== null ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now.getTime()
  ) {
    return false;
  }
  if (lifecycle.lifecycleState === "reconnecting") {
    const reconnectDeadlineAt =
      typeof lifecycle.reconnectDeadlineAt === "string"
        ? Date.parse(lifecycle.reconnectDeadlineAt)
        : Number.NaN;
    if (
      !Number.isFinite(reconnectDeadlineAt) ||
      expiresAt > reconnectDeadlineAt
    ) {
      return false;
    }
  }
  return true;
}

export function getCredentialRetryDelayMs(
  status: number,
  retryAfterHeader: string | null
): number | null {
  if (status !== 429 && status !== 503) return null;

  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1_000, MAX_RETRY_DELAY_MS);
  }

  return DEFAULT_RETRY_DELAY_MS;
}

export function shouldDiscardInterviewRoomCredentials(status: number): boolean {
  return status === 409;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
