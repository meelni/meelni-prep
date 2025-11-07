/**
 * TypeScript types for the Answer Comparison feature
 */

// Session attempt with feedback scores for comparison list
export interface SessionAttempt {
  id: string;
  startedAt: string;
  endedAt: string | null;
  roundType: string;
  mode: string;
  overallScore: number | null;
  structureScore: number | null;
  clarityScore: number | null;
  insightScore: number | null;
  communicationScore: number | null;
  leadershipScore: number | null;
}

// Detailed comparison data for two sessions
export interface ComparisonData {
  session1: SessionComparisonDetail;
  session2: SessionComparisonDetail;
  scoreDelta: ScoreDelta;
}

// Detailed session data for comparison
export interface SessionComparisonDetail {
  id: string;
  startedAt: string;
  endedAt: string | null;
  roundType: string;
  mode: string;
  scores: FeedbackScores;
  feedback: FeedbackContent;
  keyQuotes: string[];
}

// Feedback scores
export interface FeedbackScores {
  overall: number | null;
  structure: number | null;
  clarity: number | null;
  insight: number | null;
  communication: number | null;
  leadership: number | null;
}

// Feedback content (strengths, improvements, summary)
export interface FeedbackContent {
  strengths: string[];
  improvements: string[];
  summary: string | null;
}

// Score delta between two attempts
export interface ScoreDelta {
  overall: number | null;
  structure: number | null;
  clarity: number | null;
  insight: number | null;
  communication: number | null;
  leadership: number | null;
}

// UI state for comparison page
export interface ComparisonUIState {
  selectedSession1: string | null;
  selectedSession2: string | null;
  loading: boolean;
  error: string | null;
}
