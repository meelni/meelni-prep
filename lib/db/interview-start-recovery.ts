import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  projectLegacyInterviewSessionStatus,
  type InterviewLifecycleState,
} from "@meelni/core";

import { db } from "./index";
import { creditReservation, interviewSession } from "./schema";
import type { CreditLedgerDatabase } from "@/lib/billing/credit-ledger-store";

export const INTERVIEW_START_RECOVERY_STALE_MS = 5 * 60_000;

export interface InterviewStartRecoveryCandidate {
  sessionId: string;
}

export type ClaimInterviewStartRecoveryResult =
  | { disposition: "claimed"; sessionId: string; roomName: string }
  | { disposition: "already_terminal"; sessionId: string; roomName: string }
  | { disposition: "no_longer_recoverable" };

export interface InterviewStartRecoveryStore {
  listCandidates(input: {
    now: Date;
    limit?: number;
  }): Promise<InterviewStartRecoveryCandidate[]>;
  claim(input: {
    sessionId: string;
    now: Date;
  }): Promise<ClaimInterviewStartRecoveryResult>;
}

const terminalStates: InterviewLifecycleState[] = [
  "completed",
  "abandoned",
  "failed",
];

const recoverableLifecycleStates: InterviewLifecycleState[] = [
  "created",
  "connecting",
];

export type InterviewStartRecoveryDatabase = CreditLedgerDatabase;

export function createDrizzleInterviewStartRecoveryStore(
  database: InterviewStartRecoveryDatabase = db
): InterviewStartRecoveryStore {
  return {
    async listCandidates({ now, limit = 250 }) {
      const staleBefore = new Date(
        now.getTime() - INTERVIEW_START_RECOVERY_STALE_MS
      );
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
            eq(creditReservation.startContractVersion, 1),
            eq(creditReservation.status, "active")
          )
        )
        .where(
          and(
            eq(interviewSession.startContractVersion, 1),
            or(
              inArray(interviewSession.lifecycleState, terminalStates),
              and(
                inArray(
                  interviewSession.lifecycleState,
                  recoverableLifecycleStates
                ),
                isNull(interviewSession.activatedAt),
                isNull(interviewSession.usableAt),
                or(
                  and(
                    eq(interviewSession.provisioningState, "pending"),
                    lte(interviewSession.lastTransitionAt, staleBefore)
                  ),
                  and(
                    eq(interviewSession.provisioningState, "provisioning"),
                    lte(interviewSession.provisioningLeaseExpiresAt, now)
                  ),
                  eq(interviewSession.provisioningState, "failed")
                )
              )
            )
          )
        )
        .orderBy(
          asc(interviewSession.lastTransitionAt),
          asc(interviewSession.id)
        )
        .limit(limit);

      return rows;
    },

    async claim({ sessionId, now }) {
      return database.transaction(async (transaction) => {
        const rows = await transaction
          .select({
            lifecycleState: interviewSession.lifecycleState,
            roomName: interviewSession.livekitRoomName,
          })
          .from(interviewSession)
          .where(
            and(
              eq(interviewSession.id, sessionId),
              eq(interviewSession.startContractVersion, 1)
            )
          )
          .limit(1)
          .for("update");
        const current = rows[0];
        if (!current?.roomName) return { disposition: "no_longer_recoverable" };

        if (terminalStates.includes(current.lifecycleState)) {
          return {
            disposition: "already_terminal",
            sessionId,
            roomName: current.roomName,
          };
        }

        const staleBefore = new Date(
          now.getTime() - INTERVIEW_START_RECOVERY_STALE_MS
        );
        const updated = await transaction
          .update(interviewSession)
          .set({
            provisioningState: "failed",
            provisioningLeaseId: null,
            provisioningLeaseExpiresAt: null,
            lifecycleState: "failed",
            lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 1`,
            terminalReason: "provider_failure",
            billingFault: "provider",
            billingFaultCode: "start_recovery_timeout",
            status: projectLegacyInterviewSessionStatus({
              state: "failed",
              terminalReason: "provider_failure",
            }),
            endingAt: sql`COALESCE(${interviewSession.endingAt}, ${now.toISOString()}::timestamptz)`,
            endedAt: sql`COALESCE(${interviewSession.endedAt}, ${now.toISOString()}::timestamptz)`,
            lastTransitionAt: now,
            reconnectDeadlineAt: null,
            roomCleanupPending: true,
          })
          .where(
            and(
              eq(interviewSession.id, sessionId),
              eq(interviewSession.startContractVersion, 1),
              inArray(
                interviewSession.lifecycleState,
                recoverableLifecycleStates
              ),
              isNull(interviewSession.activatedAt),
              isNull(interviewSession.usableAt),
              or(
                and(
                  eq(interviewSession.provisioningState, "pending"),
                  lte(interviewSession.lastTransitionAt, staleBefore)
                ),
                and(
                  eq(interviewSession.provisioningState, "provisioning"),
                  lte(interviewSession.provisioningLeaseExpiresAt, now)
                ),
                eq(interviewSession.provisioningState, "failed")
              ),
              sql`EXISTS (
                SELECT 1 FROM ${creditReservation} reservation
                WHERE reservation.session_id = ${interviewSession.id}
                  AND reservation.user_id = ${interviewSession.userId}
                  AND reservation.start_attempt_id = ${interviewSession.startAttemptId}
                  AND reservation.start_contract_version = 1
                  AND reservation.status = 'active'
              )`
            )
          )
          .returning({ id: interviewSession.id });

        if (!updated[0]) return { disposition: "no_longer_recoverable" };
        return {
          disposition: "claimed",
          sessionId,
          roomName: current.roomName,
        };
      });
    },
  };
}

export async function listInterviewStartRecoveryCandidates(
  now = new Date(),
  limit = 250
): Promise<InterviewStartRecoveryCandidate[]> {
  return createDrizzleInterviewStartRecoveryStore().listCandidates({
    now,
    limit,
  });
}
