import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import { eq } from "drizzle-orm";
import { z } from "zod";

// Schema for settings validation
const settingsSchema = z
  .object({
    displayName: z.string().optional(),
    defaultInterviewType: z
      .enum(["product_sense", "analytical", "behavioral", "strategy"])
      .optional(),
    defaultDifficulty: z.enum(["easy", "medium", "hard"]).optional(),
    questionRecency: z.enum(["current", "recent", "all"]).optional(),
    emailNotifications: z.boolean().optional(),
    sessionCompletionEmail: z.boolean().optional(),
    feedbackReadyEmail: z.boolean().optional(),
    weeklyProgressReport: z.boolean().optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
  })
  .strict();

export async function GET() {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          message: "You must be logged in to access settings.",
        },
        { status: 401 }
      );
    }

    // Fetch settings from database
    const settings = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))
      .limit(1);

    if (settings.length === 0) {
      // No settings found, return defaults
      return NextResponse.json({
        settings: null,
        message: "No settings found. Using defaults.",
      });
    }

    // Convert database field names to camelCase for frontend
    const setting = settings[0];
    const formattedSettings = {
      displayName: setting.displayName,
      defaultInterviewType: setting.defaultInterviewType,
      defaultDifficulty: setting.defaultDifficulty,
      questionRecency: setting.questionRecency,
      emailNotifications: setting.emailNotifications,
      sessionCompletionEmail: setting.sessionCompletionEmail,
      feedbackReadyEmail: setting.feedbackReadyEmail,
      weeklyProgressReport: setting.weeklyProgressReport,
      theme: setting.theme,
    };

    return NextResponse.json({
      settings: formattedSettings,
    });
  } catch (error) {
    console.error("settings_read_failed", {
      error_code: "SETTINGS_READ_FAILED",
      ...toSafeErrorLog(error),
    });
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
        {
          error: "Unauthorized",
          message: "You must be logged in to update settings.",
        },
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

    // Convert camelCase to snake_case for database
    const dbSettings: Partial<typeof userSettings.$inferInsert> & {
      userId: string;
      updatedAt: Date;
    } = {
      userId: user.id,
      updatedAt: new Date(),
    };

    if (settings.displayName !== undefined)
      dbSettings.displayName = settings.displayName;
    if (settings.defaultInterviewType !== undefined)
      dbSettings.defaultInterviewType = settings.defaultInterviewType;
    if (settings.defaultDifficulty !== undefined)
      dbSettings.defaultDifficulty = settings.defaultDifficulty;
    if (settings.questionRecency !== undefined)
      dbSettings.questionRecency = settings.questionRecency;
    if (settings.emailNotifications !== undefined)
      dbSettings.emailNotifications = settings.emailNotifications;
    if (settings.sessionCompletionEmail !== undefined)
      dbSettings.sessionCompletionEmail = settings.sessionCompletionEmail;
    if (settings.feedbackReadyEmail !== undefined)
      dbSettings.feedbackReadyEmail = settings.feedbackReadyEmail;
    if (settings.weeklyProgressReport !== undefined)
      dbSettings.weeklyProgressReport = settings.weeklyProgressReport;
    if (settings.theme !== undefined) dbSettings.theme = settings.theme;

    // Upsert settings (insert or update)
    await db.insert(userSettings).values(dbSettings).onConflictDoUpdate({
      target: userSettings.userId,
      set: dbSettings,
    });

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("settings_update_failed", {
      error_code: "SETTINGS_UPDATE_FAILED",
      ...toSafeErrorLog(error),
    });
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to update settings" },
      { status: 500 }
    );
  }
}
