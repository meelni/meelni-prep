/**
 * Get Single Question API
 *
 * Fetches a specific question by ID from the question bank.
 *
 * @route GET /api/questions/[id]
 * @access Public (no authentication required for question browsing)
 */

import { NextRequest, NextResponse } from "next/server";
import { getActiveQuestionById } from "@/lib/db/questions";

const QUESTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!QUESTION_ID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: "Invalid question ID" },
        { status: 400 }
      );
    }

    const question = await getActiveQuestionById(id);

    if (!question || !question.isActive) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(question);
  } catch (error) {
    console.error("Error fetching question:", error);
    return NextResponse.json(
      { error: "Failed to fetch question" },
      { status: 500 }
    );
  }
}
