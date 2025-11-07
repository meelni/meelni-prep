/**
 * Enhanced Transcript Query Layer with Retry Logic
 *
 * This module provides robust database operations for saving transcript turns
 * during live interview sessions. Includes retry logic with exponential backoff
 * to handle transient database errors.
 */

import { db } from "../index";
import { transcriptTurn } from "../schema";
import { eq, asc } from "drizzle-orm";
import {
  createTranscriptTurn,
  batchCreateTranscriptTurns,
  getSessionTranscript,
  updateTranscriptTurn,
  CreateTranscriptTurnInput,
  UpdateTranscriptTurnInput,
} from "../transcripts";

/**
 * Retry configuration for database operations
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
};

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function getRetryDelay(attemptNumber: number): number {
  const delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attemptNumber - 1);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

/**
 * Generic retry wrapper for database operations
 *
 * Retries a database operation up to maxAttempts times with exponential backoff.
 * Logs each attempt and final failure for debugging.
 *
 * @param operation - The database operation to retry
 * @param operationName - Name of the operation for logging
 * @returns The result of the successful operation
 * @throws The last error if all retries fail
 */
async function retryOperation<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      const result = await operation();

      // Log successful retry if it took more than one attempt
      if (attempt > 1) {
        console.log(`[Transcript] ${operationName} succeeded on attempt ${attempt}`);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Log the error
      console.error(
        `[Transcript] ${operationName} failed on attempt ${attempt}/${RETRY_CONFIG.maxAttempts}:`,
        error instanceof Error ? error.message : String(error)
      );

      // Don't retry on the last attempt
      if (attempt === RETRY_CONFIG.maxAttempts) {
        break;
      }

      // Wait before retrying with exponential backoff
      const delay = getRetryDelay(attempt);
      console.log(`[Transcript] Retrying ${operationName} in ${delay}ms...`);
      await sleep(delay);
    }
  }

  // All retries failed
  console.error(
    `[Transcript] ${operationName} failed after ${RETRY_CONFIG.maxAttempts} attempts`
  );
  throw lastError;
}

/**
 * Save a single transcript turn with retry logic
 *
 * Attempts to save the turn to the database up to 3 times with exponential backoff.
 *
 * @param turn - The transcript turn data to save
 * @returns The saved turn with generated ID
 * @throws Error if all retry attempts fail
 */
export async function saveTranscriptTurn(turn: CreateTranscriptTurnInput) {
  return retryOperation(
    () => createTranscriptTurn(turn),
    `saveTranscriptTurn(session=${turn.sessionId.slice(0, 8)}..., speaker=${turn.speaker})`
  );
}

/**
 * Save multiple transcript turns with retry logic (batch operation)
 *
 * More efficient than individual saves for multiple turns.
 *
 * @param turns - Array of transcript turn data to save
 * @returns Array of saved turns with generated IDs
 * @throws Error if all retry attempts fail
 */
export async function saveTranscriptTurnsBatch(turns: CreateTranscriptTurnInput[]) {
  if (turns.length === 0) return [];

  return retryOperation(
    () => batchCreateTranscriptTurns(turns),
    `saveTranscriptTurnsBatch(count=${turns.length})`
  );
}

/**
 * Get all transcript turns for a session with retry logic
 *
 * @param sessionId - The session ID to fetch transcripts for
 * @returns Array of transcript turns ordered chronologically
 * @throws Error if all retry attempts fail
 */
export async function getSessionTranscriptWithRetry(sessionId: string) {
  return retryOperation(
    () => getSessionTranscript(sessionId),
    `getSessionTranscript(session=${sessionId.slice(0, 8)}...)`
  );
}

/**
 * Update a transcript turn with retry logic
 *
 * Useful for updating incomplete turns (e.g., adding endedAt timestamp)
 *
 * @param id - The turn ID to update
 * @param updates - The fields to update
 * @returns The updated turn
 * @throws Error if all retry attempts fail
 */
export async function updateTranscriptTurnWithRetry(
  id: string,
  updates: UpdateTranscriptTurnInput
) {
  return retryOperation(
    () => updateTranscriptTurn(id, updates),
    `updateTranscriptTurn(id=${id.slice(0, 8)}...)`
  );
}

/**
 * Validate transcript turn data before saving
 *
 * @param turn - The turn data to validate
 * @returns true if valid, throws error if invalid
 */
export function validateTranscriptTurn(turn: CreateTranscriptTurnInput): boolean {
  if (!turn.sessionId) {
    throw new Error("sessionId is required");
  }

  if (!turn.speaker || !["user", "interviewer"].includes(turn.speaker)) {
    throw new Error("speaker must be 'user' or 'interviewer'");
  }

  if (turn.startedAt && turn.endedAt && turn.startedAt > turn.endedAt) {
    throw new Error("startedAt must be before endedAt");
  }

  return true;
}

/**
 * Re-export original functions for compatibility
 */
export { createTranscriptTurn, batchCreateTranscriptTurns, getSessionTranscript, updateTranscriptTurn };
export type { CreateTranscriptTurnInput, UpdateTranscriptTurnInput };
