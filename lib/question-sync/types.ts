import type { CanonicalQuestionType } from "@meelni/core";

export type QuestionStorageType =
  | Exclude<CanonicalQuestionType, "Strategy">
  | "Product Strategy";

export interface ProcessedQuestion {
  company: string | null;
  questionText: string;
  questionType: QuestionStorageType;
  askedAt: Date | null;
}

export interface PreparedQuestionSync {
  questions: ProcessedQuestion[];
  sourceRows: number;
  validRows: number;
  questionsSkipped: number;
}

export interface SyncResult {
  success: boolean;
  questionsAdded: number;
  questionsUpdated: number;
  questionsDeactivated: number;
  questionsSkipped: number;
  totalProcessed: number;
  errors: number;
  errorMessages?: string[];
  timestamp: string;
}
