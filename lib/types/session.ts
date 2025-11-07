/**
 * TypeScript Type Definitions for Interview Sessions
 *
 * Centralized type definitions for interview sessions, transcripts, and related data structures.
 */

/**
 * Speaker in a conversation turn
 */
export type Speaker = "user" | "interviewer";

/**
 * Interview round type
 */
export type RoundType = "behavioral" | "product_sense" | "execution" | "strategy";

/**
 * Interview mode
 */
export type InterviewMode = "voice_video" | "text";

/**
 * Agent state during conversation
 */
export type AgentState = "idle" | "listening" | "thinking" | "speaking";

/**
 * Transcript turn representing a single conversation exchange
 */
export interface TranscriptTurn {
  id: string;
  sessionId: string;
  speaker: Speaker;
  startedAt: Date;
  endedAt: Date;
  text?: string;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
}

/**
 * Transcript turn data for creation (no ID yet)
 */
export interface TranscriptTurnInput {
  sessionId: string;
  speaker: Speaker;
  startedAt?: Date;
  endedAt?: Date;
  text?: string;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
}

/**
 * Interview session metadata
 */
export interface SessionMetadata {
  id: string;
  userId: string;
  role: string;
  roundType: RoundType;
  mode: InterviewMode;
  persona?: string;
  livekitRoomName?: string;
  config?: SessionConfig;
  startedAt: Date;
  endedAt?: Date;
}

/**
 * Interview session configuration
 */
export interface SessionConfig {
  duration?: number; // Estimated duration in minutes
  difficulty?: "easy" | "medium" | "hard";
  voice?: string; // Voice model ID
  speed?: number; // TTS speed multiplier
  emotion?: string; // TTS emotion
  volume?: number; // TTS volume multiplier
  sttModel?: string; // STT model identifier
  llmModel?: string; // LLM model identifier
  ttsModel?: string; // TTS model identifier
  [key: string]: any; // Allow additional config fields
}

/**
 * Request to save a transcript turn
 */
export interface TranscriptSaveRequest {
  sessionId: string;
  speaker: Speaker;
  startedAt?: string; // ISO 8601 timestamp
  endedAt?: string; // ISO 8601 timestamp
  text?: string;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
}

/**
 * Request to save multiple transcript turns in batch
 */
export interface TranscriptBatchSaveRequest {
  sessionId: string;
  turns: Array<{
    speaker: Speaker;
    startedAt?: string;
    endedAt?: string;
    text?: string;
    audioMs?: number;
    latencyMs?: number;
    section?: string;
  }>;
}

/**
 * Response for single transcript save
 */
export interface TranscriptSaveResponse {
  success: boolean;
  turn: TranscriptTurn;
}

/**
 * Response for batch transcript save
 */
export interface TranscriptBatchSaveResponse {
  success: boolean;
  turns: TranscriptTurn[];
}

/**
 * Error response for failed transcript save
 */
export interface TranscriptSaveError {
  error: string;
  message?: string;
  attemptNumber?: number;
  willRetry?: boolean;
}

/**
 * Transcript statistics for a session
 */
export interface TranscriptStats {
  totalTurns: number;
  userTurns: number;
  interviewerTurns: number;
  totalWords: number;
  userWords: number;
  averageLatency: number;
  totalDuration: number;
}

/**
 * Queued transcript save for retry
 */
export interface QueuedTranscriptSave {
  id: string; // Unique ID for this queue item
  turn: TranscriptTurnInput;
  attemptCount: number;
  lastAttempt: Date;
  error?: string;
}

/**
 * Result of a transcript save operation
 */
export interface TranscriptSaveResult {
  success: boolean;
  turn?: TranscriptTurn;
  error?: string;
  attemptNumber?: number;
}
