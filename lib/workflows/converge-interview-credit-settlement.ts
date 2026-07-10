import {
  isInterviewTerminalState,
  type InterviewLifecycleState,
} from "@meelni/core";

export interface InterviewCreditSettlementSession {
  sessionId: string;
  userId: string;
  startContractVersion: number;
  startAttemptId: string | null;
  lifecycleState: InterviewLifecycleState;
  activatedAt: Date | null;
  usableAt: Date | null;
  usableTranscriptEventId: string | null;
}

export interface QualifyingInterviewTurn {
  eventId: string;
}

export interface InterviewCreditSettlementEvidence {
  transactionType: "consume" | "release";
  userId: string;
  catalogId?: string;
  creditSource?: string;
  credits: number;
  idempotencyKey: string;
  sessionId: string | null;
  reservationId: string;
  grantId?: string;
}

export interface InterviewCreditSettlementTransaction {
  session: InterviewCreditSettlementSession;
  findQualifyingTurn(eventId?: string): Promise<QualifyingInterviewTurn | null>;
  settle(input: {
    action: "consume" | "release";
    reservationKey: string;
    idempotencyKey: string;
  }): Promise<InterviewCreditSettlementEvidence>;
  markUsable(input: { eventId: string; usableAt: Date }): Promise<void>;
}

export interface InterviewCreditSettlementStore {
  lookupOwner(sessionId: string): Promise<{ userId: string } | null>;
  withUserSessionTransaction<T>(input: {
    sessionId: string;
    userId: string;
    work(transaction: InterviewCreditSettlementTransaction): Promise<T>;
  }): Promise<T | null>;
  trackCompletedSettlement(evidence: InterviewCreditSettlementEvidence): void;
}

export type ConvergeInterviewCreditSettlementResult =
  | { disposition: "not_found" | "ignored_legacy" | "pending" }
  | {
      disposition: "consumed";
      usableTranscriptEventId: string;
    }
  | { disposition: "released" };

export async function convergeInterviewCreditSettlement(input: {
  sessionId: string;
  store: InterviewCreditSettlementStore;
  now?: Date;
}): Promise<ConvergeInterviewCreditSettlementResult> {
  const owner = await input.store.lookupOwner(input.sessionId);
  if (!owner) return { disposition: "not_found" };

  let completedSettlement: InterviewCreditSettlementEvidence | null = null;
  const result = await input.store.withUserSessionTransaction({
    sessionId: input.sessionId,
    userId: owner.userId,
    work: async (transaction) => {
      const session = transaction.session;
      if (session.startContractVersion === 0) {
        return { disposition: "ignored_legacy" } as const;
      }
      assertStableStartSession(session, input.sessionId, owner.userId);

      if (
        (session.usableAt === null) !==
        (session.usableTranscriptEventId === null)
      ) {
        throw new Error("interview_usable_evidence_incomplete");
      }

      const reservationKey = stableReservationKey(session);
      if (session.usableTranscriptEventId) {
        if (!session.activatedAt) {
          throw new Error("interview_usable_evidence_without_activation");
        }
        const qualifyingTurn = await transaction.findQualifyingTurn(
          session.usableTranscriptEventId
        );
        if (!qualifyingTurn) {
          throw new Error("interview_usable_transcript_evidence_invalid");
        }
        completedSettlement = await transaction.settle({
          action: "consume",
          reservationKey,
          idempotencyKey: `consume:${reservationKey}`,
        });
        return {
          disposition: "consumed",
          usableTranscriptEventId: qualifyingTurn.eventId,
        } as const;
      }

      const qualifyingTurn = session.activatedAt
        ? await transaction.findQualifyingTurn()
        : null;
      if (session.activatedAt && qualifyingTurn) {
        completedSettlement = await transaction.settle({
          action: "consume",
          reservationKey,
          idempotencyKey: `consume:${reservationKey}`,
        });
        await transaction.markUsable({
          eventId: qualifyingTurn.eventId,
          usableAt: input.now ?? new Date(),
        });
        return {
          disposition: "consumed",
          usableTranscriptEventId: qualifyingTurn.eventId,
        } as const;
      }

      if (isInterviewTerminalState(session.lifecycleState)) {
        completedSettlement = await transaction.settle({
          action: "release",
          reservationKey,
          idempotencyKey: `release:${reservationKey}`,
        });
        return { disposition: "released" } as const;
      }

      return { disposition: "pending" } as const;
    },
  });

  if (!result) return { disposition: "not_found" };
  if (completedSettlement) {
    input.store.trackCompletedSettlement(completedSettlement);
  }
  return result;
}

function assertStableStartSession(
  session: InterviewCreditSettlementSession,
  expectedSessionId: string,
  expectedUserId: string
): void {
  if (
    session.startContractVersion !== 1 ||
    session.sessionId !== expectedSessionId ||
    session.userId !== expectedUserId ||
    session.startAttemptId !== expectedSessionId
  ) {
    throw new Error("interview_start_credit_correlation_invalid");
  }
}

function stableReservationKey(
  session: InterviewCreditSettlementSession
): string {
  return `interview-start:${session.userId}:${session.startAttemptId}`;
}
