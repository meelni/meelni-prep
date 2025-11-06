import { db } from "./index";
import { feedback } from "./schema";
import { eq } from "drizzle-orm";

export interface CreateFeedbackInput {
  sessionId: string;
  structureScore: number;
  clarityScore: number;
  insightScore: number;
  communicationScore: number;
  leadershipScore: number;
  overallScore: number;
  strengths: string[];
  improvements: string[];
  drills: string[];
  summary: string;
}

/**
 * Create feedback for a session
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
      createdAt: new Date(),
    })
    .returning();

  return feedbackRecord;
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
      ...(input.structureScore !== undefined && { structureScore: input.structureScore }),
      ...(input.clarityScore !== undefined && { clarityScore: input.clarityScore }),
      ...(input.insightScore !== undefined && { insightScore: input.insightScore }),
      ...(input.communicationScore !== undefined && { communicationScore: input.communicationScore }),
      ...(input.leadershipScore !== undefined && { leadershipScore: input.leadershipScore }),
      ...(input.overallScore !== undefined && { overallScore: input.overallScore.toString() }),
      ...(input.strengths && { strengths: input.strengths }),
      ...(input.improvements && { improvements: input.improvements }),
      ...(input.drills && { drills: input.drills }),
      ...(input.summary && { summary: input.summary }),
    })
    .where(eq(feedback.sessionId, sessionId))
    .returning();

  return updated;
}
