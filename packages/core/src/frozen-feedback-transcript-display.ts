import { MAX_CANONICAL_EVENT_ID_LENGTH } from "./feedback-transcript";

export interface FrozenFeedbackTranscriptDisplayTurn {
  id: string;
  eventId?: string;
  speaker: "user" | "interviewer";
  text: string | null;
  startedAt: string | null;
}

export interface FrozenFeedbackTranscriptDisplayResponse {
  scope: "frozen";
  turns: FrozenFeedbackTranscriptDisplayTurn[];
}

const DISPLAY_TURN_KEYS = new Set([
  "id",
  "eventId",
  "speaker",
  "text",
  "startedAt",
]);
const RESPONSE_KEYS = new Set(["scope", "turns"]);
const OPAQUE_ROW_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_DISPLAY_TRANSCRIPT_TURNS = 1_000;
const MAX_DISPLAY_TRANSCRIPT_TEXT_LENGTH = 20_000;

/** Strip server-only writer and delivery facts from frozen database rows. */
export function projectFrozenFeedbackTranscriptDisplayTurns(
  value: unknown
): FrozenFeedbackTranscriptDisplayTurn[] | null {
  if (!Array.isArray(value) || value.length > MAX_DISPLAY_TRANSCRIPT_TURNS) {
    return null;
  }
  const turns: FrozenFeedbackTranscriptDisplayTurn[] = [];
  const identities = new Set<string>();
  for (const candidate of value) {
    const turn = decodeTurn(candidate, false);
    if (!turn || identities.has(turn.id)) return null;
    identities.add(turn.id);
    turns.push(turn);
  }
  return turns;
}

/** Decode the exact display-only JSON returned by the frozen transcript route. */
export function decodeFrozenFeedbackTranscriptDisplayResponse(
  value: unknown
): FrozenFeedbackTranscriptDisplayResponse | null {
  if (
    !isRecord(value) ||
    hasUnexpectedKeys(value, RESPONSE_KEYS) ||
    value.scope !== "frozen" ||
    !Array.isArray(value.turns) ||
    value.turns.length > MAX_DISPLAY_TRANSCRIPT_TURNS
  ) {
    return null;
  }
  const turns: FrozenFeedbackTranscriptDisplayTurn[] = [];
  const identities = new Set<string>();
  for (const candidate of value.turns) {
    const turn = decodeTurn(candidate, true);
    if (!turn || identities.has(turn.id)) return null;
    identities.add(turn.id);
    turns.push(turn);
  }
  return { scope: "frozen", turns };
}

function decodeTurn(
  value: unknown,
  requireExactKeys: boolean
): FrozenFeedbackTranscriptDisplayTurn | null {
  if (
    !isRecord(value) ||
    (requireExactKeys && hasUnexpectedKeys(value, DISPLAY_TURN_KEYS)) ||
    typeof value.id !== "string" ||
    !OPAQUE_ROW_ID.test(value.id) ||
    (value.speaker !== "user" && value.speaker !== "interviewer") ||
    (value.text !== null &&
      (typeof value.text !== "string" ||
        value.text.length > MAX_DISPLAY_TRANSCRIPT_TEXT_LENGTH))
  ) {
    return null;
  }
  const eventId = decodeEventId(value.eventId);
  if (eventId === null) return null;
  const startedAt = decodeStartedAt(value.startedAt);
  if (startedAt === undefined) return null;
  return {
    id: value.id,
    ...(eventId ? { eventId } : {}),
    speaker: value.speaker,
    text: value.text,
    startedAt,
  };
}

function decodeEventId(value: unknown): string | undefined | null {
  if (value === null || value === undefined) return undefined;
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_CANONICAL_EVENT_ID_LENGTH
    ? value
    : null;
}

function decodeStartedAt(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  }
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
    ? value
    : undefined;
}

function hasUnexpectedKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>
) {
  return Object.keys(value).some((key) => !allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
