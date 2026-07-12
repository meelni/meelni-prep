/**
 * API Type Definitions
 *
 * TypeScript types for all Meelni API request/response schemas.
 * These types ensure type safety across the application and serve as documentation.
 */

// ============================================================================
// Session Types
// ============================================================================

/**
 * Request body for starting a new interview session
 */
export interface StartSessionRequest {
  /** Interview round type - determines question framework and evaluation criteria */
  roundType: "behavioral" | "product_sense" | "execution" | "strategy";
  /** Interview mode - defaults to voice_video */
  mode?: "voice_video" | "text";
  /** Canonical candidate role - only 'pm' is accepted */
  role?: "pm";
  /** Client-safe interview preferences */
  config?: InterviewPreferenceInput;
  /** Optional pre-selected question UUID */
  questionId?: string;
}

/**
 * Client-safe preferences accepted by session start
 */
export interface InterviewPreferenceInput {
  difficulty?: "beginner" | "intermediate" | "advanced";
  duration?: 15 | 30 | 45;
  hintMode?: "off" | "gentle" | "coach";
  questionPreference?: InterviewQuestionPreference;
}

export interface InterviewQuestionPreference {
  recency: "all" | "recent" | "very_recent";
  recentDays?: number;
}

/**
 * Validated preferences returned by session start
 */
export interface InterviewPreferences {
  difficulty: "beginner" | "intermediate" | "advanced";
  duration: 15 | 30 | 45;
  hintMode: "off" | "gentle" | "coach";
  questionPreference: InterviewQuestionPreference;
}

/**
 * Response from starting a session
 */
export interface StartSessionResponse {
  /** UUID of the created session */
  sessionId: string;
  /** LiveKit room name for the interview */
  roomName: string;
  /** JWT access token for LiveKit room */
  token: string;
  /** LiveKit server URL */
  url: string;
  /** Server-derived absolute UTC deadline for this interview */
  deadlineAt: string;
  /** Validated client-safe preferences; runtime settings remain server-owned */
  config: InterviewPreferences;
  /** Selected question snapshot, or null when no question was selected */
  question: {
    id: string;
    text: string;
    company: string | null;
  } | null;
}

/**
 * Legacy persisted session snapshot returned by session history endpoints.
 * This is never accepted by POST /api/session/start.
 */
export type SessionConfig = Record<string, unknown>;

/**
 * Request body for ending a session
 */
export interface EndInterviewSessionRequest {
  /** UUID of the session to end */
  sessionId: string;
}

/**
 * Response from ending a session
 */
export interface EndInterviewSessionResponse {
  status: "queued" | "pending_dispatch" | "skipped";
  session: {
    lifecycleState: "completed" | "abandoned" | "failed";
    terminalReason:
      | "user_end"
      | "time_limit"
      | "disconnect_timeout"
      | "provider_failure"
      | "insufficient_signal"
      | "legacy_unknown";
    endedAt: string;
    disposition: "applied" | "existing" | "repaired";
  };
  feedback: {
    id: string;
    status: "pending" | "processing" | "completed" | "failed" | "skipped";
    dispatchStatus: "not_required" | "pending" | "sending" | "sent" | "failed";
    retryable: boolean;
  };
  feedbackId: string;
  tier: "full" | "partial" | "insufficient" | "abandoned";
  stats: {
    totalTurns: number;
    userTurns: number;
    totalWords: number;
    durationSeconds: number;
    substantiveResponses: number;
  };
  recommendations: string[];
  reason?: string;
  nextHref: string;
}

/**
 * Complete session object from database
 */
export interface Session {
  /** UUID primary key */
  id: string;
  /** Foreign key to app_user table */
  userId: string;
  /** User's role (e.g., 'pm', 'designer', 'engineer') */
  role: string;
  /** Interview round type */
  roundType: "behavioral" | "product_sense" | "execution" | "strategy";
  /** Interview mode */
  mode: "voice_video" | "text";
  /** Custom interviewer persona */
  persona?: string;
  /** ISO 8601 timestamp when session started */
  startedAt: Date | string;
  /** Canonical server-derived absolute deadline */
  deadlineAt: string;
  /** ISO 8601 timestamp when session ended (null if active) */
  endedAt?: Date | string | null;
  /** LiveKit room name */
  livekitRoomName?: string;
  /** Session configuration */
  config: SessionConfig;
}

/**
 * Query parameters for listing sessions
 */
export interface ListSessionsQuery {
  /** Maximum number of sessions to return (default: 50) */
  limit?: number;
  /** Number of sessions to skip (default: 0) */
  offset?: number;
  /** Filter by round type */
  roundType?: "behavioral" | "product_sense" | "execution" | "strategy";
  /** Filter by mode */
  mode?: "voice_video" | "text";
}

/**
 * Response from listing sessions
 */
export interface ListSessionsResponse {
  /** Array of session objects */
  sessions: Session[];
  /** Total number of sessions matching filters */
  total: number;
  /** Maximum number of results returned */
  limit: number;
  /** Number of results skipped */
  offset: number;
}

// ============================================================================
// Transcript Types
// ============================================================================

/**
 * Single turn in a conversation transcript
 */
