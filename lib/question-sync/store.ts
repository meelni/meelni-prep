import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { interviewQuestion } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import type {
  PlannedQuestionSyncRecord,
  StoredQuestionSyncQuestion,
} from "@/lib/question-sync/source";

type QuestionSyncDatabase = Pick<
  PostgresJsDatabase<typeof schema>,
  "select" | "insert" | "update"
>;

export interface QuestionSyncStore {
  listQuestions(): Promise<StoredQuestionSyncQuestion[]>;
  writeQuestions(
    questions: readonly PlannedQuestionSyncRecord[]
  ): Promise<void>;
}

export function createQuestionSyncStore(
  database: QuestionSyncDatabase
): QuestionSyncStore {
  return {
    async listQuestions() {
      return database
        .select({
          id: interviewQuestion.id,
          company: interviewQuestion.company,
          questionText: interviewQuestion.questionText,
          questionType: interviewQuestion.questionType,
          askedAt: interviewQuestion.askedAt,
          sourceKind: interviewQuestion.sourceKind,
          sourceCategory: interviewQuestion.sourceCategory,
          sourceFingerprint: interviewQuestion.sourceFingerprint,
          qualityStatus: interviewQuestion.qualityStatus,
          duplicateOfQuestionId: interviewQuestion.duplicateOfQuestionId,
          isActive: interviewQuestion.isActive,
        })
        .from(interviewQuestion);
    },

    async writeQuestions(questions) {
      if (questions.length === 0) return;
      await database
        .insert(interviewQuestion)
        .values(
          questions.map((question) => ({
            id: question.id,
            company: question.company,
            questionText: question.questionText,
            questionType: question.questionType,
            askedAt: question.askedAt,
            sourceKind: question.sourceKind,
            sourceCategory: question.sourceCategory,
            sourceFingerprint: question.sourceFingerprint,
            qualityStatus: question.qualityStatus,
            duplicateOfQuestionId: question.duplicateOfQuestionId,
            isActive: question.isActive,
          }))
        )
        .onConflictDoUpdate({
          target: interviewQuestion.id,
          set: {
            company: sql`excluded.company`,
            questionText: sql`excluded.question_text`,
            questionType: sql`excluded.question_type`,
            askedAt: sql`excluded.asked_at`,
            sourceKind: sql`excluded.source_kind`,
            sourceCategory: sql`excluded.source_category`,
            sourceFingerprint: sql`excluded.source_fingerprint`,
            qualityStatus: sql`excluded.quality_status`,
            duplicateOfQuestionId: sql`excluded.duplicate_of_question_id`,
            isActive: sql`excluded.is_active`,
          },
        });
    },
  };
}
