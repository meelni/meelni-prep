import { db } from "./index";
import { interviewQuestion } from "./schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";

export interface QuestionBankRecord {
  id: string;
  company: string | null;
  questionText: string;
  questionType: string;
  askedAt: Date | null;
  isActive: boolean;
  createdAt: Date | null;
}

/**
 * Get a random active question, optionally filtered by type
 * Supports multiple question types via array or comma-separated string
 */
export async function getRandomQuestion(
  questionType?: string | string[]
): Promise<QuestionBankRecord | null> {
  const conditions = [eq(interviewQuestion.isActive, true)];

  if (questionType) {
    const types = Array.isArray(questionType) ? questionType : questionType.split(',').map(t => t.trim());
    if (types.length === 1) {
      conditions.push(eq(interviewQuestion.questionType, types[0]));
    } else {
      conditions.push(sql`${interviewQuestion.questionType} IN (${sql.join(types.map(t => sql`${t}`), sql`, `)})`);
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

  return question || null;
}

/**
 * Get all questions with optional filtering and pagination
 */
export async function getQuestions(
  questionType?: "behavioral" | "product_sense" | "execution" | "strategy",
  limit = 100,
  offset = 0
): Promise<{ questions: QuestionBankRecord[]; total: number }> {
  // Build conditions
  const conditions = questionType
    ? [eq(interviewQuestion.questionType, questionType)]
    : [];

  // Get questions with pagination
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
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviewQuestion)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const total = Number(countResult[0]?.count || 0);

  return { questions, total };
}

/**
 * Get a question by ID
 */
export async function getQuestionById(
  questionId: string
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
    .where(eq(interviewQuestion.id, questionId))
    .limit(1);

  return question || null;
}

/**
 * Get count of active questions by type
 */
export async function getActiveQuestionCount(
  questionType?: "behavioral" | "product_sense" | "execution" | "strategy"
): Promise<number> {
  const conditions = [eq(interviewQuestion.isActive, true)];

  if (questionType) {
    conditions.push(eq(interviewQuestion.questionType, questionType));
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
    gte(interviewQuestion.askedAt, cutoffDate)
  ];

  if (questionType) {
    conditions.push(eq(interviewQuestion.questionType, questionType));
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

  return questions;
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
    lte(interviewQuestion.askedAt, endDate)
  ];

  if (questionType) {
    conditions.push(eq(interviewQuestion.questionType, questionType));
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

  return questions;
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
    gte(interviewQuestion.askedAt, cutoffDate)
  ];

  if (questionType) {
    const types = Array.isArray(questionType) ? questionType : questionType.split(',').map(t => t.trim());
    if (types.length === 1) {
      conditions.push(eq(interviewQuestion.questionType, types[0]));
    } else {
      conditions.push(sql`${interviewQuestion.questionType} IN (${sql.join(types.map(t => sql`${t}`), sql`, `)})`);
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

  return question || null;
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
