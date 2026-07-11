import assert from "node:assert/strict";
import test from "node:test";

import {
  convergeInterviewCreditSettlement,
  type InterviewCreditSettlementEvidence,
  type InterviewCreditSettlementSession,
  type InterviewCreditSettlementStore,
} from "./converge-interview-credit-settlement";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "650e8400-e29b-41d4-a716-446655440000";
const DELIVERED_EVENT_ID = "writer-1:interviewer-1";

test("activation before a delivered interviewer turn consumes once and replays the marker", async () => {
  const fixture = createFixture({
    activatedAt: new Date("2026-07-10T08:00:00.000Z"),
  });

  assert.deepEqual(await fixture.converge(), { disposition: "pending" });
  fixture.turns.push(qualifyingTurn());
  const consumed = await fixture.converge();
  const replay = await fixture.converge();

  assert.deepEqual(consumed, {
    disposition: "consumed",
    usableTranscriptEventId: DELIVERED_EVENT_ID,
  });
  assert.deepEqual(replay, consumed);
  assert.equal(fixture.session.usableTranscriptEventId, DELIVERED_EVENT_ID);
  assert.equal(fixture.reservationStatus, "consumed");
  assert.equal(fixture.terminalWrites, 1);
  assert.deepEqual(fixture.lockOrder.slice(-4), [
    "app_user",
    "session",
    "reservation",
    "grants",
  ]);
});

test("a delivered interviewer turn before activation stays pending until activation arrives", async () => {
  const fixture = createFixture();
  fixture.turns.push(qualifyingTurn());

  assert.deepEqual(await fixture.converge(), { disposition: "pending" });
  fixture.session.activatedAt = new Date("2026-07-10T08:00:01.000Z");
  assert.equal((await fixture.converge()).disposition, "consumed");
  assert.equal(fixture.terminalWrites, 1);
});

test("partial, user, legacy, and blank turns never cross the usable barrier", async () => {
  const fixture = createFixture({
    activatedAt: new Date("2026-07-10T08:00:00.000Z"),
  });
  fixture.turns.push(
    qualifyingTurn({ deliveryState: "partially_delivered" }),
    qualifyingTurn({ speaker: "user", eventId: "writer-1:user-1" }),
    qualifyingTurn({ contractVersion: 1, eventId: "legacy-event" }),
    qualifyingTurn({ text: "   ", eventId: "writer-1:blank" })
  );

  assert.deepEqual(await fixture.converge(), { disposition: "pending" });
  assert.equal(fixture.session.usableAt, null);
  assert.equal(fixture.reservationStatus, "active");
});

test("a terminal session without usable evidence releases once and replays", async () => {
  const fixture = createFixture({ lifecycleState: "abandoned" });

  const expected = {
    disposition: "released",
    policyVersion: "interview-credit-recovery.v1",
    reason: "terminal_before_usable",
    makeGoodGrantId: null,
  } as const;
  assert.deepEqual(await fixture.converge(), expected);
  assert.deepEqual(await fixture.converge(), expected);
  assert.equal(fixture.reservationStatus, "released");
  assert.equal(fixture.terminalWrites, 1);
});

test("concurrent terminal convergence consumes then records one retained policy", async () => {
  const fixture = createFixture({
    lifecycleState: "completed",
    activatedAt: new Date("2026-07-10T08:00:00.000Z"),
  });
  fixture.turns.push(qualifyingTurn());

  const results = await Promise.all([
    fixture.converge(),
    fixture.converge(),
    fixture.converge(),
  ]);

  assert.deepEqual(
    results.map((result) => result.disposition),
    ["retained", "retained", "retained"]
  );
  assert.equal(fixture.reservationStatus, "consumed");
  assert.equal(fixture.terminalWrites, 1);
  assert.equal(fixture.session.usableTranscriptEventId, DELIVERED_EVENT_ID);
});

test("provider failure after usable evidence refunds exactly once", async () => {
  const fixture = createFixture({
    lifecycleState: "failed",
    activatedAt: new Date("2026-07-10T08:00:00.000Z"),
    usableAt: new Date("2026-07-10T08:00:01.000Z"),
    usableTranscriptEventId: DELIVERED_EVENT_ID,
    billingFault: "provider",
    billingFaultCode: "voice_runtime_provider_failed",
  });
  fixture.turns.push(qualifyingTurn());
  fixture.seedConsumed();

  const results = await Promise.all(
    Array.from({ length: 10 }, () => fixture.converge())
  );

  assert.equal(results.every((result) => result.disposition === "refunded"), true);
  assert.equal(fixture.reservationStatus, "refunded");
  assert.equal(fixture.terminalWrites, 2);
});

