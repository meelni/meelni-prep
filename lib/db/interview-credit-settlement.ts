import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";

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
              } satisfies InterviewCreditSettlementEvidence;
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
