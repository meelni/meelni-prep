import { db } from "./index";
import { interviewQuestion } from "./schema";
import { eq, and, or, sql, gte, lte, inArray } from "drizzle-orm";
import {
  canonicalQuestionTypeLabel,
  normalizeQuestionRound,
  questionTypeStorageAliasesForRound,
  type RoundType,
} from "@meelni/core";

export interface QuestionBankRecord {
  id: string;
  company: string | null;
  questionText: string;
  questionType: string;
  askedAt: Date | null;
  isActive: boolean;
  createdAt: Date | null;
}

export interface QuestionListOptions {
  roundType?: RoundType;
  limit?: number;
  offset?: number;
  search?: string;
}

export interface QuestionListFilter {
  questionTypes?: readonly string[];
  search?: string;
}

export interface QuestionListStore {
  findMany(
    filter: QuestionListFilter,
    pagination: { limit: number; offset: number }
  ): Promise<QuestionBankRecord[]>;
  count(filter: QuestionListFilter): Promise<number>;
}

function buildQuestionListConditions(filter: QuestionListFilter) {
  const conditions = [];

  conditions.push(eq(interviewQuestion.isActive, true));

  if (filter.questionTypes?.length === 1) {
    conditions.push(
      eq(interviewQuestion.questionType, filter.questionTypes[0])
    );
  } else if (filter.questionTypes && filter.questionTypes.length > 1) {
    conditions.push(
      inArray(interviewQuestion.questionType, [...filter.questionTypes])
    );
  }

  if (filter.search?.trim()) {
    const pattern = `%${escapeLikePattern(filter.search.trim())}%`;
    conditions.push(
      or(
        sql`${interviewQuestion.questionText} ILIKE ${pattern} ESCAPE '\\'`,
        sql`${interviewQuestion.company} ILIKE ${pattern} ESCAPE '\\'`
      )!
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

const drizzleQuestionListStore: QuestionListStore = {
  async findMany(filter, pagination) {
    return db
      .select({
        id: interviewQuestion.id,
        company: interviewQuestion.company,
        questionText: interviewQuestion.questionText,
        questionType: interviewQuestion.questionType,
        askedAt: interviewQuestion.askedAt,
        isActive: interviewQuestion.isActive,
        createdAt: interviewQuestion.createdAt,
      })
      .from(interviewQuestion)
      .where(buildQuestionListConditions(filter))
      .orderBy(
        sql`${interviewQuestion.askedAt} DESC NULLS LAST`,
        interviewQuestion.id
      )
      .limit(pagination.limit)
      .offset(pagination.offset);
  },

  async count(filter) {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(interviewQuestion)
      .where(buildQuestionListConditions(filter));

    return Number(result[0]?.count || 0);
  },
};

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function canonicalizeQuestionRecord(
  question: QuestionBankRecord
): QuestionBankRecord {
  const canonicalType = canonicalQuestionTypeLabel(question.questionType);
  return canonicalType
    ? { ...question, questionType: canonicalType }
    : question;
}

function resolveStoredQuestionTypes(
  questionType?: string | readonly string[]
): string[] | undefined {
  if (!questionType) return undefined;

  const values = Array.isArray(questionType) ? questionType : [questionType];
  return [
    ...new Set(
      values.flatMap((value) => {
        const roundType = normalizeQuestionRound(value);
        return roundType
          ? questionTypeStorageAliasesForRound(roundType)
          : [value];
      })
    ),
  ];
}

/**
 * Get a random active question, optionally filtered by type
 * Supports multiple question types via array or comma-separated string
 */
export async function getRandomQuestion(
  questionType?: string | string[]
): Promise<QuestionBankRecord | null> {
  const conditions = [eq(interviewQuestion.isActive, true)];

  const types = resolveStoredQuestionTypes(
    typeof questionType === "string"
      ? questionType.split(",").map((type) => type.trim())
      : questionType
  );
  if (types) {
    if (types.length === 1) {
      conditions.push(eq(interviewQuestion.questionType, types[0]));
    } else {
      conditions.push(inArray(interviewQuestion.questionType, types));
    }
  }

  const [question] = await db
    .select({
      id: interviewQuestion.id,
      company: interviewQuestion.company,
      questionText: interviewQuestion.questionText,
      questionType: interviewQuestion.questionType,
      askedAt: interviewQuestion.askedAt,
      isActive: interviewQuestion.isActive,
      createdAt: interviewQuestion.createdAt,
    })
    .from(interviewQuestion)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(sql`RANDOM()`)
    .limit(1);

  return question ? canonicalizeQuestionRecord(question) : null;
}

/**
 * Get all questions with optional filtering and pagination
 */
export async function getPublishedQuestions(
  options: QuestionListOptions = {},
  store: QuestionListStore = drizzleQuestionListStore
): Promise<{ questions: QuestionBankRecord[]; total: number }> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const filter: QuestionListFilter = {
    search: options.search,
    questionTypes: options.roundType
      ? questionTypeStorageAliasesForRound(options.roundType)
      : undefined,
  };

  // Rows and total deliberately share the same filter. The store applies that
  // filter before LIMIT/OFFSET so totals describe the complete filtered set.
  const [questions, total] = await Promise.all([
    store.findMany(filter, { limit, offset }),
    store.count(filter),
  ]);

  return {
    questions: questions.map(canonicalizeQuestionRecord),
    total,
  };
}

/** Public lookup for a question that is currently eligible for new practice. */
export async function getActiveQuestionById(
  questionId: string
): Promise<QuestionBankRecord | null> {
  return findQuestionById(questionId, true);
}

/** Internal historical lookup. Never use this for public reads or new practice. */
export async function getQuestionByIdForHistory(
  questionId: string
): Promise<QuestionBankRecord | null> {
  return findQuestionById(questionId, false);
}

async function findQuestionById(
  questionId: string,
  activeOnly: boolean
): Promise<QuestionBankRecord | null> {
  const [question] = await db
    .select({
      id: interviewQuestion.id,
      company: interviewQuestion.company,
      questionText: interviewQuestion.questionText,
      questionType: interviewQuestion.questionType,
      askedAt: interviewQuestion.askedAt,
      isActive: interviewQuestion.isActive,
      createdAt: interviewQuestion.createdAt,
    })
    .from(interviewQuestion)
    .where(
      activeOnly
        ? and(
            eq(interviewQuestion.id, questionId),
            eq(interviewQuestion.isActive, true)
          )
        : eq(interviewQuestion.id, questionId)
    )
    .limit(1);

  return question ? canonicalizeQuestionRecord(question) : null;
}

/**
 * Get count of active questions by type
 */
export async function getActiveQuestionCount(
  questionType?: RoundType
): Promise<number> {
  const conditions = [eq(interviewQuestion.isActive, true)];

  if (questionType) {
    conditions.push(
      inArray(interviewQuestion.questionType, [
        ...questionTypeStorageAliasesForRound(questionType),
      ])
    );
  }

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviewQuestion)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0]);

  return Number(countResult[0]?.count || 0);
}