test("user outcome after usable evidence retains without refund", async () => {
  const fixture = createFixture({
    lifecycleState: "completed",
    activatedAt: new Date("2026-07-10T08:00:00.000Z"),
    usableAt: new Date("2026-07-10T08:00:01.000Z"),
    usableTranscriptEventId: DELIVERED_EVENT_ID,
    billingFault: "user",
    billingFaultCode: "time_limit",
  });
  fixture.turns.push(qualifyingTurn());
  fixture.seedConsumed();

  assert.equal((await fixture.converge()).disposition, "retained");
  assert.equal(fixture.reservationStatus, "consumed");
  assert.equal(fixture.terminalWrites, 1);
});

test("stored usable evidence must still identify a qualifying canonical turn", async () => {
  const fixture = createFixture({
    activatedAt: new Date("2026-07-10T08:00:00.000Z"),
    usableAt: new Date("2026-07-10T08:00:02.000Z"),
    usableTranscriptEventId: "missing-event",
  });

  await assert.rejects(
    fixture.converge(),
    /interview_usable_transcript_evidence_invalid/
  );
  assert.equal(fixture.reservationStatus, "active");
});

test("a usable-marker write failure rolls back consumption and remains retryable", async () => {
  const fixture = createFixture({
    activatedAt: new Date("2026-07-10T08:00:00.000Z"),
  });
  fixture.turns.push(qualifyingTurn());
  fixture.failUsableWrite = true;

  await assert.rejects(
    fixture.converge(),
    /interview_usable_evidence_write_failed/
  );
  assert.equal(fixture.reservationStatus, "active");
  assert.equal(fixture.terminalWrites, 0);
  assert.equal(fixture.session.usableAt, null);
  assert.equal(fixture.session.usableTranscriptEventId, null);

  fixture.failUsableWrite = false;
  assert.equal((await fixture.converge()).disposition, "consumed");
  assert.equal(fixture.terminalWrites, 1);
});

test("version zero sessions are ignored without touching the ledger", async () => {
  const fixture = createFixture({
    startContractVersion: 0,
    startAttemptId: null,
    lifecycleState: "completed",
  });

  assert.deepEqual(await fixture.converge(), {
    disposition: "ignored_legacy",
  });
  assert.equal(fixture.lockOrder.includes("reservation"), false);
  assert.equal(fixture.reservationStatus, "active");
});

interface TestTurn {
  eventId: string;
  contractVersion: number;
  speaker: "user" | "interviewer";
  deliveryState: "delivered" | "partially_delivered";
  text: string;
}

function qualifyingTurn(overrides: Partial<TestTurn> = {}): TestTurn {
  return {
    eventId: DELIVERED_EVENT_ID,
    contractVersion: 2,
    speaker: "interviewer",
    deliveryState: "delivered",
    text: "Tell me how you would approach this product problem.",
    ...overrides,
  };
}

