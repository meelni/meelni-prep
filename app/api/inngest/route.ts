/**
 * Inngest Webhook API Route
 * P1-003: Serves Inngest functions via HTTP endpoint
 */

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { generateFeedback } from "@/lib/inngest/functions/generate-feedback";

/**
 * Serve Inngest functions via Next.js API route
 *
 * This endpoint handles:
 * - Inngest SDK communication
 * - Function registration
 * - Event delivery
 * - Retry logic
 *
 * Environment Variables Required:
 * - INNGEST_EVENT_KEY (for sending events)
 * - INNGEST_SIGNING_KEY (for webhook signature verification)
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    generateFeedback, // P1-003: Feedback generation worker
    // Future functions will be added here:
    // updateInsights,  // P2-003: User insights aggregation
  ],
});
