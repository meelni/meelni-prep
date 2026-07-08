import type { RoundType } from "./interview";

export type Speaker = "user" | "interviewer";

export type InterviewMode = "voice_video" | "text";

export type AgentState = "idle" | "listening" | "thinking" | "speaking";

export type HintMode = "off" | "gentle" | "coach";

export function shouldAnalyzeNudges(hintMode: unknown): boolean {
  return hintMode === "gentle" || hintMode === "coach";
}

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

export interface SessionConfig {
  duration?: number;
  difficulty?: "easy" | "medium" | "hard";
  hintMode?: HintMode;
  voice?: string;
  speed?: number;
  emotion?: string;
  volume?: number;
  sttModel?: string;
  llmModel?: string;
  ttsModel?: string;
  [key: string]: unknown;
}

export interface TranscriptSaveRequest {
  sessionId: string;
  speaker: Speaker;
  startedAt?: string;
  endedAt?: string;
  text?: string;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
}

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

export interface TranscriptSaveResponse {
  success: boolean;
  turn: TranscriptTurn;
}

export interface TranscriptBatchSaveResponse {
  success: boolean;
  turns: TranscriptTurn[];
}

export interface TranscriptSaveError {
  error: string;
  message?: string;
  attemptNumber?: number;
  willRetry?: boolean;
}

export interface TranscriptStats {
  totalTurns: number;
  userTurns: number;
  interviewerTurns: number;
  totalWords: number;
  userWords: number;
  averageLatency: number;
  totalDuration: number;
}

export interface QueuedTranscriptSave {
  id: string;
  turn: TranscriptTurnInput;
  attemptCount: number;
  lastAttempt: Date;
  error?: string;
}

export interface TranscriptSaveResult {
  success: boolean;
  turn?: TranscriptTurn;
  error?: string;
  attemptNumber?: number;
}
