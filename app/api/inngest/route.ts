/**
 * Inngest Webhook API Route
 * P1-003: Serves Inngest functions via HTTP endpoint
 */

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { generateFeedback } from "@/lib/inngest/functions/generate-feedback";
import { updateUserInsights } from "@/lib/inngest/functions/update-user-insights";
import {
  deleteAccount,
  recoverAccountDeletions,
} from "@/lib/inngest/functions/delete-account";
import {
  enforceInterviewDeadline,
  recoverInterviewDeadlines,
} from "@/lib/inngest/functions/enforce-interview-deadline";
import {
  enforceInterviewReconnect,
  recoverInterviewReconnects,
} from "@/lib/inngest/functions/enforce-interview-reconnect";
import { recoverInterviewRoomCleanup } from "@/lib/inngest/functions/cleanup-interview-rooms";
import { prunePublicDemo } from "@/lib/inngest/functions/prune-public-demo";

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
    updateUserInsights, // P2-003: User insights aggregation
    deleteAccount, // Durable cross-provider account deletion
    recoverAccountDeletions, // Requeues persisted outbox/tombstone work
    enforceInterviewDeadline, // Server-owned hard interview deadline
    recoverInterviewDeadlines, // Requeues missing deadline schedules
    enforceInterviewReconnect, // Server-owned reconnect grace expiry
    recoverInterviewReconnects, // Requeues missing reconnect schedules
    recoverInterviewRoomCleanup, // Reclaims terminal rooms after provider outages
    prunePublicDemo, // Removes expired pseudonymous preview limiter data
  ],
});
