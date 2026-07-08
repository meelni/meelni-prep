/**
 * Types for Framework Tracking and Nudge System
 * Workstream #7 - Real-time framework coverage analysis
 */

export type InterviewType =
  | "product_sense"
  | "execution"
  | "behavioral"
  | "analytical"
  | "leadership"
  | "strategy";

export interface FrameworkElement {
  id: string;
  name: string;
  keywords: string[];
  detected: boolean;
  firstMentionAt?: number; // timestamp in seconds
  timeSpent?: number; // seconds spent on this element
}

export interface InterviewFramework {
  type: InterviewType;
  elements: FrameworkElement[];
}

export interface FrameworkCoverage {
  interviewType: InterviewType;
  elements: FrameworkElement[];
  coveragePercentage: number; // 0-100
  currentElement: string | null; // which element user is currently on
  elapsedTime: number; // total time elapsed in seconds
}

export interface NudgeDecision {
  shouldNudge: boolean;
  nudgeType: "missing_element" | "time_limit" | "move_on" | "quantify" | "clarify" | null;
  message: string;
  priority: "low" | "medium" | "high";
  context?: {
    missingElements?: string[];
    currentElement?: string;
    timeOnCurrentElement?: number;
  };
}

export interface TranscriptTurn {
  id: string;
  speaker: "user" | "interviewer";
  text: string;
  timestamp: number; // Unix timestamp in milliseconds
  duration?: number; // duration in milliseconds
}

export interface NudgeRule {
  condition: (coverage: FrameworkCoverage) => boolean;
  nudgeType: NudgeDecision["nudgeType"];
  message: string;
  priority: NudgeDecision["priority"];
}
