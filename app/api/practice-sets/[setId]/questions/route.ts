import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import {
  practiceSet,
  practiceSetQuestion,
  interviewQuestion,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { canonicalQuestionTypeLabel } from "@meelni/core";

// GET /api/practice-sets/[setId]/questions - Get all questions in a practice set
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  try {
    const { setId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the practice set belongs to the user
    const [set] = await db
      .select()
      .from(practiceSet)
      .where(and(eq(practiceSet.id, setId), eq(practiceSet.userId, user.id)))
      .limit(1);

    if (!set) {
      return NextResponse.json(
        { error: "Practice set not found" },
        { status: 404 }
      );
    }

    // Get all questions in the set
    const questions = await db
      .select({
        id: interviewQuestion.id,
        company: interviewQuestion.company,
        questionText: interviewQuestion.questionText,
        questionType: interviewQuestion.questionType,
        difficulty: interviewQuestion.difficulty,
        askedAt: interviewQuestion.askedAt,
        addedAt: practiceSetQuestion.createdAt,
      })
      .from(practiceSetQuestion)
      .innerJoin(
        interviewQuestion,
        eq(practiceSetQuestion.questionId, interviewQuestion.id)
      )
      .where(eq(practiceSetQuestion.practiceSetId, setId))
      .orderBy(practiceSetQuestion.createdAt);

    return NextResponse.json({
      questions: questions.map((question) => ({
        ...question,
        questionType:
          canonicalQuestionTypeLabel(question.questionType) ||
          question.questionType,
      })),
    });
  } catch (error) {
    console.error("Error fetching practice set questions:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/practice-sets/[setId]/questions - Add a question to a practice set
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  try {
    const { setId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the practice set belongs to the user
    const [set] = await db
      .select()
      .from(practiceSet)
      .where(and(eq(practiceSet.id, setId), eq(practiceSet.userId, user.id)))
      .limit(1);

    if (!set) {
      return NextResponse.json(
        { error: "Practice set not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { questionId } = body;

    if (!questionId) {
      return NextResponse.json(
        { error: "Question ID is required" },
        { status: 400 }
      );
    }

    // Add question to set (will fail if already exists due to unique constraint)
    await db
      .insert(practiceSetQuestion)
      .values({
        practiceSetId: setId,
        questionId,
      })
      .onConflictDoNothing();

    // Update the practice set's updatedAt timestamp
    await db
      .update(practiceSet)
      .set({ updatedAt: new Date() })
      .where(eq(practiceSet.id, setId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding question to practice set:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE /api/practice-sets/[setId]/questions - Remove a question from a practice set
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  try {
    const { setId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the practice set belongs to the user
    const [set] = await db
      .select()
      .from(practiceSet)
      .where(and(eq(practiceSet.id, setId), eq(practiceSet.userId, user.id)))
      .limit(1);

    if (!set) {
      return NextResponse.json(
        { error: "Practice set not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const questionId = searchParams.get("questionId");

    if (!questionId) {
      return NextResponse.json(
        { error: "Question ID is required" },
        { status: 400 }
      );
    }

    // Remove question from set
    await db
      .delete(practiceSetQuestion)
      .where(
        and(
          eq(practiceSetQuestion.practiceSetId, setId),
          eq(practiceSetQuestion.questionId, questionId)
        )
      );

    // Update the practice set's updatedAt timestamp
    await db
      .update(practiceSet)
      .set({ updatedAt: new Date() })
      .where(eq(practiceSet.id, setId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing question from practice set:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
