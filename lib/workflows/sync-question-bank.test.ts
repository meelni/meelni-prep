import assert from "node:assert/strict";
import test from "node:test";

import { QuestionSyncLockUnavailableError } from "@/lib/db/question-sync-lock";
import type { QuestionSyncStore } from "@/lib/question-sync/store";
import {
  runQuestionSyncWorkflow,
  type QuestionSyncAuditEvent,
  type QuestionSyncWorkflowDependencies,
} from "./sync-question-bank";
import type {
  PreparedQuestionSync,
  SyncResult,
} from "@/lib/question-sync/types";

test("completed question sync exposes only safe aggregate results", async () => {
  const audit: QuestionSyncAuditEvent[] = [];
  const result = await runQuestionSyncWorkflow(
    { trigger: "cron", dryRun: false },
    dependencies({
      audit: (event) => audit.push(event),
      mutate: async () =>
        syncResult({
          questionsAdded: 2,
          errorMessages: ["provider-sheet-id user@example.com"],
        }),
    })
  );

  assert.equal(result.status, "completed");
  assert.equal(JSON.stringify(result).includes("provider-sheet-id"), false);
  assert.equal(JSON.stringify(audit).includes("user@example.com"), false);
  assert.deepEqual(audit[0]?.summary, {
    questionsAdded: 2,
    questionsUpdated: 0,
    questionsDeactivated: 0,
    questionsSkipped: 0,
    totalProcessed: 2,
    errors: 0,
  });
});

test("failed database mutation returns and audits a redacted error code", async () => {
  const audit: QuestionSyncAuditEvent[] = [];
  const result = await runQuestionSyncWorkflow(
    { trigger: "manual", dryRun: true },
    dependencies({
      audit: (event) => audit.push(event),
      mutate: async () => {
        throw new Error("private database response");
      },
    })
  );

  assert.equal(result.status, "failed");
  assert.equal(JSON.stringify(result).includes("private database"), false);
  assert.equal(JSON.stringify(audit).includes("private database"), false);
});

test("provider preparation happens before the lock and exceptions stay redacted", async () => {
  const order: string[] = [];
  const result = await runQuestionSyncWorkflow(
    { trigger: "cron", dryRun: false },
    dependencies({
      prepare: async () => {
        order.push("prepare");
        throw new Error("private-sheet-id user@example.com");
      },
      withLock: async () => {
        order.push("lock");
        return { acquired: false };
      },
    })
  );

  assert.equal(result.status, "failed");
  assert.deepEqual(order, ["prepare"]);
  assert.equal(JSON.stringify(result).includes("private-sheet-id"), false);
});

test("a concurrent sync is rejected before database mutation", async () => {
  let mutationCalls = 0;
  const result = await runQuestionSyncWorkflow(
    { trigger: "cron", dryRun: false },
    dependencies({
      mutate: async () => {
        mutationCalls++;
        return syncResult();
      },
      withLock: async () => ({ acquired: false }),
    })
  );

  assert.equal(result.status, "busy");
  assert.equal(mutationCalls, 0);
});

test("the workflow lock serializes mutations and releases for retry", async () => {
  const withLock = memoryLock();
  let releaseFirst!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const holdFirst = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let calls = 0;
  const deps = dependencies({
    withLock,
    mutate: async () => {
      calls++;
      if (calls === 1) {
        markStarted();
        await holdFirst;
      }
      return syncResult();
    },
  });

  const first = runQuestionSyncWorkflow(
    { trigger: "cron", dryRun: false },
    deps
  );
  await started;
  const concurrent = await runQuestionSyncWorkflow(
    { trigger: "manual", dryRun: true },
    deps
  );
  releaseFirst();

  assert.equal(concurrent.status, "busy");
  assert.equal((await first).status, "completed");
  assert.equal(
    (await runQuestionSyncWorkflow({ trigger: "cli", dryRun: true }, deps))
      .status,
    "completed"
  );
  assert.equal(calls, 2);
});

test("lock failures are fail-closed and do not expose infrastructure errors", async () => {
  const result = await runQuestionSyncWorkflow(
    { trigger: "cron", dryRun: false },
    dependencies({
      withLock: async () => {
        throw new QuestionSyncLockUnavailableError();
      },
    })
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.errorCode, "question_sync_unavailable");
});

function dependencies(
  overrides: Partial<QuestionSyncWorkflowDependencies> = {}
): QuestionSyncWorkflowDependencies {
  const store = emptyStore();
  return {
    prepare: async () => prepared(),
    mutate: async () => syncResult(),
    withLock: async (run) => ({ acquired: true, value: await run(store) }),
    audit: () => undefined,
    now: () => new Date("2026-07-10T12:00:00.000Z"),
    ...overrides,
  };
}

function prepared(): PreparedQuestionSync {
  return {
    questions: [],
    sourceRows: 0,
    validRows: 0,
    questionsSkipped: 0,
  };
}

function syncResult(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    success: true,
    questionsAdded: 0,
    questionsUpdated: 0,
    questionsDeactivated: 0,
    questionsSkipped: 0,
    totalProcessed: overrides.questionsAdded ?? 0,
    errors: 0,
    timestamp: "2026-07-10T12:00:00.000Z",
    ...overrides,
  };
}

function memoryLock(): QuestionSyncWorkflowDependencies["withLock"] {
  const store = emptyStore();
  let active = false;
  return async <T>(run: (store: QuestionSyncStore) => Promise<T>) => {
    if (active) return { acquired: false };
    active = true;
    try {
      return { acquired: true, value: await run(store) };
    } finally {
      active = false;
    }
  };
}

function emptyStore(): QuestionSyncStore {
  return {
    listQuestions: async () => [],
    insertQuestions: async () => undefined,
    setQuestionsActive: async () => undefined,
  };
}
