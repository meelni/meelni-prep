import { and, eq, inArray, sql } from "drizzle-orm";
import type { InterviewRuntimeEvent } from "@meelni/agent";
import { projectLegacyInterviewSessionStatus } from "@meelni/core";

import {
  withDrizzleCreditLedgerUserTransaction,
  type CreditLedgerDatabase,
  type CreditLedgerTransactionDatabase,
} from "@/lib/billing/credit-ledger-store";
import type {
  InterviewRuntimeFailureStore,
  PersistInterviewRuntimeFailureResult,
} from "@/lib/workflows/ingest-interview-runtime-event";
import { db } from "./index";
import { interviewSession } from "./schema";

type ProviderFailureEvent = InterviewRuntimeEvent & { type: "provider_failed" };

export function createDrizzleInterviewRuntimeFailureStore(
  database: CreditLedgerDatabase = db
): InterviewRuntimeFailureStore {
  return {
    async persistProviderFailure(event) {
      const owners = await database
        .select({ userId: interviewSession.userId })
        .from(interviewSession)
        .where(eq(interviewSession.id, event.session_id))
        .limit(1);
      const owner = owners[0];
      if (!owner) return { ok: false, reason: "not_found" };

      return withDrizzleCreditLedgerUserTransaction(
        owner.userId,
        async ({ database: transaction }) =>
          persistProviderFailureLocked(transaction, event, owner.userId),
        database
      );
    },
  };
}

async function persistProviderFailureLocked(
  transaction: CreditLedgerTransactionDatabase,
  event: ProviderFailureEvent,
  userId: string
): Promise<PersistInterviewRuntimeFailureResult> {
  const rows = await transaction
    .select()
    .from(interviewSession)
    .where(
      and(
        eq(interviewSession.id, event.session_id),
        eq(interviewSession.userId, userId)
      )
    )
    .limit(1)
    .for("update");
  const session = rows[0];
  if (!session) return { ok: false, reason: "not_found" };
  if (
    session.startContractVersion !== 1 ||
    session.startAttemptId !== event.session_id ||
    session.livekitRoomName !== event.runtime_ref?.id
  ) {
    return { ok: false, reason: "room_mismatch" };
  }

  const failure = event.failure!;
  const occurredAt = new Date(event.occurred_at);
  if (session.runtimeFailureEventId) {
    return session.runtimeFailureEventId === event.event_id &&
      session.runtimeFailureCode === failure.code &&
      session.runtimeFailureRetryable === failure.retryable &&
      session.runtimeFailedAt?.getTime() === occurredAt.getTime()
      ? { ok: true, disposition: "existing", sessionId: session.id }
      : { ok: false, reason: "event_conflict" };
  }
  if (
    inTerminalState(session.lifecycleState) ||
    session.lifecycleState === "ending" ||
    session.billingFault !== null
  ) {
    return { ok: false, reason: "session_closed" };
  }

  const terminalAt = new Date();
  const updated = await transaction
    .update(interviewSession)
    .set({
      lifecycleState: "failed",
      lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 2`,
      terminalReason: "provider_failure",
      status: projectLegacyInterviewSessionStatus({
        state: "failed",
        terminalReason: "provider_failure",
      }),
      billingFault: "provider",
      billingFaultCode: failure.code,
      runtimeFailureEventId: event.event_id,
      runtimeFailureCode: failure.code,
      runtimeFailureRetryable: failure.retryable,
      runtimeFailedAt: occurredAt,
      endingAt: sql`COALESCE(${interviewSession.endingAt}, ${terminalAt.toISOString()}::timestamptz)`,
      endedAt: sql`COALESCE(${interviewSession.endedAt}, ${terminalAt.toISOString()}::timestamptz)`,
      lastTransitionAt: terminalAt,
      reconnectDeadlineAt: null,
      roomCleanupPending: true,
    })
    .where(
      and(
        eq(interviewSession.id, session.id),
        eq(interviewSession.userId, userId),
        eq(interviewSession.lifecycleState, session.lifecycleState),
        eq(interviewSession.lifecycleVersion, session.lifecycleVersion),
        inArray(interviewSession.lifecycleState, [
          "created",
          "connecting",
          "active",
          "reconnecting",
        ])
      )
    )
    .returning({ id: interviewSession.id });
  return updated[0]
    ? { ok: true, disposition: "created", sessionId: updated[0].id }
    : { ok: false, reason: "event_conflict" };
}

function inTerminalState(state: string): boolean {
  return state === "completed" || state === "abandoned" || state === "failed";
}