/**
 * Get recent questions (asked within the last N days)
 */
export async function getRecentQuestions(
  days = 365,
  questionType?: string,
  limit = 10
): Promise<QuestionBankRecord[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const conditions = [
    eq(interviewQuestion.isActive, true),
    gte(interviewQuestion.askedAt, cutoffDate),
  ];

  const questionTypes = resolveStoredQuestionTypes(questionType);
  if (questionTypes) {
    conditions.push(inArray(interviewQuestion.questionType, questionTypes));
  }

  const questions = await db
    .select({
      id: interviewQuestion.id,
      company: interviewQuestion.company,
      questionText: interviewQuestion.questionText,
      questionType: interviewQuestion.questionType,
      askedAt: interviewQuestion.askedAt,
      isActive: interviewQuestion.isActive,
      createdAt: interviewQuestion.createdAt,
    })
    .from(interviewQuestion)
    .where(and(...conditions))
    .orderBy(sql`${interviewQuestion.askedAt} DESC`)
    .limit(limit);

  return questions.map(canonicalizeQuestionRecord);
}

/**
 * Get questions asked in a specific date range
 */
export async function getQuestionsByDateRange(
  startDate: Date,
  endDate: Date,
  questionType?: string
): Promise<QuestionBankRecord[]> {
  const conditions = [
    eq(interviewQuestion.isActive, true),
    gte(interviewQuestion.askedAt, startDate),
    lte(interviewQuestion.askedAt, endDate),
  ];

  const questionTypes = resolveStoredQuestionTypes(questionType);
  if (questionTypes) {
    conditions.push(inArray(interviewQuestion.questionType, questionTypes));
  }

  const questions = await db
    .select({
      id: interviewQuestion.id,
      company: interviewQuestion.company,
      questionText: interviewQuestion.questionText,
      questionType: interviewQuestion.questionType,
      askedAt: interviewQuestion.askedAt,
      isActive: interviewQuestion.isActive,
      createdAt: interviewQuestion.createdAt,
    })
    .from(interviewQuestion)
    .where(and(...conditions))
    .orderBy(sql`${interviewQuestion.askedAt} DESC`);

  return questions.map(canonicalizeQuestionRecord);
}

/**
 * Get a random question from the most recent questions (trending/current)
 * Supports multiple question types via array or comma-separated string
 */
export async function getRandomRecentQuestion(
  days = 365,
  questionType?: string | string[]
): Promise<QuestionBankRecord | null> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const conditions = [
    eq(interviewQuestion.isActive, true),
    gte(interviewQuestion.askedAt, cutoffDate),
  ];

  const types = resolveStoredQuestionTypes(
    typeof questionType === "string"
      ? questionType.split(",").map((type) => type.trim())
      : questionType
  );
  if (types) {
    if (types.length === 1) {
      conditions.push(eq(interviewQuestion.questionType, types[0]));
    } else {
      conditions.push(inArray(interviewQuestion.questionType, types));
    }
  }

  const [question] = await db
    .select({
      id: interviewQuestion.id,
      company: interviewQuestion.company,
      questionText: interviewQuestion.questionText,
      questionType: interviewQuestion.questionType,
      askedAt: interviewQuestion.askedAt,
      isActive: interviewQuestion.isActive,
      createdAt: interviewQuestion.createdAt,
    })
    .from(interviewQuestion)
    .where(and(...conditions))
    .orderBy(sql`RANDOM()`)
    .limit(1);

  return question ? canonicalizeQuestionRecord(question) : null;
}

/**
 * Record that a question was used in a session
 */
export async function recordQuestionUsage(
  sessionId: string,
  questionId: string
): Promise<void> {
  const { sessionQuestion } = await import("./schema");

  try {
    await db.insert(sessionQuestion).values({
      sessionId,
      questionId,
    });
  } catch (error) {
    // Ignore duplicate errors (question already recorded for this session)
    console.error("Error recording question usage:", error);
  }
}
