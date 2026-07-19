import {
  parseFeedbackV2,
  resolveDrillRecommendation,
  DRILL_TEMPLATE_VERSION,
  type FeedbackV2Item,
  type PersistedCompletedFeedback,
  type PersistedFeedbackEvidenceTurn,
  type RoundType,
} from "@meelni/core";
import { createFocusedPracticePlanGoldenFixtures } from "./focused-practice-plan";

export interface FocusedPracticeAttemptSourceFixture {
  name: string;
  userId: string;
  sessionId: string;
  feedbackId: string;
  roundType: RoundType;
  question: { questionId: string; questionText: string };
  persistedFeedback: PersistedCompletedFeedback;
  evidenceTurns: PersistedFeedbackEvidenceTurn[];
  expected: {
    templateId: string;
    sourceFinding: FeedbackV2Item;
  };
}

export function createFocusedPracticeAttemptSourceFixtures(): FocusedPracticeAttemptSourceFixture[] {
  return createFocusedPracticePlanGoldenFixtures().map((fixture, index) => {
    const recommendationFixture = fixture.recommendationFixture;
    const feedback = parseFeedbackV2(recommendationFixture.response, {
      transcript: recommendationFixture.transcript,
      evaluationState: recommendationFixture.evaluationState,
      modelVersion: recommendationFixture.modelVersion,
    });
    const resolution = resolveDrillRecommendation({
      roundType: recommendationFixture.roundType,
      sourceState: "completed",
      templateVersion: DRILL_TEMPLATE_VERSION,
      feedback,
    });
    if (
      resolution.recommendation.state !== "recommended" ||
      !resolution.sourceFinding
    ) {
      throw new Error(`fixture ${fixture.name} did not resolve`);
    }

    const sessionId = `fixture-focused-practice-session-${index + 1}`;
    const feedbackId = `fixture-focused-practice-feedback-${index + 1}`;
    return {
      name: fixture.name,
      userId: `fixture-focused-practice-user-${index + 1}`,
      sessionId,
      feedbackId,
      roundType: recommendationFixture.roundType,
      question: { ...fixture.sourceQuestion },
      persistedFeedback: {
        id: feedbackId,
        sessionId,
        structureScore: feedback.scores.structure,
        clarityScore: feedback.scores.clarity,
        insightScore: feedback.scores.insight,
        communicationScore: feedback.scores.communication,
        leadershipScore: feedback.scores.leadership,
        overallScore: String(feedback.overallScore),
        strengths: structuredClone(feedback.strengths),
        improvements: structuredClone(feedback.improvements),
        drills: [...feedback.drills],
        summary: feedback.summary,
        rubricVersion: feedback.rubricVersion,
        schemaVersion: feedback.schemaVersion,
        promptVersion: feedback.promptVersion,
        modelVersion: feedback.modelVersion,
        evaluationState: feedback.evaluationState,
        createdAt: new Date(
          `2026-07-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`
        ),
      },
      evidenceTurns: recommendationFixture.transcript.map((turn) => ({
        eventId: turn.eventId,
        speaker: turn.speaker,
        text: turn.text,
        contractVersion: 2,
      })),
      expected: {
        templateId: fixture.expected.templateId,
        sourceFinding: structuredClone(resolution.sourceFinding),
      },
    };
  });
}
