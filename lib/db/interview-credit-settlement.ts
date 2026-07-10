import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import {
  withDrizzleCreditLedgerUserTransaction,
  type CreditLedgerDatabase,
} from "@/lib/billing/credit-ledger-store";
import {
  settleReservationInTransaction,
  trackCompletedReservationEvent,
} from "@/lib/billing/credits";
import {
  convergeInterviewCreditSettlement,
  type InterviewCreditSettlementEvidence,
  type InterviewCreditSettlementStore,
} from "@/lib/workflows/converge-interview-credit-settlement";
import { db } from "./index";
import { interviewSession, transcriptTurn } from "./schema";

export async function convergeDrizzleInterviewCreditSettlement(
  sessionId: string,
  database: CreditLedgerDatabase = db
) {
  return convergeInterviewCreditSettlement({
    sessionId,
    store: createDrizzleInterviewCreditSettlementStore(database),
  });
}

export function createDrizzleInterviewCreditSettlementStore(
  database: CreditLedgerDatabase = db
): InterviewCreditSettlementStore {
  return {
    async lookupOwner(sessionId) {
      const rows = await database
        .select({ userId: interviewSession.userId })
        .from(interviewSession)
        .where(eq(interviewSession.id, sessionId))
        .limit(1);
      return rows[0] ?? null;
    },
    async withUserSessionTransaction({ sessionId, userId, work }) {
      return withDrizzleCreditLedgerUserTransaction(
        userId,
        async ({ database: transaction, ledger }) => {
          const sessions = await transaction
            .select({
              sessionId: interviewSession.id,
              userId: interviewSession.userId,
              startContractVersion: interviewSession.startContractVersion,
              startAttemptId: interviewSession.startAttemptId,
              lifecycleState: interviewSession.lifecycleState,
              activatedAt: interviewSession.activatedAt,
              usableAt: interviewSession.usableAt,
              usableTranscriptEventId: interviewSession.usableTranscriptEventId,
              billingFault: interviewSession.billingFault,
              billingFaultCode: interviewSession.billingFaultCode,
              creditPolicyVersion: interviewSession.creditPolicyVersion,
              creditSettlementAction:
                interviewSession.creditSettlementAction,
              creditSettlementReason:
                interviewSession.creditSettlementReason,
              creditSettlementIdempotencyKey:
                interviewSession.creditSettlementIdempotencyKey,
              creditSettledAt: interviewSession.creditSettledAt,
              creditMakeGoodGrantId: interviewSession.creditMakeGoodGrantId,
            })
            .from(interviewSession)
            .where(
              and(
                eq(interviewSession.id, sessionId),
                eq(interviewSession.userId, userId)
              )
            )
            .limit(1)
            .for("update");
          const session = sessions[0];
          if (!session) return null;

          return work({
            session,
            async findQualifyingTurn(eventId) {
              const rows = await transaction
                .select({ eventId: transcriptTurn.eventId })
                .from(transcriptTurn)
                .where(
                  and(
                    eq(transcriptTurn.sessionId, sessionId),
                    eq(transcriptTurn.contractVersion, 2),
                    eq(transcriptTurn.speaker, "interviewer"),
                    eq(transcriptTurn.deliveryState, "delivered"),
                    isNotNull(transcriptTurn.eventId),
                    isNotNull(transcriptTurn.text),
                    sql`length(btrim(${transcriptTurn.text})) > 0`,
                    ...(eventId ? [eq(transcriptTurn.eventId, eventId)] : [])
                  )
                )
                .orderBy(
                  asc(transcriptTurn.startedAt),
                  asc(transcriptTurn.writerId),
                  asc(transcriptTurn.sequence),
                  asc(transcriptTurn.eventId),
                  asc(transcriptTurn.id)
                )
                .limit(1);
              return rows[0]?.eventId ? { eventId: rows[0].eventId } : null;
            },
            async settle(input) {
              const outcome = await settleReservationInTransaction({
                store: ledger,
                expectedUserId: userId,
                reservationKey: input.reservationKey,
                idempotencyKey: input.idempotencyKey,
                action: input.action,
                currentTime: input.now,
              });
              const reservation = outcome.reservation;
              if (
                reservation.startContractVersion !== 1 ||
                reservation.startAttemptId !== sessionId ||
                reservation.sessionId !== sessionId
              ) {
                throw new Error("interview_start_credit_correlation_invalid");
              }
              return {
                transactionType: input.action,
                userId: reservation.userId,
                catalogId: outcome.firstGrant?.catalogId,
                creditSource: outcome.firstGrant?.source,
                credits: reservation.credits,
                idempotencyKey: input.idempotencyKey,
                sessionId: reservation.sessionId,
                reservationId: reservation.id,
                grantId: outcome.firstGrant?.id,
                makeGoodGrantId: outcome.makeGoodGrant?.id,
              } satisfies InterviewCreditSettlementEvidence;
            },
            async getReservation(reservationKey) {
              const reservation =
                await ledger.findReservationByKeyForUpdate(reservationKey);
              if (
                !reservation ||
                reservation.userId !== userId ||
                reservation.sessionId !== sessionId ||
                reservation.startContractVersion !== 1 ||
                reservation.startAttemptId !== sessionId ||
                !["active", "consumed", "released", "refunded"].includes(
                  reservation.status
                )
              ) {
                throw new Error("interview_start_credit_correlation_invalid");
              }
              return {
                status: reservation.status as
                  | "active"
                  | "consumed"
                  | "released"
                  | "refunded",
              };
            },
            async markUsable({ eventId, usableAt }) {
              const updated = await transaction
                .update(interviewSession)
                .set({
                  usableAt,
                  usableTranscriptEventId: eventId,
                })
                .where(
                  and(
                    eq(interviewSession.id, sessionId),
                    eq(interviewSession.userId, userId),
                    isNull(interviewSession.usableAt),
                    isNull(interviewSession.usableTranscriptEventId)
                  )
                )
                .returning({ id: interviewSession.id });
              if (!updated[0]) {
                throw new Error("interview_usable_evidence_write_failed");
              }
            },
            async recordPolicySettlement(input) {
              const updated = await transaction
                .update(interviewSession)
                .set({
                  creditPolicyVersion: input.policyVersion,
                  creditSettlementAction: input.action,
                  creditSettlementReason: input.reason,
                  creditSettlementIdempotencyKey: input.idempotencyKey,
                  creditSettledAt: input.settledAt,
                  creditMakeGoodGrantId: input.makeGoodGrantId,
                })
                .where(
                  and(
                    eq(interviewSession.id, sessionId),
                    eq(interviewSession.userId, userId),
                    eq(interviewSession.startContractVersion, 1),
                    inArray(interviewSession.lifecycleState, [
                      "completed",
                      "abandoned",
                      "failed",
                    ]),
                    isNull(interviewSession.creditSettledAt)
                  )
                )
                .returning({ id: interviewSession.id });
              if (!updated[0]) {
                throw new Error("interview_credit_settlement_evidence_write_failed");
              }
            },
          });
        },
        database
      );
    },
    trackCompletedSettlement(evidence) {
      trackCompletedReservationEvent({
        transactionType: evidence.transactionType,
        userId: evidence.userId,
        catalogId: evidence.catalogId as Parameters<
          typeof trackCompletedReservationEvent
        >[0]["catalogId"],
        creditSource: evidence.creditSource as Parameters<
          typeof trackCompletedReservationEvent
        >[0]["creditSource"],
        credits: evidence.credits,
        idempotencyKey: evidence.idempotencyKey,
        sessionId: evidence.sessionId,
        reservationId: evidence.reservationId,
        grantId: evidence.grantId,
      });
    },
  };
}
