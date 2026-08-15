import assert from "node:assert/strict";
import test from "node:test";

import type {
  FeedbackGenerationRecord,
  FeedbackGenerationStore,
} from "@/lib/db/feedback-generation-state";
import type { FrozenCandidateAnswerBlockEvidenceSnapshot } from "@/lib/evaluation/session-validator";
import {
  recoverFeedbackGenerationWorkflow,
  type RecoverFeedbackGenerationDeps,
} from "./recover-feedback-generation";

const SESSION_ID = "recovery-session-1";
const USER_ID = "recovery-user-1";
const EVENT_1 = `feedback/generate.requested:${SESSION_ID}:1`;
const EVENT_2 = `feedback/generate.requested:${SESSION_ID}:2`;
const NOW = new Date("2026-07-10T15:00:00.000Z");

test("failed work is prepared once and dispatched with a fresh event", async () => {
  const store = new RecoveryStore(record({ status: "failed" }));
  const dispatched: string[] = [];
  const deps = dependencies(store, dispatched);

  const results = await Promise.all([
    recoverFeedbackGenerationWorkflow(input(), deps),
    recoverFeedbackGenerationWorkflow(input(), deps),
  ]);

  assert.equal(store.prepareCount, 1);
  assert.equal(dispatched.length, 1);
  assert.equal(store.current?.eventId, EVENT_2);
  assert.ok(results.every((result) => result.ok));
});

test("expired and null processing leases reset once and dispatch once while a fresh lease stays active", async () => {
  for (const processingStartedAt of [
    new Date("2026-07-10T14:50:00.000Z"),
    null,
  ]) {
    const stale = new RecoveryStore(
      record({ status: "processing", processingStartedAt })
    );
    const staleDispatches: string[] = [];
    const staleDeps = dependencies(stale, staleDispatches);
    const recovered = await Promise.all([
      recoverFeedbackGenerationWorkflow(input(), staleDeps),
      recoverFeedbackGenerationWorkflow(input(), staleDeps),
    ]);

    assert.ok(recovered.every((result) => result.ok));
    assert.equal(stale.prepareCount, 1);
    assert.equal(staleDispatches.length, 1);
  }

  const active = new RecoveryStore(
    record({ status: "processing", processingStartedAt: NOW })
  );
  const activeDispatches: string[] = [];
  const waiting = await recoverFeedbackGenerationWorkflow(
    input(),
    dependencies(active, activeDispatches)
  );
  assert.deepEqual(waiting, {
    ok: true,
    status: "processing",
    disposition: "in_progress",
    retryable: false,
    dispatch: null,
  });
  assert.equal(active.prepareCount, 0);
  assert.equal(activeDispatches.length, 0);
});

test("a sent queue item that was never claimed rotates identity before redispatch", async () => {
  const store = new RecoveryStore(
    record({
      status: "pending",
      dispatchStatus: "sent",
      dispatchedAt: new Date("2026-07-10T14:58:30.000Z"),
    })
  );
  const dispatched: string[] = [];

  const result = await recoverFeedbackGenerationWorkflow(
    input(),
    dependencies(store, dispatched)
  );

  assert.equal(result.ok && result.status, "pending");
  assert.equal(store.prepareCount, 1);
  assert.equal(store.current?.eventId, EVENT_2);
  assert.equal(dispatched.length, 1);
});

test("terminal outcomes and cross-user requests cannot mutate state", async () => {
  for (const status of ["completed", "skipped"] as const) {
    const store = new RecoveryStore(record({ status }));
    const dispatches: string[] = [];
    const result = await recoverFeedbackGenerationWorkflow(
      input(),
      dependencies(store, dispatches)
    );
    assert.equal(result.ok && result.disposition, "already_terminal");
    assert.equal(store.prepareCount, 0);
    assert.equal(dispatches.length, 0);
  }

  const store = new RecoveryStore(record({ status: "failed" }));
  const result = await recoverFeedbackGenerationWorkflow(
    { ...input(), userId: "other-user" },
    dependencies(store, [])
  );
  assert.deepEqual(result, { ok: false, reason: "not_found" });
  assert.equal(store.prepareCount, 0);
});

test("an exact integrity skip revalidates frozen evidence and rotates dispatch identity", async () => {
  const store = new RecoveryStore(
    record({
      status: "skipped",
      statusReason: "transcript_integrity_degraded",
      outcomeReason: "transcript_integrity_degraded",
      completionTier: "insufficient",
      dispatchStatus: "sent",
      dispatchClaimedAt: NOW,
      dispatchedAt: NOW,
    })
  );
  const dispatches: string[] = [];
  const deps = dependencies(store, dispatches);
  deps.evaluateSkippedRecovery = () => ({
    eligible: true,
    completionTier: "partial",
    evidenceFailureReason: null,
    trustedBlockCount: 2,
  });

  const result = await recoverFeedbackGenerationWorkflow(input(), deps);

  assert.equal(result.ok && result.status, "pending");
  assert.equal(store.skippedPrepareCount, 1);
  assert.notEqual(store.lastSkippedFenceEventId, EVENT_1);
  assert.equal(store.current?.completionTier, "partial");
  assert.equal(store.current?.eventId, EVENT_2);
  assert.equal(dispatches.length, 1);
});

