/**
 * Inngest Client Configuration
 * P1-003: Background job processing for feedback generation
 */

import { Inngest } from "inngest";
import { getInngestClientOptions } from "./config";

/**
 * Inngest client for Meelni application
 *
 * Used for background job processing including:
 * - Feedback generation (evaluating session transcripts with GPT-4)
 * - Insights aggregation (calculating user analytics)
 * - Data backfill tasks
 */
export const inngest = new Inngest(getInngestClientOptions());
