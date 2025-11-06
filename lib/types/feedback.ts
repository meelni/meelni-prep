// Type definitions for feedback data structures

export interface RubricScores {
  structure: number; // 0-10
  clarity: number; // 0-10
  insight: number; // 0-10
  communication: number; // 0-10
  leadership: number; // 0-10
}

export interface Strength {
  title: string;
  description: string;
  evidence: string; // Quote from transcript
}

export interface Improvement {
  title: string;
  description: string;
  example: string;
}

export interface Drill {
  title: string;
  description: string;
  duration: string; // e.g., "15 min"
}

export interface FeedbackData {
  sessionId: string;
  overallScore: number; // 0-10
  rubricScores: RubricScores;
  strengths: Strength[];
  improvements: Improvement[];
  drills: Drill[];
  summary: string; // Overall feedback summary
}

export interface TranscriptTurn {
  id: string;
  speaker: "user" | "interviewer";
  text: string;
  timestamp: string; // ISO 8601
  highlighted?: boolean;
}

export interface SessionWithTranscript {
  feedback: FeedbackData;
  transcript: TranscriptTurn[];
}

// Rubric dimension descriptions
export const RUBRIC_DESCRIPTIONS: Record<keyof RubricScores, string> = {
  structure: "Organized thinking with clear frameworks",
  clarity: "Clear communication and articulation",
  insight: "Deep analysis and creative solutions",
  communication: "Effective verbal and non-verbal skills",
  leadership: "Decision-making and strategic thinking",
};
