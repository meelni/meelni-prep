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
import {
  cleanupInterviewRoom,
  recoverInterviewRoomCleanup,
} from "@/lib/inngest/functions/cleanup-interview-rooms";
import {
  reconcileInterviewPresence,
  recoverInterviewPresenceReconciliation,
} from "@/lib/inngest/functions/reconcile-interview-presence";
import { recoverInterviewStarts } from "@/lib/inngest/functions/recover-interview-starts";
import { recoverInterviewCredits } from "@/lib/inngest/functions/recover-interview-credits";

export const maxDuration = 300;

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
// The 14 source functions expand to 15 provider entries because the SDK
// registers generateFeedback.onFailure as a separate failure handler.
export const inngestSourceFunctions = [
  generateFeedback, // P1-003: Feedback generation worker
  updateUserInsights, // P2-003: User insights aggregation
  deleteAccount, // Durable cross-provider account deletion
  recoverAccountDeletions, // Requeues persisted outbox/tombstone work
  enforceInterviewDeadline, // Server-owned hard interview deadline
  recoverInterviewDeadlines, // Requeues missing deadline schedules
  enforceInterviewReconnect, // Server-owned reconnect grace expiry
  recoverInterviewReconnects, // Requeues missing reconnect schedules
  cleanupInterviewRoom, // Independently retries one terminal room cleanup
  recoverInterviewRoomCleanup, // Reclaims terminal rooms after provider outages
  reconcileInterviewPresence, // Repairs missed participant webhooks
  recoverInterviewPresenceReconciliation, // Fairly scans active voice sessions
  recoverInterviewStarts, // Fences stale starts and releases stranded credits
  recoverInterviewCredits, // Refunds provider/integrity failures and stale credits
] as const;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestSourceFunctions,
});
