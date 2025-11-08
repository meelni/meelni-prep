/**
 * Feedback Generation Inngest Worker
 * P1-003: Background job for evaluating interview sessions with GPT-4
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { feedback, interviewSession, transcriptTurn } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { validateSessionCompleteness, SessionTier } from "@/lib/evaluation/session-validator";

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
 * Generate feedback using GPT-4 Turbo
 * TODO: Implement actual GPT-4 evaluation logic in Phase 1 (P1-003)
 */
async function evaluateWithGPT4(transcript: string, tier: SessionTier) {
  // Placeholder for GPT-4 evaluation
  // In production, this will call OpenAI API with evaluation prompt

  // For now, return mock data structure
  return {
    overall_score: 7.5,
    structure_score: 8,
    clarity_score: 7,
    insight_score: 7,
    communication_score: 8,
    leadership_score: 7,
    strengths: ["Clear communication", "Good structure"],
    improvements: ["Add more data-driven insights", "Deeper analysis needed"],
    drills: ["Practice CIRCLES framework", "Work on metric selection"],
    summary: `This ${tier} session shows solid performance with room for growth.`,
  };
}

/**
 * Fetch and format session transcript
 */
async function fetchSessionTranscript(sessionId: string): Promise<string> {
  const turns = await db.query.transcriptTurn.findMany({
    where: eq(transcriptTurn.sessionId, sessionId),
    orderBy: [desc(transcriptTurn.startedAt)],
  });

  return turns
    .reverse() // Oldest first
    .map((turn) => `${turn.speaker.toUpperCase()}: ${turn.text}`)
    .join("\n\n");
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

    // Step 1: Validate session
    const validation = await step.run("validate-session", async () => {
      return await validateSessionCompleteness(sessionId);
    });

    if (!validation.isValid) {
      // Mark as skipped with reason
      await step.run("mark-skipped", async () => {
        await db.insert(feedback).values({
          sessionId: sessionId,
          status: "skipped",
          statusReason: validation.reasons.join(", "),
          rubricVersion: "1.0.0",
        });
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

    // Step 3: Fetch transcript
    const transcript = await step.run("fetch-transcript", async () => {
      return await fetchSessionTranscript(sessionId);
    });

    if (!transcript || transcript.length === 0) {
      await step.run("mark-failed-no-transcript", async () => {
        await db.insert(feedback).values({
          sessionId: sessionId,
          status: "failed",
          statusReason: "No transcript data found",
          rubricVersion: "1.0.0",
        });
      });

      return {
        status: "failed",
        reason: "No transcript data",
      };
    }

    // Step 4: Create pending feedback record
    await step.run("create-pending-feedback", async () => {
      await db.insert(feedback).values({
        sessionId: sessionId,
        status: "processing",
        processingStartedAt: new Date(),
        rubricVersion: "1.0.0",
      });
    });

    // Step 5: Evaluate with GPT-4
    const evaluation = await step.run(
      "evaluate-session",
      async () => {
        const startTime = Date.now();
        const result = await evaluateWithGPT4(transcript, validation.tier);
        const processingDuration = Date.now() - startTime;

        return {
          ...result,
          processingDurationMs: processingDuration,
        };
      }
    );

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
    // TODO: Uncomment when P2-003 is implemented
    /*
    await step.sendEvent("trigger-insights-update", {
      name: "insights/update.requested",
      data: { userId, sessionId },
    });
    */

    return {
      status: "completed",
      sessionId,
      tier: validation.tier,
      overallScore: evaluation.overall_score,
    };
  }
);
