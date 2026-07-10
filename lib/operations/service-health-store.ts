import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { feedback, stripeEventLog } from "@/lib/db/schema";
import type {
  ServiceHealthEvidence,
  ServiceHealthStore,
} from "@/lib/operations/service-health";

export function createServiceHealthStore(): ServiceHealthStore {
  return {
    async readEvidence({ staleBefore }) {
      const [feedbackRows, webhookRows] = await Promise.all([
        db
          .select({
            stale: sql<number>`count(*) filter (
              where ${inArray(feedback.dispatchStatus, ["pending", "sending"])}
              and coalesce(${feedback.dispatchClaimedAt}, ${feedback.createdAt}) < ${staleBefore}
            )`.mapWith(Number),
            failed: sql<number>`count(*) filter (
              where ${eq(feedback.dispatchStatus, "failed")}
            )`.mapWith(Number),
          })
          .from(feedback),
        db
          .select({
            stale: sql<number>`count(*) filter (
              where ${inArray(stripeEventLog.status, ["pending", "failed"])}
              and ${stripeEventLog.createdAt} < ${staleBefore}
            )`.mapWith(Number),
            failed: sql<number>`count(*) filter (
              where ${eq(stripeEventLog.status, "failed")}
            )`.mapWith(Number),
          })
          .from(stripeEventLog),
      ]);

      return {
        feedbackDispatchStale: (feedbackRows[0]?.stale ?? 0) > 0,
        feedbackDispatchFailed: (feedbackRows[0]?.failed ?? 0) > 0,
        stripeWebhookStale: (webhookRows[0]?.stale ?? 0) > 0,
        stripeWebhookFailed: (webhookRows[0]?.failed ?? 0) > 0,
      } satisfies ServiceHealthEvidence;
    },
  };
}
