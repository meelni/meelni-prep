import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { practiceSet } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// DELETE /api/practice-sets/[setId] - Delete a practice set
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

    // Delete the practice set (cascade will remove associated questions)
    const result = await db
      .delete(practiceSet)
      .where(and(eq(practiceSet.id, setId), eq(practiceSet.userId, user.id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Practice set not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    console.error("practice_set_delete_failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// PATCH /api/practice-sets/[setId] - Update a practice set
export async function PATCH(
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

    const body = await request.json();
    const { name, description } = body;

    const updates: Partial<typeof practiceSet.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json({ error: "Practice set name cannot be empty" }, { status: 400 });
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    const result = await db
      .update(practiceSet)
      .set(updates)
      .where(and(eq(practiceSet.id, setId), eq(practiceSet.userId, user.id)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Practice set not found" }, { status: 404 });
    }

    return NextResponse.json({ set: result[0] });
  } catch {
    console.error("practice_set_update_failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
