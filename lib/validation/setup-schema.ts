/**
 * Zod validation schemas for interview setup
 */

import { z } from "zod";

/**
 * Interview configuration schema
 */
export const interviewConfigSchema = z.object({
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  duration: z.number().refine((val) => [15, 30, 45].includes(val), {
    message: "Duration must be 15, 30, or 45 minutes",
  }),
  hintMode: z.enum(["off", "gentle", "coach"]).default("off"),
  questionPreference: z.object({
    recency: z.enum(["all", "recent", "very_recent"]),
    recentDays: z.number().int().positive().max(3650).optional(),
  }),
});

/**
 * Session start request schema
 */
export const sessionStartSchema = z.object({
  roundType: z.enum(["behavioral", "product_sense", "execution", "strategy"]),
  mode: z.enum(["voice_video", "text"]).default("voice_video"),
  role: z.literal("pm").optional(),
  config: interviewConfigSchema,
  questionId: z.string().uuid().optional(), // Optional pre-selected question from explore page
});

/**
 * Type inference from schemas
 */
export type InterviewConfigInput = z.infer<typeof interviewConfigSchema>;
export type SessionStartInput = z.infer<typeof sessionStartSchema>;

/**
 * Validate interview configuration
 */
export function validateInterviewConfig(
  data: unknown
):
  | { success: true; data: InterviewConfigInput }
  | { success: false; error: string } {
  try {
    const validated = interviewConfigSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", "),
      };
    }
    return { success: false, error: "Validation failed" };
  }
}

/**
 * Validate session start request
 */
export function validateSessionStart(
  data: unknown
):
  | { success: true; data: SessionStartInput }
  | { success: false; error: string } {
  try {
    const validated = sessionStartSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", "),
      };
    }
    return { success: false, error: "Validation failed" };
  }
}
