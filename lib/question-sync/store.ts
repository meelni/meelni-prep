import { inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { interviewQuestion } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import type {
  QuestionSyncQuestion,
  StoredQuestionSyncQuestion,
} from "@/lib/question-sync/source";

export interface QuestionSyncStore {
  listQuestions(): Promise<StoredQuestionSyncQuestion[]>;
  insertQuestions(questions: readonly QuestionSyncQuestion[]): Promise<void>;
  setQuestionsActive(ids: readonly string[], isActive: boolean): Promise<void>;
}

export function createQuestionSyncStore(
  database: PostgresJsDatabase<typeof schema>
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
          isActive: interviewQuestion.isActive,
        })
        .from(interviewQuestion);
    },

    async insertQuestions(questions) {
      if (questions.length === 0) return;
      await database.insert(interviewQuestion).values(
        questions.map((question) => ({
          company: question.company,
          questionText: question.questionText,
          questionType: question.questionType,
          askedAt: question.askedAt,
          isActive: true,
        }))
      );
    },

    async setQuestionsActive(ids, isActive) {
      if (ids.length === 0) return;
      await database
        .update(interviewQuestion)
        .set({ isActive })
        .where(inArray(interviewQuestion.id, [...ids]));
    },
  };
}
