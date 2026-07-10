import { db } from "./index";
import { feedback } from "./schema";
import { eq } from "drizzle-orm";
import type { FeedbackEvaluationState, FeedbackV2Item } from "@meelni/core";

export interface CreateFeedbackInput {
  sessionId: string;
  structureScore: number;
  clarityScore: number;
  insightScore: number;
  communicationScore: number;
  leadershipScore: number;
  overallScore: number;
  strengths: string[] | FeedbackV2Item[];
  improvements: string[] | FeedbackV2Item[];
  drills: string[];
  summary: string;
  schemaVersion?: string;
  promptVersion?: string;
  modelVersion?: string;
  rubricVersion?: string;
  evaluationState?: FeedbackEvaluationState;
}

/**
 * Create feedback for a session with status tracking
 */
export async function createFeedback(input: CreateFeedbackInput) {
  const [feedbackRecord] = await db
    .insert(feedback)
    .values({
      sessionId: input.sessionId,
      structureScore: input.structureScore,
      clarityScore: input.clarityScore,
      insightScore: input.insightScore,
      communicationScore: input.communicationScore,
      leadershipScore: input.leadershipScore,
      overallScore: input.overallScore.toString(),
      strengths: input.strengths,
      improvements: input.improvements,
      drills: input.drills,
      summary: input.summary,
      schemaVersion: input.schemaVersion,
      promptVersion: input.promptVersion,
      modelVersion: input.modelVersion,
      rubricVersion: input.rubricVersion,
      evaluationState: input.evaluationState,
      status: "completed",
      createdAt: new Date(),
    })
    .returning();

  return feedbackRecord;
}

/**
 * Create pending feedback record (for async processing)
 */
export async function createPendingFeedback(sessionId: string) {
  const [feedbackRecord] = await db
    .insert(feedback)
    .values({
      sessionId,
      status: "pending",
      createdAt: new Date(),
    })
    .returning();

  return feedbackRecord;
}

/**
 * Update feedback status
 */
export async function updateFeedbackStatus(
  sessionId: string,
  status: "pending" | "processing" | "completed" | "failed" | "skipped",
  statusReason?: string,
  processingStartedAt?: Date,
  processingDurationMs?: number
) {
  const [updated] = await db
    .update(feedback)
    .set({
      status,
      ...(statusReason && { statusReason }),
      ...(processingStartedAt && { processingStartedAt }),
      ...(processingDurationMs !== undefined && { processingDurationMs }),
    })
    .where(eq(feedback.sessionId, sessionId))
    .returning();

  return updated;
}

/**
 * Get feedback for a session
 */
export async function getFeedbackBySessionId(sessionId: string) {
  const [feedbackRecord] = await db
    .select()
    .from(feedback)
    .where(eq(feedback.sessionId, sessionId))
    .limit(1);

  return feedbackRecord;
}

/**
 * Check if feedback exists for a session
 */
export async function feedbackExists(sessionId: string): Promise<boolean> {
  const feedbackRecord = await getFeedbackBySessionId(sessionId);
  return !!feedbackRecord;
}

/**
 * Update feedback for a session (if regenerating)
 */
export async function updateFeedback(
  sessionId: string,
  input: Partial<CreateFeedbackInput>
) {
  const [updated] = await db
    .update(feedback)
    .set({
      ...(input.structureScore !== undefined && {
        structureScore: input.structureScore,
      }),
      ...(input.clarityScore !== undefined && {
        clarityScore: input.clarityScore,
      }),
      ...(input.insightScore !== undefined && {
        insightScore: input.insightScore,
      }),
      ...(input.communicationScore !== undefined && {
        communicationScore: input.communicationScore,
      }),
      ...(input.leadershipScore !== undefined && {
        leadershipScore: input.leadershipScore,
      }),
      ...(input.overallScore !== undefined && {
        overallScore: input.overallScore.toString(),
      }),
      ...(input.strengths && { strengths: input.strengths }),
      ...(input.improvements && { improvements: input.improvements }),
      ...(input.drills && { drills: input.drills }),
      ...(input.summary && { summary: input.summary }),
      ...(input.schemaVersion && { schemaVersion: input.schemaVersion }),
      ...(input.promptVersion && { promptVersion: input.promptVersion }),
      ...(input.modelVersion && { modelVersion: input.modelVersion }),
      ...(input.rubricVersion && { rubricVersion: input.rubricVersion }),
      ...(input.evaluationState && { evaluationState: input.evaluationState }),
    })
    .where(eq(feedback.sessionId, sessionId))
    .returning();

  return updated;
}
