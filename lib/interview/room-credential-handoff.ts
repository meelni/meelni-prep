export const INTERVIEW_ROOM_HANDOFF_MAX_AGE_MS = 60_000;

export interface InitialInterviewRoomCredentials {
  token: string;
  url: string;
  roomName: string;
}

interface InterviewRoomHandoffRecord extends InitialInterviewRoomCredentials {
  sessionId: string;
  ownerId: string;
  createdAt: number;
}

// Volatile by design: credentials survive only the client-side route change.
// A reload has no browser-stored token and must reauthorize through the server.
let pendingHandoff: InterviewRoomHandoffRecord | null = null;

export function storeInitialInterviewRoomCredentials(
  input: {
    response: unknown;
    sessionId: string;
    ownerId: string;
  },
  now: () => number = () => Date.now()
): boolean {
  pendingHandoff = null;
  const credentials = readCredentials(input.response);
  if (
    !credentials ||
    !isUuid(input.sessionId) ||
    input.ownerId.trim().length === 0
  ) {
    return false;
  }

  pendingHandoff = {
    ...credentials,
    sessionId: input.sessionId,
    ownerId: input.ownerId,
    createdAt: now(),
  };
  return true;
}

export function consumeInitialInterviewRoomCredentials(
  input: {
    sessionId: string;
    ownerId: string;
    expectedRoomName: string;
  },
  now: () => number = () => Date.now()
): InitialInterviewRoomCredentials | null {
  const record = pendingHandoff;
  pendingHandoff = null;
  if (!record) return null;

  const nowMs = now();
  if (
    record.sessionId !== input.sessionId ||
    record.ownerId !== input.ownerId ||
    record.roomName !== input.expectedRoomName ||
    record.createdAt > nowMs ||
    nowMs - record.createdAt > INTERVIEW_ROOM_HANDOFF_MAX_AGE_MS
  ) {
    return null;
  }
  return {
    token: record.token,
    url: record.url,
    roomName: record.roomName,
  };
}

function readCredentials(
  value: unknown
): InitialInterviewRoomCredentials | null {
  if (!isRecord(value)) return null;
  const { token, url, roomName } = value;
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    typeof url !== "string" ||
    !url.startsWith("wss://") ||
    typeof roomName !== "string" ||
    roomName.length === 0
  ) {
    return null;
  }
  return { token, url, roomName };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
