/**
 * Compatibility exports for the legacy session type import path.
 *
 * Canonical session and transcript contracts now live in `@meelni/core`.
 */
export {
  type AgentState,
  type InterviewLifecycleState,
  type InterviewMode,
  type InterviewTerminalOutcome,
  type InterviewTerminalReason,
  type InterviewTerminalState,
  type QueuedTranscriptSave,
  type RoundType,
  type SessionConfig,
  type SessionMetadata,
  type Speaker,
  type TranscriptBatchSaveRequest,
  type TranscriptBatchSaveResponse,
  type TranscriptSaveError,
  type TranscriptSaveRequest,
  type TranscriptSaveResponse,
  type TranscriptSaveResult,
  type TranscriptStats,
  type TranscriptTurn,
  type TranscriptTurnInput,
} from "@meelni/core";