test("integrity skips fail closed when frozen authority cannot recover trusted blocks", async () => {
  const store = new RecoveryStore(
    record({
      status: "skipped",
      statusReason: "transcript_integrity_degraded",
      outcomeReason: "transcript_integrity_degraded",
      completionTier: "insufficient",
      dispatchStatus: "sent",
      dispatchClaimedAt: NOW,
      dispatchedAt: NOW,
    })
  );
  const dispatches: string[] = [];
  const deps = dependencies(store, dispatches);
  let evidenceReads = 0;
  deps.getFrozenEvidence = async () => {
    evidenceReads += 1;
    return invalidFrozenEvidence();
  };

  const result = await recoverFeedbackGenerationWorkflow(input(), deps);

  assert.equal(result.ok && result.disposition, "already_terminal");
  assert.equal(evidenceReads, 1);
  assert.equal(store.skippedPrepareCount, 0);
  assert.equal(dispatches.length, 0);
});

test("other skipped outcomes never read evidence or reopen", async () => {
  const variants = [
    { statusReason: "no_reviewable_answer" },
    { outcomeReason: "no_reviewable_answer" },
    { dispatchStatus: "failed" },
    { eventId: null },
  ] as const;
  for (const variant of variants) {
    const store = new RecoveryStore(
      record({
        status: "skipped",
        statusReason: "transcript_integrity_degraded",
        outcomeReason: "transcript_integrity_degraded",
        dispatchStatus: "sent",
        dispatchedAt: NOW,
        ...variant,
      })
    );
    const deps = dependencies(store, []);
    let evidenceReads = 0;
    deps.getFrozenEvidence = async () => {
      evidenceReads += 1;
      return invalidFrozenEvidence();
    };

    const result = await recoverFeedbackGenerationWorkflow(input(), deps);

    assert.equal(result.ok && result.disposition, "already_terminal");
    assert.equal(evidenceReads, 0);
    assert.equal(store.skippedPrepareCount, 0);
  }
});

test("hard-deadline recovery waits for durable room cleanup acknowledgement", async () => {
  const store = new RecoveryStore(record({ status: "failed" }));
  const dispatches: string[] = [];
  const deps = dependencies(store, dispatches);
  deps.getSession = async () => ({
    userId: USER_ID,
    lifecycleState: "completed",
    terminalReason: "time_limit",
    deadlineRoomCleanupStatus: "pending",
  });

  const result = await recoverFeedbackGenerationWorkflow(input(), deps);

  assert.deepEqual(result, {
    ok: false,
    reason: "deadline_settlement_pending",
  });
  assert.equal(store.prepareCount, 0);
  assert.equal(dispatches.length, 0);
});

test("a terminal session missing feedback is repaired before dispatch", async () => {
  const store = new RecoveryStore(null);
  const dispatches: string[] = [];
  let repairs = 0;
  const deps = dependencies(store, dispatches);
  deps.repairMissing = async () => {
    repairs += 1;
    store.current = record();
    return true;
  };

  const result = await recoverFeedbackGenerationWorkflow(input(), deps);

  assert.equal(result.ok && result.status, "pending");
  assert.equal(repairs, 1);
  assert.equal(dispatches.length, 1);
});

test("an ending session repairs missing feedback before dispatch", async () => {
  const store = new RecoveryStore(null);
  const dispatches: string[] = [];
  const deps = dependencies(store, dispatches, "ending");
  let repairs = 0;
  deps.repairMissing = async () => {
    repairs += 1;
    store.current = record();
    return true;
  };

  const result = await recoverFeedbackGenerationWorkflow(input(), deps);

  assert.equal(result.ok && result.status, "pending");
  assert.equal(repairs, 1);
  assert.equal(dispatches.length, 1);
});

test("legacy failed work without a durable identity stays closed", async () => {
  const store = new RecoveryStore(
    record({
      status: "failed",
      eventId: null,
      dispatchStatus: "not_required",
    })
  );
  const dispatches: string[] = [];

  const result = await recoverFeedbackGenerationWorkflow(
    input(),
    dependencies(store, dispatches)
  );

  assert.deepEqual(result, {
    ok: true,
    status: "failed",
    disposition: "dispatch_failed",
    retryable: false,
    dispatch: null,
  });
  assert.equal(dispatches.length, 0);
});

test("account deletion blocks repair and dispatch", async () => {
  const store = new RecoveryStore(record({ status: "failed" }));
  const dispatches: string[] = [];
  const deps = dependencies(store, dispatches);
  deps.isDeletionPending = async () => true;

  const result = await recoverFeedbackGenerationWorkflow(input(), deps);

  assert.deepEqual(result, { ok: false, reason: "not_found" });
  assert.equal(store.prepareCount, 0);
  assert.equal(dispatches.length, 0);
});

