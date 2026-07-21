import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { practiceSet, practiceSetQuestion } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

// GET /api/practice-sets - Get all practice sets for the authenticated user
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all practice sets with question counts
    const sets = await db
      .select({
        id: practiceSet.id,
        name: practiceSet.name,
        description: practiceSet.description,
        createdAt: practiceSet.createdAt,
        updatedAt: practiceSet.updatedAt,
        questionCount: sql<number>`count(${practiceSetQuestion.id})::int`,
      })
      .from(practiceSet)
      .leftJoin(practiceSetQuestion, eq(practiceSet.id, practiceSetQuestion.practiceSetId))
      .where(eq(practiceSet.userId, user.id))
      .groupBy(practiceSet.id)
      .orderBy(desc(practiceSet.updatedAt));

    return NextResponse.json({ sets });
  } catch {
    console.error("practice_set_list_read_failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/practice-sets - Create a new practice set
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Practice set name is required" }, { status: 400 });
    }

    const [newSet] = await db
      .insert(practiceSet)
      .values({
        userId: user.id,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .returning();

    return NextResponse.json({ set: newSet }, { status: 201 });
  } catch {
    console.error("practice_set_create_failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