export interface TranscriptTurn {
  /** UUID primary key */
  id: string;
  /** Foreign key to interview_session table */
  sessionId: string;
  /** Speaker identifier */
  speaker: "user" | "interviewer";
  /** ISO 8601 timestamp when turn started */
  startedAt?: Date | string;
  /** ISO 8601 timestamp when turn ended */
  endedAt?: Date | string;
  /** Transcribed or generated text */
  text?: string;
  /** Duration of audio in milliseconds */
  audioMs?: number;
  /** Turn-around latency in milliseconds */
  latencyMs?: number;
  /** Section/phase of interview (optional categorization) */
  section?: string;
}

/**
 * Request body for saving transcript turns
 */
export interface SaveTranscriptRequest {
  /** Session UUID */
  sessionId: string;
  /** Single turn or array of turns to save */
  turns: TranscriptTurn | TranscriptTurn[];
}

/**
 * Response from saving transcript
 */
export interface SaveTranscriptResponse {
  /** Success status */
  success: boolean;
  /** Number of turns saved */
  count: number;
}

/**
 * Response from getting session transcript
 */
export interface GetTranscriptResponse {
  /** Session UUID */
  sessionId: string;
  /** Array of transcript turns in chronological order */
  turns: TranscriptTurn[];
  /** Total number of turns */
  total: number;
}

// ============================================================================
// Feedback Types
// ============================================================================

/**
 * Individual dimension scores (0-10 scale)
 */
export interface FeedbackScores {
  /** Structure and framework usage (0-10) */
  structure: number;
  /** Clarity of communication (0-10) */
  clarity: number;
  /** Depth of insights (0-10) */
  insight: number;
  /** Communication effectiveness (0-10) */
  communication: number;
  /** Leadership and influence (0-10) */
  leadership: number;
}

/**
 * Request body for generating feedback
 */
export interface GenerateFeedbackRequest {
  /** Session UUID to generate feedback for */
  sessionId: string;
  /** Force regeneration even if feedback exists (default: false) */
  force?: boolean;
}

/**
 * Complete feedback object
 */
export interface Feedback {
  /** UUID primary key */
  id: string;
  /** Foreign key to interview_session table (unique) */
  sessionId: string;
  /** Structure score (0-10) */
  structureScore: number;
  /** Clarity score (0-10) */
  clarityScore: number;
  /** Insight score (0-10) */
  insightScore: number;
  /** Communication score (0-10) */
  communicationScore: number;
  /** Leadership score (0-10) */
  leadershipScore: number;
  /** Overall weighted score (0-10) */
  overallScore: number;
  /** Array of strength statements */
  strengths: string[];
  /** Array of improvement suggestions */
  improvements: string[];
  /** Array of practice drill recommendations */
  drills: string[];
  /** Executive summary of performance */
  summary: string;
  /** ISO 8601 timestamp when feedback was created */
  createdAt: Date | string;
}

/**
 * Response from generating feedback
 */
export interface GenerateFeedbackResponse {
  /** Success status */
  success: boolean;
  /** Generated feedback object */
  feedback: Feedback;
}

// ============================================================================
// LiveKit Types
// ============================================================================

/**
 * Request body for generating LiveKit token
 */
export interface LiveKitTokenRequest {
  /** LiveKit room name */
  roomName: string;
  /** Participant display name */
  participantName: string;
}

/**
 * Response from LiveKit token generation
 */
export interface LiveKitTokenResponse {
  /** JWT access token for LiveKit */
  token: string;
  /** LiveKit server WebSocket URL */
  url: string;
}

/**
 * Request body for demo token (no input required)
 */
export interface DemoTokenRequest {
  /** Optional participant name (defaults to "Guest") */
  participantName?: string;
}

/**
 * Response from demo token generation
 */
export interface DemoTokenResponse {
  /** JWT access token for LiveKit */
  token: string;
  /** LiveKit server WebSocket URL */
  url: string;
  /** Generated demo room name */
  roomName: string;
}

// ============================================================================
// Voice Types
// ============================================================================

/**
 * Cartesia voice model information
 */
export interface CartesiaVoice {
  /** Voice unique identifier */
  id: string;
  /** Voice display name */
  name: string;
  /** Voice description */
  description: string;
  /** Language code (e.g., 'en', 'es', 'fr') */
  language: string;
}

/**
 * Response from listing Cartesia voices
 */
export interface ListVoicesResponse {
  /** Array of available voice models */
  voices: CartesiaVoice[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Standard API error response
 */
export interface APIError {
  /** Error message */
  error: string;
  /** Optional detailed error information */
  details?: string;
  /** HTTP status code */
  statusCode?: number;
}

/**
 * Validation error with field-specific details
 */
export interface ValidationError extends APIError {
  /** Map of field names to error messages */
  fields?: Record<string, string>;
}

// ============================================================================
// User Types
// ============================================================================

/**
 * User object from Supabase Auth
 */
export interface User {
  /** User UUID */
  id: string;
  /** User email address */
  email: string;
  /** User display name */
  name?: string;
  /** ISO 8601 timestamp when user was created */
  createdAt: Date | string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if response is an API error
 */
export function isAPIError(response: unknown): response is APIError {
  return (
    typeof response === "object" &&
    response !== null &&
    "error" in response &&
    typeof response.error === "string"
  );
}

/**
 * Type guard to check if response is a validation error
 */
export function isValidationError(
  response: unknown
): response is ValidationError {
  return (
    isAPIError(response) &&
    ("fields" in response ? typeof response.fields === "object" : true)
  );
}
