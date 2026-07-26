import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { feedback, stripeEventLog } from "@/lib/db/schema";
import type {
  ServiceHealthEvidence,
  ServiceHealthStore,
} from "@/lib/operations/service-health";

type ServiceHealthEvidenceInput = Parameters<
  ServiceHealthStore["readEvidence"]
>[0];
type ServiceHealthEvidenceRow = ServiceHealthEvidence & Record<string, unknown>;

export interface ServiceHealthEvidenceReader {
  read(input: ServiceHealthEvidenceInput): Promise<ServiceHealthEvidence>;
}

export function createServiceHealthStore(
  reader: ServiceHealthEvidenceReader = createDrizzleServiceHealthEvidenceReader()
): ServiceHealthStore {
  let inFlight: Promise<ServiceHealthEvidence> | undefined;

  return {
    readEvidence(input) {
      if (inFlight) return inFlight;

      const work = Promise.resolve().then(() => reader.read(input));
      const tracked = work.finally(() => {
        if (inFlight === tracked) inFlight = undefined;
      });
      inFlight = tracked;
      return tracked;
    },
  };
}

export function createDrizzleServiceHealthEvidenceReader(
  database: Pick<typeof db, "transaction"> = db
): ServiceHealthEvidenceReader {
  return {
    async read({ staleBefore, queryTimeoutMs }) {
      const staleBeforeIso = staleBefore.toISOString();
      return database.transaction(async (transaction) => {
        await transaction.execute(
          sql`select set_config('statement_timeout', ${`${queryTimeoutMs}ms`}, true)`
        );

        const rows = await transaction.execute<ServiceHealthEvidenceRow>(sql`
          select
          exists (
            select 1 from ${feedback}
            where ${feedback.dispatchStatus} in ('pending', 'sending')
              and coalesce(${feedback.dispatchClaimedAt}, ${feedback.createdAt}) < ${staleBeforeIso}
          ) as "feedbackDispatchStale",
          exists (
            select 1 from ${feedback}
            where ${feedback.dispatchStatus} = 'failed'
          ) as "feedbackDispatchFailed",
          exists (
            select 1 from ${stripeEventLog}
            where ${stripeEventLog.status} = 'pending'
              and ${stripeEventLog.createdAt} < ${staleBeforeIso}
          ) as "stripeWebhookStale",
          exists (
            select 1 from ${stripeEventLog}
            where ${stripeEventLog.status} = 'failed'
          ) as "stripeWebhookFailed"
        `);
        const evidence = rows[0];
        if (!evidence) throw new Error("service_health_evidence_unavailable");
        return evidence;
      });
    },
  };
}
