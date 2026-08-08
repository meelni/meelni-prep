import { sql } from "drizzle-orm";
import {
  QUESTION_ROUND_TYPES,
  questionTypeStorageAliasesForRound,
  type RoundType,
} from "@meelni/core";

import { db } from "@/lib/db";
import { feedback, interviewQuestion, stripeEventLog } from "@/lib/db/schema";
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
    async read({
      staleBefore,
      feedbackQueueStaleBefore,
      feedbackGenerationStaleBefore,
      queryTimeoutMs,
    }) {
      const staleBeforeIso = staleBefore.toISOString();
      const feedbackQueueStaleBeforeIso =
        feedbackQueueStaleBefore.toISOString();
      const feedbackGenerationStaleBeforeIso =
        feedbackGenerationStaleBefore.toISOString();
      return database.transaction(async (transaction) => {
        await transaction.execute(
          sql`select set_config('statement_timeout', ${`${queryTimeoutMs}ms`}, true)`
        );

        const rows = await transaction.execute<ServiceHealthEvidenceRow>(sql`
          select
          ${allQuestionRoundsReadySql()} as "questionBankReady",
          exists (
            select 1 from ${feedback}
            where (
              ${feedback.dispatchStatus} in ('pending', 'sending')
              and coalesce(${feedback.dispatchClaimedAt}, ${feedback.createdAt}) < ${staleBeforeIso}
            ) or (
              ${feedback.status} = 'pending'
              and ${feedback.dispatchStatus} = 'sent'
              and (
                ${feedback.dispatchedAt} is null
                or ${feedback.dispatchedAt} <= ${feedbackQueueStaleBeforeIso}
              )
            ) or (
              ${feedback.status} = 'processing'
              and (
                ${feedback.processingStartedAt} is null
                or ${feedback.processingStartedAt} <= ${feedbackGenerationStaleBeforeIso}
              )
            )
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

function allQuestionRoundsReadySql() {
  return sql.join(
    QUESTION_ROUND_TYPES.map((roundType) => questionRoundReadySql(roundType)),
    sql` and `
  );
}

function questionRoundReadySql(roundType: RoundType) {
  const aliases = questionTypeStorageAliasesForRound(roundType);
  return sql`exists (
    select 1 from ${interviewQuestion}
    where ${interviewQuestion.isActive} = true
      and ${interviewQuestion.questionType} in (
        ${sql.join(
          aliases.map((alias) => sql`${alias}`),
          sql`, `
        )}
      )
  )`;
}
