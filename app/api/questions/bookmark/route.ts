import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { bookmarkedQuestion } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/questions/bookmark - Get all bookmarked question IDs for user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bookmarks = await db.query.bookmarkedQuestion.findMany({
      where: eq(bookmarkedQuestion.userId, user.id),
      columns: {
        questionId: true,
      },
    });

    // Return array of question IDs for easy lookup
    const questionIds = bookmarks.map(b => b.questionId);
    return NextResponse.json({ questionIds });
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/questions/bookmark - Add a bookmark
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { questionId } = body;

    if (!questionId) {
      return NextResponse.json({ error: "Question ID required" }, { status: 400 });
    }

    // Insert bookmark (onConflictDoNothing handles duplicates)
    await db.insert(bookmarkedQuestion).values({
      userId: user.id,
      questionId,
    }).onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error bookmarking question:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE /api/questions/bookmark - Remove a bookmark
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const questionId = searchParams.get("questionId");

    if (!questionId) {
      return NextResponse.json({ error: "Question ID required" }, { status: 400 });
    }

    // Delete bookmark
    await db.delete(bookmarkedQuestion).where(
      and(
        eq(bookmarkedQuestion.userId, user.id),
        eq(bookmarkedQuestion.questionId, questionId)
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing bookmark:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
