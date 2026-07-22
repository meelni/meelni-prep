import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "./index";
import { interviewQuestion, interviewSession, sessionQuestion } from "./schema";
import type { QuestionBankRecord } from "./questions";
import { reserveCreditInTransaction } from "@/lib/billing/credits";
import type {
  ReserveCreditInput,
  ReserveCreditTransactionResult,
} from "@/lib/billing/credit-ledger-contracts";
import {
  withDrizzleCreditLedgerUserTransaction,
  type CreditLedgerDatabase,
} from "@/lib/billing/credit-ledger-store";
import {
  deriveInterviewDeadlineAt,
  normalizeInterviewDurationMinutes,
} from "@meelni/core";

export const INTERVIEW_START_CONTRACT_VERSION = 1 as const;
export const INTERVIEW_PROVISIONING_LEASE_MS = 120_000;
export const INTERVIEW_SETTLEMENT_GRACE_MS = 10 * 60_000;

export interface StableInterviewStartInput {
  startAttemptId: string;
  userId: string;
  requestFingerprint: string;
  role: string;
  roundType: "behavioral" | "product_sense" | "execution" | "strategy";
  mode: "voice_video" | "text";
  persona?: string;
  roomName: string;
  config: Record<string, unknown>;
  startedAt: Date;
  question: QuestionBankRecord;
}

export interface PersistedStableInterviewStart {
  sessionId: string;
  userId: string;
  startAttemptId: string;
  requestFingerprint: string;
  roundType: StableInterviewStartInput["roundType"];
  roomName: string;
  config: Record<string, unknown>;
  startedAt: Date;
  provisioningState: "pending" | "provisioning" | "ready" | "failed";
  provisionedAt: Date | null;
  lifecycleState:
    | "created"
    | "connecting"
    | "active"
    | "reconnecting"
    | "ending"
    | "completed"
    | "abandoned"
    | "failed";
  lifecycleVersion: number;
  endedAt: Date | null;
  question: QuestionBankRecord;
}

export type ProvisioningClaim =
  | { disposition: "ready"; start: PersistedStableInterviewStart }
  | { disposition: "failed"; start: PersistedStableInterviewStart }
  | { disposition: "busy"; retryAfterMs: number }
  | { disposition: "not_joinable"; start: PersistedStableInterviewStart }
  | {
      disposition: "claimed";
      leaseId: string;
      start: PersistedStableInterviewStart;
    };

export interface InterviewStartStore {
  find(input: {
    startAttemptId: string;
    userId: string;
    requestFingerprint: string;
  }): Promise<PersistedStableInterviewStart | null>;
  createOrLoad(
    input: StableInterviewStartInput
  ): Promise<PersistedStableInterviewStart>;
  createOrLoadAndReserve(input: {
    start: StableInterviewStartInput;
    reservation: ReserveCreditInput;
    currentTime: Date;
  }): Promise<{
    start: PersistedStableInterviewStart;
    credit: ReserveCreditTransactionResult;
  }>;
  claimProvisioning(input: {
    startAttemptId: string;
    userId: string;
    requestFingerprint: string;
    leaseId: string;
    now: Date;
    deadlineAt: Date;
  }): Promise<ProvisioningClaim>;
  markProvisioned(input: {
    startAttemptId: string;
    leaseId: string;
    provisionedAt: Date;
    deadlineAt: Date;
  }): Promise<PersistedStableInterviewStart>;
  authorizeProvisioned(input: {
    startAttemptId: string;
    userId: string;
    requestFingerprint: string;
    deadlineAt: Date;
  }): Promise<{
    start: PersistedStableInterviewStart;
    databaseNow: Date;
    joinable: boolean;
  }>;
  releaseProvisioningClaim(input: {
    startAttemptId: string;
    leaseId: string;
  }): Promise<void>;
  markProvisioningFailed(input: {
    startAttemptId: string;
    leaseId: string;
  }): Promise<void>;
}

export type InterviewStartDatabase = CreditLedgerDatabase;

