import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// Schema for settings validation
const settingsSchema = z.object({
  displayName: z.string().optional(),
  defaultInterviewType: z.enum(["product_sense", "analytical", "behavioral", "strategy"]).optional(),
  defaultDifficulty: z.enum(["easy", "medium", "hard"]).optional(),
  questionRecency: z.enum(["current", "recent", "all"]).optional(),
  autoSaveTranscripts: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  sessionCompletionEmail: z.boolean().optional(),
  feedbackReadyEmail: z.boolean().optional(),
  weeklyProgressReport: z.boolean().optional(),
  shareAnonymousData: z.boolean().optional(),
  saveTranscripts: z.boolean().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  compactMode: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "You must be logged in to access settings." },
        { status: 401 }
      );
    }

    // TODO: Fetch settings from database when user_settings table is created
    // For now, return empty object (settings will be loaded from localStorage on frontend)
    return NextResponse.json({
      settings: {},
      message: "Settings endpoint ready. Database persistence coming soon.",
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "You must be logged in to update settings." },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = settingsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation Error",
          message: "Invalid settings data",
          issues: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const settings = validationResult.data;

    // TODO: Save settings to database when user_settings table is created
    // For now, just acknowledge the request
    // Example:
    // await supabase
    //   .from("user_settings")
    //   .upsert({
    //     user_id: user.id,
    //     ...settings,
    //     updated_at: new Date().toISOString(),
    //   });

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully (localStorage only for now)",
      settings,
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to update settings" },
      { status: 500 }
    );
  }
}
