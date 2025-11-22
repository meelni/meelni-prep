/**
 * Zod validation schemas for interview setup
 */

import { z } from "zod";

/**
 * Interview configuration schema
 */
export const interviewConfigSchema = z.object({
  // Voice settings
  voice: z.string().min(1, "Voice ID is required"),
  speed: z.number().min(0.6).max(1.5),
  emotion: z.string().min(1),
  volume: z.number().min(0.5).max(2.0),

  // Interview settings
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  duration: z.number().refine((val) => [15, 30, 45].includes(val), {
    message: "Duration must be 15, 30, or 45 minutes",
  }),
  feedback_mode: z.enum(["real_time", "end_only", "silent"]),

  // Model settings
  stt_model: z.string().min(1),
  llm_model: z.string().min(1),
  tts_model: z.string().min(1),
});

/**
 * Session start request schema
 */
export const sessionStartSchema = z.object({
  roundType: z.enum(["behavioral", "product_sense", "execution", "strategy"]),
  mode: z.enum(["voice_video", "text"]).default("voice_video"),
  persona: z.string().optional(),
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
): { success: true; data: InterviewConfigInput } | { success: false; error: string } {
  try {
    const validated = interviewConfigSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
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
): { success: true; data: SessionStartInput } | { success: false; error: string } {
  try {
    const validated = sessionStartSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
      };
    }
    return { success: false, error: "Validation failed" };
  }
}