export function createDrizzleInterviewStartStore(
  database: InterviewStartDatabase = db
): InterviewStartStore {
  return {
    async find(input) {
      return database.transaction(async (transaction) => {
        const rows = await transaction
          .select()
          .from(interviewSession)
          .where(eq(interviewSession.id, input.startAttemptId))
          .limit(1);
        const session = rows[0];
        if (!session) return null;
        if (
          session.userId !== input.userId ||
          session.startContractVersion !== INTERVIEW_START_CONTRACT_VERSION ||
          session.startAttemptId !== input.startAttemptId ||
          session.startRequestFingerprint !== input.requestFingerprint
        ) {
          throw new InterviewStartConflictError();
        }
        return loadStart(transaction, input.startAttemptId);
      });
    },

    async createOrLoad(input) {
      return database.transaction((transaction) =>
        createOrLoadInTransaction(transaction, input)
      );
    },

    async createOrLoadAndReserve(input) {
      return withDrizzleCreditLedgerUserTransaction(
        input.start.userId,
        async ({ database, ledger }) => {
          const start = await createOrLoadInTransaction(database, input.start);
          const deadlineAt = deriveInterviewDeadlineAt({
            startedAt: start.startedAt,
            durationMinutes: normalizeInterviewDurationMinutes(
              start.config.duration
            ),
          });
          const credit = await reserveCreditInTransaction({
            store: ledger,
            input: {
              ...input.reservation,
              expiresAt: new Date(
                deadlineAt.getTime() + INTERVIEW_SETTLEMENT_GRACE_MS
              ),
            },
            currentTime: input.currentTime,
          });
          return { start, credit };
        },
        database
      );
    },

    async claimProvisioning(input) {
      return database.transaction(async (transaction) => {
        const rows = await transaction
          .select()
          .from(interviewSession)
          .where(eq(interviewSession.id, input.startAttemptId))
          .limit(1)
          .for("update");
        const session = rows[0];
        if (
          !session ||
          session.userId !== input.userId ||
          session.startContractVersion !== INTERVIEW_START_CONTRACT_VERSION ||
          session.startAttemptId !== input.startAttemptId ||
          session.startRequestFingerprint !== input.requestFingerprint
        ) {
          throw new InterviewStartConflictError();
        }
        const databaseNow = await readDatabaseNow(
          transaction,
          input.startAttemptId
        );
        assertMatchingDeadline(session, input.deadlineAt);
        if (session.provisioningState === "failed") {
          throw new InterviewStartFailedError();
        }
        if (!isProvisioningJoinable(session, databaseNow, input.deadlineAt)) {
          return {
            disposition: "not_joinable" as const,
            start: await loadStart(transaction, input.startAttemptId),
          };
        }
        if (session.provisioningState === "ready") {
          return {
            disposition: "ready" as const,
            start: await loadStart(transaction, input.startAttemptId),
          };
        }
        if (session.provisioningState === "provisioning") {
          if (
            session.provisioningLeaseExpiresAt &&
            session.provisioningLeaseExpiresAt > databaseNow
          ) {
            return {
              disposition: "busy" as const,
              retryAfterMs: Math.max(
                1,
                session.provisioningLeaseExpiresAt.getTime() -
                  databaseNow.getTime()
              ),
            };
          }

          const failed = await transaction
            .update(interviewSession)
            .set({
              provisioningState: "failed",
              provisioningLeaseId: null,
              provisioningLeaseExpiresAt: null,
            })
            .where(
              and(
                eq(interviewSession.id, input.startAttemptId),
                eq(interviewSession.provisioningState, "provisioning"),
                eq(
                  interviewSession.provisioningLeaseId,
                  session.provisioningLeaseId!
                )
              )
            )
            .returning({ id: interviewSession.id });
          if (!failed[0]) throw new InterviewStartConflictError();
          return {
            disposition: "failed" as const,
            start: await loadStart(transaction, input.startAttemptId),
          };
        }

        const leaseExpiresAt = new Date(
          databaseNow.getTime() + INTERVIEW_PROVISIONING_LEASE_MS
        );
        const updated = await transaction
          .update(interviewSession)
          .set({
            provisioningState: "provisioning",
            provisioningLeaseId: input.leaseId,
            provisioningLeaseExpiresAt: leaseExpiresAt,
          })
          .where(
            and(
              eq(interviewSession.id, input.startAttemptId),
              eq(
                interviewSession.startRequestFingerprint,
                input.requestFingerprint
              ),
              inArray(interviewSession.lifecycleState, [
                "created",
                "connecting",
              ]),
              isNull(interviewSession.endedAt),
              sql`clock_timestamp() < ${input.deadlineAt.toISOString()}::timestamptz`
            )
          )
          .returning({ id: interviewSession.id });
        if (!updated[0]) throw new InterviewStartConflictError();

        return {
          disposition: "claimed" as const,
          leaseId: input.leaseId,
          start: await loadStart(transaction, input.startAttemptId),
        };
      });
    },

    async markProvisioned(input) {
      return database.transaction(async (transaction) => {
        await transaction
          .select({ id: interviewSession.id })
          .from(interviewSession)
          .where(eq(interviewSession.id, input.startAttemptId))
          .limit(1)
          .for("update");
        const rows = await transaction
          .update(interviewSession)
          .set({
            provisioningState: "ready",
            provisioningLeaseId: null,
            provisioningLeaseExpiresAt: null,
            provisionedAt: sql`clock_timestamp()`,
          })
          .where(
            and(
              eq(interviewSession.id, input.startAttemptId),
              eq(interviewSession.provisioningState, "provisioning"),
              eq(interviewSession.provisioningLeaseId, input.leaseId),
              sql`${interviewSession.provisioningLeaseExpiresAt} > clock_timestamp()`,
              inArray(interviewSession.lifecycleState, [
                "connecting",
                "active",
                "reconnecting",
              ]),
              isNull(interviewSession.endedAt),
              sql`clock_timestamp() < ${input.deadlineAt.toISOString()}::timestamptz`
            )
          )
          .returning({ id: interviewSession.id });
        if (!rows[0]) throw new InterviewProvisioningLeaseLostError();
        return loadStart(transaction, input.startAttemptId);
      });
    },

    async authorizeProvisioned(input) {
      return database.transaction(async (transaction) => {
        const rows = await transaction
          .select()
          .from(interviewSession)
          .where(eq(interviewSession.id, input.startAttemptId))
          .limit(1)
          .for("update");
        const session = rows[0];
        if (
          !session ||
          session.userId !== input.userId ||
          session.startContractVersion !== INTERVIEW_START_CONTRACT_VERSION ||
          session.startAttemptId !== input.startAttemptId ||
          session.startRequestFingerprint !== input.requestFingerprint
        ) {
          throw new InterviewStartConflictError();
        }
        assertMatchingDeadline(session, input.deadlineAt);
        const databaseNow = await readDatabaseNow(
          transaction,
          input.startAttemptId
        );
        return {
          start: await loadStart(transaction, input.startAttemptId),
          databaseNow,
          joinable:
            session.provisioningState === "ready" &&
            isProvisioningJoinable(session, databaseNow, input.deadlineAt),
        };
      });
    },

    async releaseProvisioningClaim(input) {
      await database
        .update(interviewSession)
        .set({
          provisioningState: "pending",
          provisioningLeaseId: null,
          provisioningLeaseExpiresAt: null,
        })
        .where(
          and(
            eq(interviewSession.id, input.startAttemptId),
            eq(interviewSession.provisioningState, "provisioning"),
            eq(interviewSession.provisioningLeaseId, input.leaseId)
          )
        );
    },

    async markProvisioningFailed(input) {
      const rows = await database
        .update(interviewSession)
        .set({
          provisioningState: "failed",
          provisioningLeaseId: null,
          provisioningLeaseExpiresAt: null,
        })
        .where(
          and(
            eq(interviewSession.id, input.startAttemptId),
            eq(interviewSession.provisioningState, "provisioning"),
            eq(interviewSession.provisioningLeaseId, input.leaseId)
          )
        )
        .returning({ id: interviewSession.id });
      if (!rows[0]) throw new InterviewProvisioningLeaseLostError();
    },
  };
}

