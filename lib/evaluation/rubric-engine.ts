import {
  prepareFeedbackTranscript,
  type FeedbackEvaluationState,
  type FeedbackV2Result,
} from "@meelni/core";
import { generateFeedback } from "./scorer";
import { validateSessionCompleteness } from "./session-validator";
import { getSessionById } from "@/lib/db/sessions";
import { getSessionTranscript } from "@/lib/db/transcripts";
import { createFeedback, getFeedbackBySessionId } from "@/lib/db/feedback";

export interface SessionEvaluation extends FeedbackV2Result {
  sessionId: string;
}

export async function evaluateSession(
  sessionId: string
): Promise<SessionEvaluation> {
  const session = await getSessionById(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const validation = await validateSessionCompleteness(sessionId);
  if (!validation.isValid || !isEvaluationState(validation.tier)) {
    throw new Error("Session is not eligible for feedback");
  }

  const prepared = prepareFeedbackTranscript(
    await getSessionTranscript(sessionId),
    { requireContractV2: true }
  );
  if (!prepared.eligible || prepared.transcript.length === 0) {
    throw new Error(
      prepared.reasons[0] ||
        "Cannot evaluate session without trustworthy transcript evidence"
    );
  }

  return {
    sessionId,
    ...(await generateFeedback(
      session.roundType,
      prepared.transcript,
      validation.tier
    )),
  };
}

export async function saveEvaluation(evaluation: SessionEvaluation) {
  return createFeedback({
    sessionId: evaluation.sessionId,
    structureScore: evaluation.scores.structure,
    clarityScore: evaluation.scores.clarity,
    insightScore: evaluation.scores.insight,
    communicationScore: evaluation.scores.communication,
    leadershipScore: evaluation.scores.leadership,
    overallScore: evaluation.overallScore,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
    drills: evaluation.drills,
    summary: evaluation.summary,
    schemaVersion: evaluation.schemaVersion,
    promptVersion: evaluation.promptVersion,
    modelVersion: evaluation.modelVersion,
    rubricVersion: evaluation.rubricVersion,
    evaluationState: evaluation.evaluationState,
  });
}

export async function evaluationExists(sessionId: string): Promise<boolean> {
  return Boolean(await getFeedbackBySessionId(sessionId));
}

/** Legacy and v2 rows are both returned without reinterpretation. */
export async function getExistingEvaluation(sessionId: string) {
  return getFeedbackBySessionId(sessionId);
}

function isEvaluationState(value: string): value is FeedbackEvaluationState {
  return value === "full" || value === "partial";
}
