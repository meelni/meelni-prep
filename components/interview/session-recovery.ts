export type InterviewConnectionStatus =
  | "connecting"
  | "transport_delayed"
  | "connected"
  | "delayed"
  | "syncing"
  | "reconnecting"
  | "recovered"
  | "disconnected";

export type InterviewerConversationState =
  | "disconnected"
  | "connecting"
  | "initializing"
  | "listening"
  | "thinking"
  | "speaking";

const CONVERSATIONAL_INTERVIEWER_STATES = new Set<InterviewerConversationState>(
  ["listening", "thinking", "speaking"]
);

export function hasVerifiedInterviewerLiveness(input: {
  agentActive: boolean;
  agentState: string;
}): boolean {
  return (
    input.agentActive &&
    CONVERSATIONAL_INTERVIEWER_STATES.has(
      input.agentState as InterviewerConversationState
    )
  );
}

export function reconcileInterviewCustomerConnectionStatus(
  status: InterviewConnectionStatus,
  interviewerLivenessEstablished: boolean
): InterviewConnectionStatus {
  if (
    interviewerLivenessEstablished &&
    (status === "connecting" || status === "delayed")
  ) {
    return "syncing";
  }
  return status;
}

export function isInterviewConversationReady(
  status: InterviewConnectionStatus
): boolean {
  return (
    status === "connected" || status === "recovered" || status === "syncing"
  );
}

export interface InterviewRoomCredentials {
  token: string;
  url: string;
  roomName: string;
  authorizationVersion?: number;
  expiresAt?: string;
}

export type InterviewSessionBootstrapDisposition =
  | "ready"
  | "retryable"
  | "authorization_lost"
  | "terminal";

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

export function getCredentialRetryDelayMs(
  status: number,
  retryAfterHeader: string | null,
  retryable = false,
  nowMs = Date.now()
): number | null {
  if (!retryable && status !== 429 && status !== 503) return null;

  return getInterviewRetryDelayMs(retryAfterHeader, nowMs);
}

export function getInterviewRetryDelayMs(
  retryAfterHeader: string | null,
  nowMs = Date.now()
): number {
  if (retryAfterHeader) {
    const retryAfterSeconds = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.min(retryAfterSeconds * 1_000, MAX_RETRY_DELAY_MS);
    }

    const retryAt = Date.parse(retryAfterHeader);
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(0, retryAt - nowMs), MAX_RETRY_DELAY_MS);
    }
  }

  return DEFAULT_RETRY_DELAY_MS;
}

export function classifyInterviewSessionBootstrapResponse(
  status: number,
  body: unknown
): InterviewSessionBootstrapDisposition {
  if (status >= 200 && status < 300) return "ready";
  if (status === 401 || status === 403 || status === 404) {
    return "authorization_lost";
  }
  if (
    (isRecord(body) && body.retryable === true) ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 503
  ) {
    return "retryable";
  }
  return "terminal";
}

export function waitForInterviewRecoveryDelay(
  delayMs: number,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export function shouldDiscardInterviewRoomCredentials(
  status: number,
  retryable = false
): boolean {
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    (status === 409 && !retryable)
  );
}

function createAbortError(): Error {
  const error = new Error("Interview recovery aborted");
  error.name = "AbortError";
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