type StartDatabase = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function readDatabaseNow(
  transaction: StartDatabase,
  sessionId: string
): Promise<Date> {
  const rows = await transaction
    .select({ databaseNow: sql<Date>`clock_timestamp()` })
    .from(interviewSession)
    .where(eq(interviewSession.id, sessionId))
    .limit(1);
  const rawDatabaseNow = rows[0]?.databaseNow as Date | string | undefined;
  const databaseNow =
    rawDatabaseNow instanceof Date
      ? rawDatabaseNow
      : typeof rawDatabaseNow === "string"
        ? new Date(rawDatabaseNow)
        : null;
  if (!databaseNow || Number.isNaN(databaseNow.getTime())) {
    throw new Error("interview_start_database_time_invalid");
  }
  return databaseNow;
}

function assertMatchingDeadline(
  session: typeof interviewSession.$inferSelect,
  expectedDeadlineAt: Date
): void {
  if (!session.startedAt || Number.isNaN(expectedDeadlineAt.getTime())) {
    throw new InterviewStartConflictError();
  }
  const config = isRecord(session.config) ? session.config : {};
  const storedDeadlineAt = deriveInterviewDeadlineAt({
    startedAt: session.startedAt,
    durationMinutes: normalizeInterviewDurationMinutes(config.duration),
  });
  if (storedDeadlineAt.getTime() !== expectedDeadlineAt.getTime()) {
    throw new InterviewStartConflictError();
  }
}

function isProvisioningJoinable(
  session: typeof interviewSession.$inferSelect,
  databaseNow: Date,
  deadlineAt: Date
): boolean {
  return (
    session.endedAt === null &&
    ["created", "connecting", "active", "reconnecting"].includes(
      session.lifecycleState
    ) &&
    databaseNow.getTime() < deadlineAt.getTime()
  );
}

