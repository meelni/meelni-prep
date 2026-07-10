import { db } from "./index";
import { feedback } from "./schema";
import { eq } from "drizzle-orm";

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
