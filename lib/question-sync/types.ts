import type { CanonicalQuestionType } from "@meelni/core";

export type QuestionStorageType =
  | Exclude<CanonicalQuestionType, "Strategy">
  | "Product Strategy";

export type QuestionSourceKind = "legacy" | "google_sheets";

export type QuestionQualityStatus =
  | "published"
  | "quarantined_unverified"
  | "quarantined_near_duplicate"
  | "retired_exact_duplicate"
  | "retired_source_missing";

export interface ProcessedQuestion {
  company: string | null;
  questionText: string;
  questionType: QuestionStorageType;
  askedAt: Date | null;
  sourceKind: "google_sheets";
  sourceCategory: string;
  sourceFingerprint: string;
}

export interface PreparedQuestionSync {
  questions: ProcessedQuestion[];
  sourceRows: number;
  validRows: number;
  invalidRows: number;
  exactDuplicateRows: number;
  questionsSkipped: number;
}

export interface SyncResult {
  success: boolean;
  questionsAdded: number;
  questionsUpdated: number;
  questionsDeactivated: number;
  questionsSkipped: number;
  invalidRows: number;
  exactDuplicateRows: number;
  nearDuplicateRowsQuarantined: number;
  duplicateRecordsRetired: number;
  totalProcessed: number;
  errors: number;
  errorMessages?: string[];
  timestamp: string;
}
