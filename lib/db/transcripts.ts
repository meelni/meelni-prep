import { db } from "./index";
import { transcriptTurn } from "./schema";
import { eq, asc } from "drizzle-orm";

export interface CreateTranscriptTurnInput {
  sessionId: string;
  speaker: "user" | "interviewer";
  startedAt?: Date;
  endedAt?: Date;
  text?: string;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
}

export interface UpdateTranscriptTurnInput {
  endedAt?: Date;
  text?: string;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
}

/**
 * Create a new transcript turn
 */
export async function createTranscriptTurn(input: CreateTranscriptTurnInput) {
  const [turn] = await db
    .insert(transcriptTurn)
    .values({
      sessionId: input.sessionId,
      speaker: input.speaker,
      startedAt: input.startedAt || new Date(),
      endedAt: input.endedAt,
      text: input.text,
      audioMs: input.audioMs,
      latencyMs: input.latencyMs,
      section: input.section,
    })
    .returning();

  return turn;
}

/**
 * Update a transcript turn
 */
export async function updateTranscriptTurn(
  turnId: string,
  input: UpdateTranscriptTurnInput
) {
  const [turn] = await db
    .update(transcriptTurn)
    .set(input)
    .where(eq(transcriptTurn.id, turnId))
    .returning();

  return turn;
}

/**
 * Get all transcript turns for a session, ordered chronologically
 */
export async function getSessionTranscript(sessionId: string) {
  const turns = await db
    .select()
    .from(transcriptTurn)
    .where(eq(transcriptTurn.sessionId, sessionId))
    .orderBy(asc(transcriptTurn.startedAt));

  return turns;
}

/**
 * Get a single transcript turn by ID
 */
export async function getTranscriptTurnById(turnId: string) {
  const [turn] = await db
    .select()
    .from(transcriptTurn)
    .where(eq(transcriptTurn.id, turnId))
    .limit(1);

  return turn;
}

/**
 * Delete a transcript turn (for cleanup/corrections)
 */
export async function deleteTranscriptTurn(turnId: string) {
  await db.delete(transcriptTurn).where(eq(transcriptTurn.id, turnId));
}

/**
 * Get transcript statistics for a session
 */
export async function getSessionTranscriptStats(sessionId: string) {
  const turns = await getSessionTranscript(sessionId);

  const stats = {
    totalTurns: turns.length,
    userTurns: turns.filter((t) => t.speaker === "user").length,
    interviewerTurns: turns.filter((t) => t.speaker === "interviewer").length,
    totalWords: turns.reduce((sum, t) => sum + (t.text?.split(" ").length || 0), 0),
    userWords: turns
      .filter((t) => t.speaker === "user")
      .reduce((sum, t) => sum + (t.text?.split(" ").length || 0), 0),
    averageLatency:
      turns.filter((t) => t.latencyMs).length > 0
        ? turns.reduce((sum, t) => sum + (t.latencyMs || 0), 0) /
          turns.filter((t) => t.latencyMs).length
        : 0,
    totalDuration: turns.reduce((sum, t) => sum + (t.audioMs || 0), 0),
  };

  return stats;
}

/**
 * Batch create transcript turns (for efficient bulk inserts)
 */
export async function batchCreateTranscriptTurns(
  inputs: CreateTranscriptTurnInput[]
) {
  if (inputs.length === 0) return [];

  const turns = await db
    .insert(transcriptTurn)
    .values(
      inputs.map((input) => ({
        sessionId: input.sessionId,
        speaker: input.speaker,
        startedAt: input.startedAt || new Date(),
        endedAt: input.endedAt,
        text: input.text,
        audioMs: input.audioMs,
        latencyMs: input.latencyMs,
        section: input.section,
      }))
    )
    .returning();

  return turns;
}
