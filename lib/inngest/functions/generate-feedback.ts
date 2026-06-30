/**
 * Feedback Generation Inngest Worker
 * P1-003: Background job for evaluating interview sessions with GPT-4
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { feedback, interviewSession, transcriptTurn } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  validateSessionCompleteness,
  SessionTier,
} from "@/lib/evaluation/session-validator";
import { generateFeedback as generateFeedbackWithGPT4 } from "@/lib/evaluation/scorer";
import { getEvaluationFailureReason } from "@/lib/evaluation/failure-reason";

/**
 * Feedback generation event payload
 */
interface FeedbackGenerationEvent {
  data: {
    sessionId: string;
    userId: string;
    tier?: SessionTier;
  };
}

/**
 * Fetch session data including round type
 */
async function fetchSessionData(sessionId: string) {
  const session = await db.query.interviewSession.findFirst({
    where: eq(interviewSession.id, sessionId),
  });

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  return session;
}

/**
 * Fetch and format session transcript
 */
async function fetchSessionTranscript(
  sessionId: string
): Promise<{ speaker: string; text: string }[]> {
  const turns = await db.query.transcriptTurn.findMany({
    where: eq(transcriptTurn.sessionId, sessionId),
    orderBy: [desc(transcriptTurn.startedAt)],
  });

  return turns
    .reverse() // Oldest first
    .filter((turn) => turn.text !== null)
    .map((turn) => ({
      speaker: turn.speaker,
      text: turn.text!,
    }));
}

/**
 * Inngest Function: Generate Feedback for Interview Session
 *
 * This function is triggered after an interview session ends.
 * It validates the session, evaluates the transcript with GPT-4,
 * and stores the feedback in the database.
 *
 * Steps:
 * 1. Validate session completeness
 * 2. Skip if session doesn't meet minimum requirements
 * 3. Fetch transcript from database
 * 4. Evaluate with GPT-4 Turbo (with retry logic)
 * 5. Save feedback to database
 * 6. Trigger insights update (future: P2-003)
 */
export const generateFeedback = inngest.createFunction(
  {
    id: "feedback-generate",
    name: "Generate Interview Feedback",
    retries: 2, // Retry up to 2 times on failure
    throttle: {
      limit: 10, // Max 10 concurrent executions
      period: "1m", // Per minute
    },
  },
  { event: "feedback/generate.requested" },
  async ({ event, step }) => {
    const { sessionId, userId } = event.data as FeedbackGenerationEvent["data"];

    // Step 0: Security check - validate userId matches session owner
    await step.run("validate-user-ownership", async () => {
      const session = await db.query.interviewSession.findFirst({
        where: eq(interviewSession.id, sessionId),
      });

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (session.userId !== userId) {
        throw new Error(
          `Security violation: userId ${userId} does not own session ${sessionId} (owner: ${session.userId})`
        );
      }

      return { validated: true };
    });

    // Step 1: Validate session
    const validation = await step.run("validate-session", async () => {
      return await validateSessionCompleteness(sessionId);
    });

    if (!validation.isValid) {
      // Update existing feedback to skipped (record already created by /api/interview/end)
      await step.run("mark-skipped", async () => {
        await db
          .update(feedback)
          .set({
            status: "skipped",
            statusReason: validation.reasons.join(", "),
          })
          .where(eq(feedback.sessionId, sessionId));
      });

      return {
        status: "skipped",
        reason: validation.reasons[0],
        tier: validation.tier,
      };
    }

    // Step 2: Update session with stats
    await step.run("update-session-stats", async () => {
      await db
        .update(interviewSession)
        .set({
          status: "completed",
          totalTurns: validation.stats.totalTurns,
          totalWords: validation.stats.totalWords,
          durationSeconds: validation.stats.durationSeconds,
        })
        .where(eq(interviewSession.id, sessionId));
    });

    // Step 3: Fetch session data and transcript
    const sessionData = await step.run("fetch-session-data", async () => {
      return await fetchSessionData(sessionId);
    });

    const transcript = await step.run("fetch-transcript", async () => {
      return await fetchSessionTranscript(sessionId);
    });

    if (!transcript || transcript.length === 0) {
      await step.run("mark-failed-no-transcript", async () => {
        await db
          .update(feedback)
          .set({
            status: "failed",
            statusReason: "No transcript data found",
          })
          .where(eq(feedback.sessionId, sessionId));
      });

      return {
        status: "failed",
        reason: "No transcript data",
      };
    }

    // Step 4: Update feedback to processing status
    await step.run("update-feedback-processing", async () => {
      await db
        .update(feedback)
        .set({
          status: "processing",
          processingStartedAt: new Date(),
        })
        .where(eq(feedback.sessionId, sessionId));
    });

    // Step 5: Evaluate with GPT-4
    let evaluation: {
      overall_score: number;
      structure_score: number;
      clarity_score: number;
      insight_score: number;
      communication_score: number;
      leadership_score: number;
      strengths: string[];
      improvements: string[];
      drills: string[];
      summary: string;
      processingDurationMs: number;
    };

    try {
      evaluation = await step.run("evaluate-session", async () => {
        const startTime = Date.now();

        // Call the real GPT-4 evaluation service
        const result = await generateFeedbackWithGPT4(
          sessionData.roundType || "product_sense",
          transcript
        );

        const processingDuration = Date.now() - startTime;

        return {
          overall_score: result.overall_score,
          structure_score: result.scores.structure,
          clarity_score: result.scores.clarity,
          insight_score: result.scores.insight,
          communication_score: result.scores.communication,
          leadership_score: result.scores.leadership,
          strengths: result.strengths,
          improvements: result.improvements,
          drills: result.drills,
          summary: result.summary,
          processingDurationMs: processingDuration,
        };
      });
    } catch (error) {
      await step.run("mark-failed-evaluation", async () => {
        await db
          .update(feedback)
          .set({
            status: "failed",
            statusReason: getEvaluationFailureReason(error),
          })
          .where(eq(feedback.sessionId, sessionId));
      });

      throw error;
    }

    // Step 6: Save feedback
    await step.run("save-feedback", async () => {
      await db
        .update(feedback)
        .set({
          status: "completed",
          overallScore: evaluation.overall_score.toString(),
          structureScore: evaluation.structure_score,
          clarityScore: evaluation.clarity_score,
          insightScore: evaluation.insight_score,
          communicationScore: evaluation.communication_score,
          leadershipScore: evaluation.leadership_score,
          strengths: evaluation.strengths,
          improvements: evaluation.improvements,
          drills: evaluation.drills,
          summary: evaluation.summary,
          processingDurationMs: evaluation.processingDurationMs,
          rubricVersion: "1.0.0",
        })
        .where(eq(feedback.sessionId, sessionId));
    });

    // Step 7: Trigger insights update (Phase 2)
    await step.sendEvent("trigger-insights-update", {
      name: "insights/update.requested",
      data: { userId, sessionId },
    });

    return {
      status: "completed",
      sessionId,
      tier: validation.tier,
      overallScore: evaluation.overall_score,
    };
  }
);
