import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
  type FeedbackQualitySignalView,
} from "@meelni/core";

import {
  readFeedbackQualitySignalWorkflow,
  writeFeedbackQualitySignalWorkflow,
  type FeedbackQualitySignalRepository,
} from "./feedback-quality-signal";

const signal: FeedbackQualitySignalView = {
  contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
  outcome: "partial_scorecard",
  response: "helpful",
  reason: null,
  revision: 1,
  createdAt: "2026-08-13T12:00:00.000Z",
  updatedAt: "2026-08-13T12:00:00.000Z",
};

test("read is deletion fenced before and after owner lookup", async () => {
  let checks = 0;
  const result = await readFeedbackQualitySignalWorkflow(
    { userId: "owner", sessionId: "session" },
    {
      isDeletionPending: async () => ++checks === 2,
      repository: {
        readOwned: async () => ({
          disposition: "available",
          state: { outcome: "partial_scorecard", signal },
        }),
        writeOwned: async () => {
          throw new Error("not used");
        },
      },
    }
  );
  assert.deepEqual(result, {
    ok: false,
    reason: "account_deletion_pending",
  });
});

test("write rejects an outcome-incompatible closed reason before mutation", async () => {
  let writes = 0;
  const result = await writeFeedbackQualitySignalWorkflow(
    {
      userId: "owner",
      sessionId: "session",
      command: {
        contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
        response: "not_helpful",
        reason: "score_withholding_unclear",
        expectedRevision: null,
      },
    },
    dependencies({
      writeOwned: async () => {
        writes += 1;
        throw new Error("must not write");
      },
    })
  );
  assert.deepEqual(result, { ok: false, reason: "invalid_request" });
  assert.equal(writes, 0);
});

test("write preserves created, unchanged, updated, and conflict dispositions", async () => {
  for (const disposition of ["created", "unchanged", "updated"] as const) {
    const result = await writeFeedbackQualitySignalWorkflow(
      command(),
      dependencies({
        writeOwned: async () => ({
          disposition,
          state: { outcome: "partial_scorecard", signal },
        }),
      })
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.disposition, disposition);
  }
  const conflict = await writeFeedbackQualitySignalWorkflow(
    command(),
    dependencies({
      writeOwned: async () => ({
        disposition: "conflict",
        state: { outcome: "partial_scorecard", signal },
      }),
    })
  );
  assert.deepEqual(conflict, {
    ok: false,
    reason: "conflict",
    state: { outcome: "partial_scorecard", signal },
  });
});

test("inaccessible and invalid source states fail closed", async () => {
  for (const disposition of ["not_found", "signal_invalid"] as const) {
    const result = await readFeedbackQualitySignalWorkflow(
      { userId: "owner", sessionId: "session" },
      dependencies({
        readOwned: async () => ({ disposition }),
      })
    );
    assert.deepEqual(result, { ok: false, reason: disposition });
  }
});

function command() {
  return {
    userId: "owner",
    sessionId: "session",
    command: {
      contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
      response: "helpful",
      reason: null,
      expectedRevision: null,
    },
  };
}

function dependencies(
  overrides: Partial<FeedbackQualitySignalRepository> = {}
) {
  const repository: FeedbackQualitySignalRepository = {
    readOwned: async () => ({
      disposition: "available",
      state: { outcome: "partial_scorecard", signal: null },
    }),
    writeOwned: async () => ({
      disposition: "created",
      state: { outcome: "partial_scorecard", signal },
    }),
    ...overrides,
  };
  return {
    repository,
    isDeletionPending: async () => false,
  };
}
