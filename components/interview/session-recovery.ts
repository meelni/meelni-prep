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
  expectedRoomName: string
): InterviewRoomCredentials | null {
  if (!isRecord(value)) return null;

  const { token, url, roomName } = value;
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

  return { token, url, roomName };
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
