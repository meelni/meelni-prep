export const INTERVIEW_START_ATTEMPT_STORAGE_KEY =
  "meelni.interview-start-attempts.v1";

export const INTERVIEW_START_ATTEMPT_MAX_AGE_MS = 60 * 60 * 1_000;
export const INTERVIEW_START_ATTEMPT_MAX_RECORDS = 5;

interface StartAttemptRecord {
  intent: string;
  startAttemptId: string;
  createdAt: number;
}

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function getOrCreateInterviewStartAttempt(
  intent: Record<string, unknown>,
  storage: SessionStorageLike = window.sessionStorage,
  createId: () => string = () => crypto.randomUUID(),
  now: () => number = () => Date.now()
): string {
  const canonicalIntent = stableSerialize(intent);
  const nowMs = now();
  const records = readRecords(storage, nowMs);
  const existing = records.find((record) => record.intent === canonicalIntent);
  if (existing && isUuid(existing.startAttemptId)) {
    writeRecords(storage, keepCurrentIntent(records, existing));
    return existing.startAttemptId;
  }

  const startAttemptId = createId();
  if (!isUuid(startAttemptId)) {
    throw new Error("Interview start attempt IDs must be UUIDs");
  }

  writeRecords(
    storage,
    [...records, { intent: canonicalIntent, startAttemptId, createdAt: nowMs }]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, INTERVIEW_START_ATTEMPT_MAX_RECORDS)
  );
  return startAttemptId;
}

export function clearInterviewStartAttempt(
  startAttemptId: string,
  storage: SessionStorageLike = window.sessionStorage,
  now: () => number = () => Date.now()
): void {
  const remaining = readRecords(storage, now()).filter(
    (record) => record.startAttemptId !== startAttemptId
  );
  writeRecords(storage, remaining);
}

export function parseInterviewStartSessionId(value: unknown): string | null {
  if (!isRecord(value) || typeof value.sessionId !== "string") return null;
  return isUuid(value.sessionId) ? value.sessionId : null;
}

export function isDefinitiveInterviewStartFailure(
  status: number,
  body: unknown
): boolean {
  if (status < 400 || status >= 500 || [408, 425, 429].includes(status)) {
    return false;
  }
  return !isRecord(body) || body.retryable !== true;
}

function readRecords(
  storage: SessionStorageLike,
  nowMs: number
): StartAttemptRecord[] {
  const raw = storage.getItem(INTERVIEW_START_ATTEMPT_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isStartAttemptRecord)
      .filter(
        (record) =>
          record.createdAt <= nowMs &&
          nowMs - record.createdAt <= INTERVIEW_START_ATTEMPT_MAX_AGE_MS
      )
      .sort((left, right) => right.createdAt - left.createdAt);
  } catch {
    return [];
  }
}

function keepCurrentIntent(
  records: StartAttemptRecord[],
  current: StartAttemptRecord
): StartAttemptRecord[] {
  return [
    current,
    ...records
      .filter((record) => record.startAttemptId !== current.startAttemptId)
      .slice(0, INTERVIEW_START_ATTEMPT_MAX_RECORDS - 1),
  ];
}

function writeRecords(
  storage: SessionStorageLike,
  records: StartAttemptRecord[]
): void {
  storage.setItem(INTERVIEW_START_ATTEMPT_STORAGE_KEY, JSON.stringify(records));
}

function isStartAttemptRecord(value: unknown): value is StartAttemptRecord {
  return (
    isRecord(value) &&
    typeof value.intent === "string" &&
    typeof value.startAttemptId === "string" &&
    isUuid(value.startAttemptId) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt)
  );
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
