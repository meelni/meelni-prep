import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { projectLegacyInterviewSessionStatus } from "@meelni/core";

import {
  withDrizzleCreditLedgerUserTransaction,
  type CreditLedgerDatabase,
} from "@/lib/billing/credit-ledger-store";
import { createDrizzleInterviewCreditSettlementStore } from "./interview-credit-settlement";
import { convergeInterviewCreditSettlement } from "@/lib/workflows/converge-interview-credit-settlement";
import { db } from "./index";
import { creditReservation, feedback, interviewSession } from "./schema";

export const INTERVIEW_CREDIT_RECOVERY_LIMIT = 250;

export interface InterviewCreditRecoveryStore {
  listCandidates(input: {
    now: Date;
    limit: number;
  }): Promise<Array<{ sessionId: string }>>;
  prepare(input: {
    sessionId: string;
    now: Date;
  }): Promise<
    | { disposition: "recovered"; creditDisposition: string }
    | { disposition: "no_longer_recoverable" }
  >;
}

const terminalStates = ["completed", "abandoned", "failed"] as const;
const nonterminalStates = [
  "created",
  "connecting",
  "active",
  "reconnecting",
] as const;
const recoverableReservationStatuses = [
  "active",
  "consumed",
  "released",
  "refunded",
] as const;

export function createDrizzleInterviewCreditRecoveryStore(
  database: CreditLedgerDatabase = db
): InterviewCreditRecoveryStore {
  return {
    async listCandidates({ now, limit }) {
      const rows = await database
        .select({ sessionId: interviewSession.id })
        .from(interviewSession)
        .innerJoin(
          creditReservation,
          and(
            eq(creditReservation.sessionId, interviewSession.id),
            eq(creditReservation.userId, interviewSession.userId),
            eq(
              creditReservation.startAttemptId,
              interviewSession.startAttemptId
            ),
            eq(creditReservation.startContractVersion, 1)
          )
        )
        .where(
          and(
            eq(interviewSession.startContractVersion, 1),
            or(
              and(
                inArray(interviewSession.lifecycleState, [...terminalStates]),
                isNull(interviewSession.creditSettledAt),
                inArray(creditReservation.status, [
                  ...recoverableReservationStatuses,
                ])
              ),
              and(
                inArray(interviewSession.lifecycleState, [
                  ...nonterminalStates,
                ]),
                inArray(creditReservation.status, ["active", "consumed"]),
                lte(creditReservation.expiresAt, now)
              )
            )
          )
        )
        .orderBy(
          asc(interviewSession.lastTransitionAt),
          asc(interviewSession.id)
        )
        .limit(Math.min(Math.max(limit, 1), INTERVIEW_CREDIT_RECOVERY_LIMIT));
      return rows;
    },

    async prepare({ sessionId, now }) {
      const owners = await database
        .select({ userId: interviewSession.userId })
        .from(interviewSession)
        .where(eq(interviewSession.id, sessionId))
        .limit(1);
      const owner = owners[0];
      if (!owner) return { disposition: "no_longer_recoverable" };

      return withDrizzleCreditLedgerUserTransaction(
        owner.userId,
        async ({ database: transaction, ledger }) => {
          const rows = await transaction
            .select()
            .from(interviewSession)
            .where(
              and(
                eq(interviewSession.id, sessionId),
                eq(interviewSession.userId, owner.userId),
                eq(interviewSession.startContractVersion, 1)
              )
            )
            .limit(1)
            .for("update");
          const session = rows[0];
          if (!session || session.creditSettledAt) {
            return { disposition: "no_longer_recoverable" } as const;
          }
          const reservationKey = `interview-start:${owner.userId}:${session.startAttemptId}`;
          const reservation =
            await ledger.findReservationByKeyForUpdate(reservationKey);
          if (
            !reservation ||
            reservation.sessionId !== sessionId ||
            reservation.startAttemptId !== sessionId ||
            !recoverableReservationStatuses.includes(
              reservation.status as (typeof recoverableReservationStatuses)[number]
            )
          ) {
            return { disposition: "no_longer_recoverable" } as const;
          }

          const alreadyTerminal = terminalStates.includes(
            session.lifecycleState as (typeof terminalStates)[number]
          );
          if (
            (!alreadyTerminal &&
              !nonterminalStates.includes(
                session.lifecycleState as (typeof nonterminalStates)[number]
              )) ||
            (!alreadyTerminal &&
              (!["active", "consumed"].includes(reservation.status) ||
                reservation.expiresAt > now))
          ) {
            return { disposition: "no_longer_recoverable" } as const;
          }

          const updated = alreadyTerminal
            ? [{ id: session.id }]
            : await transaction
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
                  billingFaultCode: "reservation_expired",
                  endingAt: sql`COALESCE(${interviewSession.endingAt}, ${now.toISOString()}::timestamptz)`,
                  endedAt: sql`COALESCE(${interviewSession.endedAt}, ${now.toISOString()}::timestamptz)`,
                  lastTransitionAt: now,
                  reconnectDeadlineAt: null,
                  roomCleanupPending: true,
                })
                .where(
                  and(
                    eq(interviewSession.id, sessionId),
                    eq(interviewSession.lifecycleState, session.lifecycleState),
                    eq(
                      interviewSession.lifecycleVersion,
                      session.lifecycleVersion
                    )
                  )
                )
                .returning({ id: interviewSession.id });
          if (!updated[0]) {
            return { disposition: "no_longer_recoverable" } as const;
          }
          if (!alreadyTerminal) {
            await transaction
              .insert(feedback)
              .values({
                sessionId,
                status: "skipped",
                statusReason:
                  "Interview ended because its recovery window expired",
                rubricVersion: "1.0.0",
                dispatchStatus: "not_required",
              })
              .onConflictDoNothing({ target: feedback.sessionId });
          }
          const credit = await convergeInterviewCreditSettlement({
            sessionId,
            store: createDrizzleInterviewCreditSettlementStore(
              transaction as unknown as CreditLedgerDatabase
            ),
            now,
          });
          return {
            disposition: "recovered",
            creditDisposition: credit.disposition,
          } as const;
        },
        database
      );
    },
  };
}

export async function listInterviewCreditRecoveryCandidates(
  now = new Date(),
  limit = INTERVIEW_CREDIT_RECOVERY_LIMIT
) {
  return createDrizzleInterviewCreditRecoveryStore().listCandidates({
    now,
    limit,
  });
}