test("missing completion tier is never promoted to full", async () => {
  const store = new RecoveryStore(record({ completionTier: null }));
  const dispatches: string[] = [];

  const result = await recoverFeedbackGenerationWorkflow(
    input(),
    dependencies(store, dispatches)
  );

  assert.deepEqual(result, {
    ok: true,
    status: "failed",
    disposition: "dispatch_failed",
    retryable: false,
    dispatch: null,
  });
  assert.equal(store.prepareCount, 0);
  assert.equal(dispatches.length, 0);
});

function dependencies(
  store: RecoveryStore,
  dispatched: string[],
  lifecycleState: "ending" | "completed" = "completed"
): RecoverFeedbackGenerationDeps {
  return {
    store,
    now: () => NOW,
    isDeletionPending: async () => false,
    getSession: async () => ({
      userId: USER_ID,
      lifecycleState,
      terminalReason: "user_end",
      deadlineRoomCleanupStatus: null,
    }),
    repairMissing: async () => false,
    getFrozenEvidence: async () => invalidFrozenEvidence(),
    evaluateSkippedRecovery: () => ({
      eligible: false,
      completionTier: null,
      evidenceFailureReason: "transcript_integrity_degraded",
      trustedBlockCount: 0,
    }),
    async dispatch({ sessionId }) {
      if (store.current?.dispatchStatus === "sent") {
        return {
          ok: true,
          disposition: "already_sent",
          dispatch: dispatchRecord(store.current),
        };
      }
      const nextEvent = EVENT_2;
      store.current = {
        ...store.current!,
        eventId: nextEvent,
        dispatchStatus: "sent",
        dispatchClaimedAt: NOW,
        dispatchedAt: NOW,
      };
      dispatched.push(sessionId);
      return {
        ok: true,
        disposition: "sent",
        dispatch: dispatchRecord(store.current),
      };
    },
  };
}

function input() {
  return { sessionId: SESSION_ID, userId: USER_ID };
}

function record(
  overrides: Partial<FeedbackGenerationRecord> = {}
): FeedbackGenerationRecord {
  return {
    sessionId: SESSION_ID,
    status: "pending",
    statusReason: null,
    outcomeReason: null,
    eventId: EVENT_1,
    processingStartedAt: null,
    completionTier: "full",
    completionStats: {
      totalTurns: 10,
      userTurns: 5,
      totalWords: 100,
      durationSeconds: 60,
      substantiveResponses: 5,
      scoreableResponses: 5,
    },
    dispatchStatus: "pending",
    dispatchClaimedAt: null,
    dispatchedAt: null,
    ...overrides,
  };
}

function dispatchRecord(value: FeedbackGenerationRecord) {
  return {
    sessionId: value.sessionId,
    eventId: value.eventId,
    status: value.dispatchStatus,
    attempts: value.eventId === EVENT_2 ? 2 : 1,
    claimedAt: value.dispatchClaimedAt,
    dispatchedAt: value.dispatchedAt,
  };
}

function invalidFrozenEvidence(): FrozenCandidateAnswerBlockEvidenceSnapshot {
  return {
    snapshotValid: false,
    snapshotState: null,
    turns: [],
    interruptions: [],
    sessionEndAt: null,
    sourceOverflow: false,
    authority: null,
  };
}

class RecoveryStore implements FeedbackGenerationStore {
  prepareCount = 0;
  skippedPrepareCount = 0;
  lastSkippedFenceEventId: string | null = null;

  constructor(public current: FeedbackGenerationRecord | null) {}

  async get() {
    return this.current ? { ...this.current } : null;
  }

  async prepareRetry() {
    if (
      !this.current ||
      (this.current.status !== "failed" &&
        this.current.status !== "processing" &&
        !(
          this.current.status === "pending" &&
          this.current.dispatchStatus === "sent"
        )) ||
      this.current.eventId === null ||
      this.current.dispatchStatus === "not_required"
    ) {
      return { prepared: false, record: this.current };
    }
    this.prepareCount += 1;
    this.current = {
      ...this.current,
      status: "pending",
      statusReason: null,
      processingStartedAt: null,
      dispatchStatus: "failed",
      dispatchClaimedAt: null,
      dispatchedAt: null,
    };
    return { prepared: true, record: { ...this.current } };
  }

  async prepareSkippedIntegrityRetry() {
    if (
      !this.current ||
      this.current.status !== "skipped" ||
      this.current.statusReason !== "transcript_integrity_degraded" ||
      this.current.outcomeReason !== "transcript_integrity_degraded" ||
      this.current.dispatchStatus !== "sent" ||
      this.current.eventId === null
    ) {
      return { prepared: false, record: this.current };
    }
    this.skippedPrepareCount += 1;
    this.lastSkippedFenceEventId = `feedback/recovery.fenced:${SESSION_ID}:2`;
    this.current = {
      ...this.current,
      status: "pending",
      statusReason: null,
      outcomeReason: null,
      completionTier: "partial",
      processingStartedAt: null,
      dispatchStatus: "failed",
      eventId: this.lastSkippedFenceEventId,
      dispatchClaimedAt: null,
      dispatchedAt: null,
    };
    return { prepared: true, record: { ...this.current } };
  }

  async claim() {
    return null;
  }
  async complete() {
    return false;
  }
  async skip() {
    return false;
  }
  async fail() {
    return false;
  }
}