function createFixture(
  overrides: Partial<InterviewCreditSettlementSession> = {}
) {
  const session: InterviewCreditSettlementSession = {
    sessionId: SESSION_ID,
    userId: USER_ID,
    startContractVersion: 1,
    startAttemptId: SESSION_ID,
    lifecycleState: "active",
    activatedAt: null,
    usableAt: null,
    usableTranscriptEventId: null,
    billingFault: null,
    billingFaultCode: null,
    creditPolicyVersion: null,
    creditSettlementAction: null,
    creditSettlementReason: null,
    creditSettlementIdempotencyKey: null,
    creditSettledAt: null,
    creditMakeGoodGrantId: null,
    ...overrides,
  };
  if (
    ["completed", "abandoned", "failed"].includes(session.lifecycleState) &&
    session.billingFault === null
  ) {
    session.billingFault = "user";
    session.billingFaultCode = "user_end";
  }
  const turns: TestTurn[] = [];
  const lockOrder: string[] = [];
  const transactions = new Map<string, "consume" | "release" | "refund">();
  const tracked: InterviewCreditSettlementEvidence[] = [];
  let reservationStatus: "active" | "consumed" | "released" | "refunded" =
    "active";
  let terminalWrites = 0;
  let failUsableWrite = false;
  let transactionTail = Promise.resolve();

  const store: InterviewCreditSettlementStore = {
    lookupOwner: async (sessionId) =>
      sessionId === session.sessionId ? { userId: session.userId } : null,
    async withUserSessionTransaction({ sessionId, userId, work }) {
      const previous = transactionTail;
      let releaseTransaction!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });
      await previous;
      const sessionBefore = { ...session };
      const reservationStatusBefore = reservationStatus;
      const terminalWritesBefore = terminalWrites;
      const transactionsBefore = new Map(transactions);
      try {
        lockOrder.push("app_user", "session");
        if (sessionId !== session.sessionId || userId !== session.userId) {
          return null;
        }
        return await work({
          session,
          async findQualifyingTurn(eventId) {
            const turn = turns.find(
              (candidate) =>
                candidate.contractVersion === 2 &&
                candidate.speaker === "interviewer" &&
                candidate.deliveryState === "delivered" &&
                candidate.text.trim().length > 0 &&
                (!eventId || candidate.eventId === eventId)
            );
            return turn ? { eventId: turn.eventId } : null;
          },
          async getReservation() {
            lockOrder.push("reservation");
            return { status: reservationStatus };
          },
          async settle(input) {
            lockOrder.push("reservation", "grants");
            const existing = transactions.get(input.idempotencyKey);
            if (existing && existing !== input.action) {
              throw new Error("credit_transaction_idempotency_conflict");
            }
            const nextStatus =
              input.action === "consume"
                ? "consumed"
                : input.action === "refund"
                  ? "refunded"
                  : "released";
            if (!existing) {
              const valid =
                (reservationStatus === "active" &&
                  (nextStatus === "consumed" || nextStatus === "released")) ||
                (reservationStatus === "consumed" && nextStatus === "refunded");
              if (!valid) {
                throw new Error("credit_reservation_terminal_conflict");
              }
              reservationStatus = nextStatus;
              transactions.set(input.idempotencyKey, input.action);
              terminalWrites += 1;
            } else if (reservationStatus !== nextStatus) {
              throw new Error("credit_transaction_idempotency_conflict");
            }
            return settlementEvidence(input.action, input.idempotencyKey);
          },
          async markUsable({ eventId, usableAt }) {
            if (failUsableWrite) {
              throw new Error("interview_usable_evidence_write_failed");
            }
            if (session.usableAt || session.usableTranscriptEventId) {
              throw new Error("interview_usable_evidence_write_conflict");
            }
            session.usableAt = usableAt;
            session.usableTranscriptEventId = eventId;
          },
          async recordPolicySettlement(input) {
            if (session.creditSettledAt) {
              throw new Error("interview_credit_settlement_evidence_write_failed");
            }
            session.creditPolicyVersion = input.policyVersion;
            session.creditSettlementAction = input.action;
            session.creditSettlementReason = input.reason;
            session.creditSettlementIdempotencyKey = input.idempotencyKey;
            session.creditSettledAt = input.settledAt;
            session.creditMakeGoodGrantId = input.makeGoodGrantId;
          },
        });
      } catch (error) {
        Object.assign(session, sessionBefore);
        reservationStatus = reservationStatusBefore;
        terminalWrites = terminalWritesBefore;
        transactions.clear();
        for (const [key, value] of transactionsBefore) {
          transactions.set(key, value);
        }
        throw error;
      } finally {
        releaseTransaction();
      }
    },
    trackCompletedSettlement(evidence) {
      tracked.push(evidence);
    },
  };

  return {
    session,
    turns,
    lockOrder,
    tracked,
    converge: () =>
      convergeInterviewCreditSettlement({
        sessionId: SESSION_ID,
        store,
        now: new Date("2026-07-10T08:00:02.000Z"),
      }),
    get reservationStatus() {
      return reservationStatus;
    },
    get terminalWrites() {
      return terminalWrites;
    },
    seedConsumed() {
      reservationStatus = "consumed";
      transactions.set(
        `consume:interview-start:${USER_ID}:${SESSION_ID}`,
        "consume"
      );
      terminalWrites = 1;
    },
    get failUsableWrite() {
      return failUsableWrite;
    },
    set failUsableWrite(value: boolean) {
      failUsableWrite = value;
    },
  };
}

function settlementEvidence(
  transactionType: "consume" | "release" | "refund",
  idempotencyKey: string
): InterviewCreditSettlementEvidence {
  return {
    transactionType,
    userId: USER_ID,
    credits: 1,
    idempotencyKey,
    sessionId: SESSION_ID,
    reservationId: "750e8400-e29b-41d4-a716-446655440000",
  };
}