async function createOrLoadInTransaction(
  transaction: StartDatabase,
  input: StableInterviewStartInput
): Promise<PersistedStableInterviewStart> {
  await transaction
    .insert(interviewSession)
    .values({
      id: input.startAttemptId,
      userId: input.userId,
      role: input.role,
      roundType: input.roundType,
      mode: input.mode,
      persona: input.persona,
      livekitRoomName: input.roomName,
      config: input.config,
      startedAt: input.startedAt,
      startContractVersion: INTERVIEW_START_CONTRACT_VERSION,
      startAttemptId: input.startAttemptId,
      startRequestFingerprint: input.requestFingerprint,
      provisioningState: "pending",
    })
    .onConflictDoNothing({ target: interviewSession.id });

  const rows = await transaction
    .select()
    .from(interviewSession)
    .where(eq(interviewSession.id, input.startAttemptId))
    .limit(1)
    .for("update");
  assertMatchingStart(rows[0], input);

  await transaction
    .insert(sessionQuestion)
    .values({
      sessionId: input.startAttemptId,
      questionId: input.question.id,
      startContractVersion: INTERVIEW_START_CONTRACT_VERSION,
      startAttemptId: input.startAttemptId,
    })
    .onConflictDoNothing({ target: sessionQuestion.sessionId });

  return loadStart(transaction, input.startAttemptId);
}

async function loadStart(
  database: StartDatabase,
  startAttemptId: string
): Promise<PersistedStableInterviewStart> {
  const rows = await database
    .select({
      session: interviewSession,
      question: interviewQuestion,
    })
    .from(interviewSession)
    .innerJoin(
      sessionQuestion,
      eq(sessionQuestion.sessionId, interviewSession.id)
    )
    .innerJoin(
      interviewQuestion,
      eq(interviewQuestion.id, sessionQuestion.questionId)
    )
    .where(eq(interviewSession.id, startAttemptId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("interview_start_question_missing");
  if (
    row.session.startContractVersion !== INTERVIEW_START_CONTRACT_VERSION ||
    row.session.startAttemptId !== startAttemptId ||
    !row.session.startRequestFingerprint ||
    !row.session.livekitRoomName ||
    !row.session.startedAt
  ) {
    throw new InterviewStartConflictError();
  }
  if (!isProvisioningState(row.session.provisioningState)) {
    throw new InterviewStartConflictError();
  }

  return {
    sessionId: row.session.id,
    userId: row.session.userId,
    startAttemptId,
    requestFingerprint: row.session.startRequestFingerprint,
    roundType: row.session.roundType as StableInterviewStartInput["roundType"],
    roomName: row.session.livekitRoomName,
    config: isRecord(row.session.config) ? row.session.config : {},
    startedAt: row.session.startedAt,
    provisioningState: row.session.provisioningState,
    provisionedAt: row.session.provisionedAt,
    lifecycleState: row.session.lifecycleState,
    lifecycleVersion: row.session.lifecycleVersion,
    endedAt: row.session.endedAt,
    question: {
      id: row.question.id,
      company: row.question.company,
      questionText: row.question.questionText,
      questionType: row.question.questionType,
      askedAt: row.question.askedAt,
      isActive: row.question.isActive,
      createdAt: row.question.createdAt,
    },
  };
}

function assertMatchingStart(
  session: typeof interviewSession.$inferSelect | undefined,
  input: StableInterviewStartInput
): asserts session is typeof interviewSession.$inferSelect {
  if (
    !session ||
    session.userId !== input.userId ||
    session.startContractVersion !== INTERVIEW_START_CONTRACT_VERSION ||
    session.startAttemptId !== input.startAttemptId ||
    session.startRequestFingerprint !== input.requestFingerprint ||
    session.livekitRoomName !== input.roomName
  ) {
    throw new InterviewStartConflictError();
  }
}

function isProvisioningState(
  value: string
): value is PersistedStableInterviewStart["provisioningState"] {
  return ["pending", "provisioning", "ready", "failed"].includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class InterviewStartConflictError extends Error {
  constructor() {
    super("interview_start_attempt_conflict");
    this.name = "InterviewStartConflictError";
  }
}

export class InterviewStartFailedError extends Error {
  constructor() {
    super("interview_start_attempt_failed");
    this.name = "InterviewStartFailedError";
  }
}

export class InterviewProvisioningLeaseLostError extends Error {
  constructor() {
    super("interview_provisioning_lease_lost");
    this.name = "InterviewProvisioningLeaseLostError";
  }
}
