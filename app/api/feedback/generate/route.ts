import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionById, isSessionOwnedByUser } from "@/lib/db/sessions";
import { getSessionTranscript } from "@/lib/db/transcripts";
import { createFeedback, feedbackExists } from "@/lib/db/feedback";
import { generateFeedback } from "@/lib/evaluation/scorer";

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { sessionId } = body;

    // Validate required fields
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Verify user owns the session
    const isOwner = await isSessionOwnedByUser(sessionId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 403 }
      );
    }

    // Check if feedback already exists (idempotent)
    const existingFeedback = await feedbackExists(sessionId);
    if (existingFeedback) {
      return NextResponse.json({
        success: true,
        message: "Feedback already exists for this session",
        sessionId,
      });
    }

    // Get session details
    const session = await getSessionById(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Get transcript
    const transcript = await getSessionTranscript(sessionId);
    if (transcript.length === 0) {
      return NextResponse.json(
        { error: "Cannot generate feedback for empty transcript" },
        { status: 400 }
      );
    }

    // Prepare transcript for evaluation
    const transcriptForEval = transcript.map((turn) => ({
      speaker: turn.speaker,
      text: turn.text || "",
    }));

    // Generate feedback using GPT-4 Turbo
    const evaluation = await generateFeedback(
      session.roundType,
      transcriptForEval
    );

    // Save feedback to database
    const feedbackRecord = await createFeedback({
      sessionId,
      structureScore: evaluation.scores.structure,
      clarityScore: evaluation.scores.clarity,
      insightScore: evaluation.scores.insight,
      communicationScore: evaluation.scores.communication,
      leadershipScore: evaluation.scores.leadership,
      overallScore: evaluation.overall_score,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      drills: evaluation.drills,
      summary: evaluation.summary,
    });

    return NextResponse.json({
      success: true,
      feedback: feedbackRecord,
    });
  } catch (error) {
    console.error("Error generating feedback:", error);
    return NextResponse.json(
      {
        error: "Failed to generate feedback",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
