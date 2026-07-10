import {
  INTERVIEW_CREDIT_POLICY_VERSION,
  isInterviewTerminalState,
  resolveInterviewCreditPolicy,
  type InterviewBillingFault,
  type InterviewCreditSettlementAction,
  type InterviewCreditSettlementReason,
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
  billingFault: InterviewBillingFault | null;
  billingFaultCode: string | null;
  creditPolicyVersion: string | null;
  creditSettlementAction: InterviewCreditSettlementAction | null;
  creditSettlementReason: InterviewCreditSettlementReason | null;
  creditSettlementIdempotencyKey: string | null;
  creditSettledAt: Date | null;
  creditMakeGoodGrantId: string | null;
}

export interface QualifyingInterviewTurn {
  eventId: string;
}

export interface InterviewCreditSettlementEvidence {
  transactionType: "consume" | "release" | "refund";
  userId: string;
  catalogId?: string;
  creditSource?: string;
  credits: number;
  idempotencyKey: string;
  sessionId: string | null;
  reservationId: string;
  grantId?: string;
  makeGoodGrantId?: string;
}

export interface InterviewCreditReservationEvidence {
  status: "active" | "consumed" | "released" | "refunded";
}

export interface InterviewCreditSettlementTransaction {
  session: InterviewCreditSettlementSession;
  findQualifyingTurn(eventId?: string): Promise<QualifyingInterviewTurn | null>;
  getReservation(
    reservationKey: string
  ): Promise<InterviewCreditReservationEvidence>;
  settle(input: {
    action: "consume" | "release" | "refund";
    reservationKey: string;
    idempotencyKey: string;
    now?: Date;
  }): Promise<InterviewCreditSettlementEvidence>;
  markUsable(input: { eventId: string; usableAt: Date }): Promise<void>;
  recordPolicySettlement(input: {
    policyVersion: typeof INTERVIEW_CREDIT_POLICY_VERSION;
    action: InterviewCreditSettlementAction;
    reason: InterviewCreditSettlementReason;
    idempotencyKey: string;
    settledAt: Date;
    makeGoodGrantId: string | null;
  }): Promise<void>;
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
  | {
      disposition: "released" | "refunded" | "retained";
      policyVersion: typeof INTERVIEW_CREDIT_POLICY_VERSION;
      reason: InterviewCreditSettlementReason;
      makeGoodGrantId: string | null;
    };

export async function convergeInterviewCreditSettlement(input: {
  sessionId: string;
  store: InterviewCreditSettlementStore;
  now?: Date;
}): Promise<ConvergeInterviewCreditSettlementResult> {
  const owner = await input.store.lookupOwner(input.sessionId);
  if (!owner) return { disposition: "not_found" };

  const completedSettlements: InterviewCreditSettlementEvidence[] = [];
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

      const existingPolicy = readExistingPolicySettlement(session);
      if (existingPolicy) return existingPolicy;

      const reservationKey = stableReservationKey(session);
      const terminal = isInterviewTerminalState(session.lifecycleState);
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
        const consumed = await transaction.settle({
          action: "consume",
          reservationKey,
          idempotencyKey: `consume:${reservationKey}`,
          now: input.now,
        });
        completedSettlements.push(consumed);
        if (!terminal) {
          return {
            disposition: "consumed",
            usableTranscriptEventId: qualifyingTurn.eventId,
          } as const;
        }
      }

      const qualifyingTurn = !session.usableTranscriptEventId && session.activatedAt
        ? await transaction.findQualifyingTurn()
        : null;
      if (!session.usableTranscriptEventId && session.activatedAt && qualifyingTurn) {
        const consumed = await transaction.settle({
          action: "consume",
          reservationKey,
          idempotencyKey: `consume:${reservationKey}`,
          now: input.now,
        });
        completedSettlements.push(consumed);
        await transaction.markUsable({
          eventId: qualifyingTurn.eventId,
          usableAt: input.now ?? new Date(),
        });
        if (!terminal) {
          return {
            disposition: "consumed",
            usableTranscriptEventId: qualifyingTurn.eventId,
          } as const;
        }
      }

      if (terminal) {
        if (!session.billingFault || !session.billingFaultCode) {
          throw new Error("interview_billing_fault_evidence_missing");
        }
        const reservation = await transaction.getReservation(reservationKey);
        const policy = resolveInterviewCreditPolicy({
          fault: session.billingFault,
          reservationStatus: reservation.status,
        });
        const idempotencyKey = settlementIdempotencyKey(
          policy.action,
          reservationKey
        );
        if (policy.ledgerMutationRequired) {
          const settled = await transaction.settle({
            action: policy.action as "release" | "refund",
            reservationKey,
            idempotencyKey,
            now: input.now,
          });
          completedSettlements.push(settled);
        }
        const makeGoodGrantId =
          completedSettlements.at(-1)?.makeGoodGrantId ?? null;
        await transaction.recordPolicySettlement({
          policyVersion: policy.policyVersion,
          action: policy.action,
          reason: policy.reason,
          idempotencyKey,
          settledAt: input.now ?? new Date(),
          makeGoodGrantId,
        });
        return {
          disposition:
            policy.action === "release"
              ? "released"
              : policy.action === "refund"
                ? "refunded"
                : "retained",
          policyVersion: policy.policyVersion,
          reason: policy.reason,
          makeGoodGrantId,
        } as const;
      }

      return { disposition: "pending" } as const;
    },
  });

  if (!result) return { disposition: "not_found" };
  for (const completedSettlement of completedSettlements) {
    input.store.trackCompletedSettlement(completedSettlement);
  }
  return result;
}

function readExistingPolicySettlement(
  session: InterviewCreditSettlementSession
): Extract<
  ConvergeInterviewCreditSettlementResult,
  { disposition: "released" | "refunded" | "retained" }
> | null {
  const fields = [
    session.creditPolicyVersion,
    session.creditSettlementAction,
    session.creditSettlementReason,
    session.creditSettlementIdempotencyKey,
    session.creditSettledAt,
  ];
  if (fields.every((field) => field === null)) return null;
  if (fields.some((field) => field === null)) {
    throw new Error("interview_credit_settlement_evidence_incomplete");
  }
  if (
    session.creditPolicyVersion !== INTERVIEW_CREDIT_POLICY_VERSION ||
    !session.creditSettlementAction ||
    !session.creditSettlementReason
  ) {
    throw new Error("interview_credit_settlement_evidence_conflict");
  }
  return {
    disposition:
      session.creditSettlementAction === "release"
        ? "released"
        : session.creditSettlementAction === "refund"
          ? "refunded"
          : "retained",
    policyVersion: INTERVIEW_CREDIT_POLICY_VERSION,
    reason: session.creditSettlementReason,
    makeGoodGrantId: session.creditMakeGoodGrantId,
  };
}

function settlementIdempotencyKey(
  action: InterviewCreditSettlementAction,
  reservationKey: string
): string {
  if (action === "release") return `release:${reservationKey}`;
  return `${action}:${INTERVIEW_CREDIT_POLICY_VERSION}:${reservationKey}`;
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
