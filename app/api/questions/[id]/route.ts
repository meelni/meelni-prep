/**
 * Get Single Question API
 *
 * Fetches a specific question by ID from the question bank.
 *
 * @route GET /api/questions/[id]
 * @access Public (no authentication required for question browsing)
 */

import { NextRequest, NextResponse } from "next/server";
import { getQuestionById } from "@/lib/db/questions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Question ID is required" },
        { status: 400 }
      );
    }

    const question = await getQuestionById(id);

    if (!question) {
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
