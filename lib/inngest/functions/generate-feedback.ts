/**
 * Feedback Generation Inngest Worker
 * P1-003: Background job for evaluating interview sessions with GPT-4
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { feedback, interviewSession, transcriptTurn } from "@/lib/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  SessionTier,
  validateSessionCompleteness,
} from "@/lib/evaluation/session-validator";
import { generateFeedback as generateFeedbackWithGPT4 } from "@/lib/evaluation/scorer";
import { getEvaluationFailureReason } from "@/lib/evaluation/failure-reason";
import { resolveFeedbackGenerationEligibility } from "@/lib/workflows/feedback-generation-evidence";
import {
  prepareFeedbackTranscript,
  type FeedbackV2Result,
  type PreparedFeedbackTranscript,
} from "@meelni/core";

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
): Promise<PreparedFeedbackTranscript> {
  const turns = await db.query.transcriptTurn.findMany({
    where: eq(transcriptTurn.sessionId, sessionId),
    orderBy: [
      asc(transcriptTurn.startedAt),
      asc(transcriptTurn.writerId),
      asc(transcriptTurn.sequence),
      asc(transcriptTurn.eventId),
      asc(transcriptTurn.id),
    ],
  });

  return prepareFeedbackTranscript(turns, { requireContractV2: true });
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
    concurrency: [{ limit: 1, key: "event.data.sessionId" }],
    onFailure: async ({ event, step }) => {
      const failedEvent = event.data.event;
      const sessionId = String(failedEvent.data?.sessionId ?? "");
      const eventId = String(failedEvent.id ?? "");
      if (!sessionId || !eventId) return;
      await step.run("mark-feedback-generation-exhausted", async () => {
        await db
          .update(feedback)
          .set({
            status: "failed",
            statusReason: getEvaluationFailureReason(event.data.error),
          })
          .where(
            and(
              eq(feedback.sessionId, sessionId),
              eq(feedback.dispatchEventId, eventId),
              inArray(feedback.status, ["pending", "processing"])
            )
          );
      });
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

    await step.run("validate-dispatch-identity", async () => {
      const feedbackRecord = await db.query.feedback.findFirst({
        where: eq(feedback.sessionId, sessionId),
      });
      if (
        feedbackRecord?.dispatchStatus === "not_required" &&
        !feedbackRecord.dispatchEventId
      ) {
        return { validated: true, legacy: true };
      }
      if (!feedbackRecord?.dispatchEventId) {
        throw new Error(`Feedback dispatch identity missing for ${sessionId}`);
      }
      if (event.id !== feedbackRecord.dispatchEventId) {
        throw new Error(`Feedback dispatch identity mismatch for ${sessionId}`);
      }
      return { validated: true };
    });

    const generationClaim = await step.run(
      "claim-feedback-generation",
      async () => {
        const claimed = await db
          .update(feedback)
          .set({
            status: "processing",
            statusReason: null,
            processingStartedAt: new Date(),
            dispatchStatus: sql`CASE
              WHEN ${feedback.dispatchStatus} = 'not_required' THEN 'sent'
              ELSE ${feedback.dispatchStatus}
            END`,
            dispatchEventId: sql`COALESCE(${feedback.dispatchEventId}, ${event.id})`,
            dispatchAttempts: sql`CASE
              WHEN ${feedback.dispatchStatus} = 'not_required'
                THEN GREATEST(${feedback.dispatchAttempts}, 1)
              ELSE ${feedback.dispatchAttempts}
            END`,
            dispatchedAt: sql`CASE
              WHEN ${feedback.dispatchStatus} = 'not_required'
                THEN COALESCE(${feedback.dispatchedAt}, now())
              ELSE ${feedback.dispatchedAt}
            END`,
          })
          .where(
            and(
              inArray(feedback.status, ["pending", "failed"]),
              eq(feedback.sessionId, sessionId)
            )
          )
          .returning({ status: feedback.status });
        if (claimed[0]) return { claimed: true, status: claimed[0].status };

        const current = await db.query.feedback.findFirst({
          where: eq(feedback.sessionId, sessionId),
        });
        return { claimed: false, status: current?.status ?? "missing" };
      }
    );

    if (!generationClaim.claimed) {
      return {
        status: generationClaim.status,
        sessionId,
        idempotent: true,
      };
    }

    // Step 1: Consume the eligibility decision committed atomically with the
    // terminal session. Revalidating here could contradict the stored outcome
    // after late transcript writes or a validator-rule deployment.
    const completionEvidence = await step.run(
      "read-completion-evidence",
      async () => {
        const record = await db.query.feedback.findFirst({
          where: eq(feedback.sessionId, sessionId),
        });
        if (!record) throw new Error(`Feedback ${sessionId} not found`);
        return {
          tier: record.completionTier,
          stats: record.completionStats,
        };
      }
    );
    const eligibility = resolveFeedbackGenerationEligibility(
      completionEvidence.tier
    );
    let evaluationTier: SessionTier;
    if (eligibility.disposition === "committed_eligible") {
      evaluationTier = eligibility.tier;
    } else if (eligibility.disposition === "legacy_requires_validation") {
      const legacyValidation = await step.run(
        "validate-legacy-session",
        async () => validateSessionCompleteness(sessionId)
      );
      if (legacyValidation.isValid) {
        evaluationTier = legacyValidation.tier;
      } else {
        await step.run("mark-skipped-legacy-session", async () => {
          await db
            .update(feedback)
            .set({
              status: "skipped",
              statusReason: legacyValidation.reasons.join(", "),
            })
            .where(eq(feedback.sessionId, sessionId));
        });
        return {
          status: "skipped",
          reason: legacyValidation.reasons[0],
          tier: legacyValidation.tier,
        };
      }
    } else {
      await step.run("mark-skipped-invalid-evidence", async () => {
        await db
          .update(feedback)
          .set({
            status: "skipped",
            statusReason: "Session is not eligible for feedback",
          })
          .where(eq(feedback.sessionId, sessionId));
      });
      return {
        status: "skipped",
        reason: "Session is not eligible for feedback",
        tier: eligibility.tier,
      };
    }

    // Step 2: Fetch session data and transcript
    const sessionData = await step.run("fetch-session-data", async () => {
      return await fetchSessionData(sessionId);
    });

    const transcriptEvidence = await step.run("fetch-transcript", async () => {
      return await fetchSessionTranscript(sessionId);
    });

    if (
      !transcriptEvidence.eligible ||
      transcriptEvidence.transcript.length === 0
    ) {
      const reason =
        transcriptEvidence.reasons[0] || "No usable transcript evidence found";
      await step.run("mark-skipped-untrusted-transcript", async () => {
        await db
          .update(feedback)
          .set({
            status: "skipped",
            statusReason: reason,
            completionTier: "insufficient",
          })
          .where(eq(feedback.sessionId, sessionId));
      });

      return {
        status: "skipped",
        reason,
        tier: "insufficient",
      };
    }

    if (evaluationTier !== "full" && evaluationTier !== "partial") {
      throw new Error(
        `Unsupported feedback evaluation tier: ${evaluationTier}`
      );
    }

    // Step 3: Evaluate with GPT-4
    const evaluation: FeedbackV2Result & {
      processingDurationMs: number;
    } = await step.run("evaluate-session", async () => {
      const startTime = Date.now();

      // Call the real GPT-4 evaluation service
      const result = await generateFeedbackWithGPT4(
        sessionData.roundType || "product_sense",
        transcriptEvidence.transcript,
        evaluationTier
      );

      const processingDuration = Date.now() - startTime;

      return {
        ...result,
        processingDurationMs: processingDuration,
      };
    });

    // Step 4: Save feedback
    await step.run("save-feedback", async () => {
      await db
        .update(feedback)
        .set({
          status: "completed",
          overallScore: evaluation.overallScore.toString(),
          structureScore: evaluation.scores.structure,
          clarityScore: evaluation.scores.clarity,
          insightScore: evaluation.scores.insight,
          communicationScore: evaluation.scores.communication,
          leadershipScore: evaluation.scores.leadership,
          strengths: evaluation.strengths,
          improvements: evaluation.improvements,
          drills: evaluation.drills,
          summary: evaluation.summary,
          processingDurationMs: evaluation.processingDurationMs,
          schemaVersion: evaluation.schemaVersion,
          promptVersion: evaluation.promptVersion,
          modelVersion: evaluation.modelVersion,
          rubricVersion: evaluation.rubricVersion,
          evaluationState: evaluation.evaluationState,
        })
        .where(eq(feedback.sessionId, sessionId));
    });

    // Step 5: Trigger insights update (Phase 2)
    await step.sendEvent("trigger-insights-update", {
      name: "insights/update.requested",
      data: { userId, sessionId },
    });

    return {
      status: "completed",
      sessionId,
      tier: evaluationTier,
      overallScore: evaluation.overallScore,
    };
  }
);
