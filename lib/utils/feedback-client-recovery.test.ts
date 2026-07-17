import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createFeedbackPollBudget,
  createFeedbackRecoveryCoordinator,
} from "./feedback-client-recovery";

test("expired processing invokes one recovery across concurrent client polls", async () => {
  const coordinator = createFeedbackRecoveryCoordinator();
  let postCalls = 0;
  let release!: () => void;
  const pendingPost = new Promise<void>((resolve) => {
    release = resolve;
  });
  const recover = async () => {
    postCalls += 1;
    await pendingPost;
    return { status: "pending", retryable: false };
  };
  const expiredProcessing = { status: "processing", retryable: true };

  const attempts = [
    coordinator.attempt(expiredProcessing, recover),
    coordinator.attempt(expiredProcessing, recover),
    coordinator.attempt(expiredProcessing, recover),
  ];
  assert.equal(postCalls, 1);
  release();
  const results = await Promise.all(attempts);

  assert.equal(postCalls, 1);
  assert.ok(results.every((result) => result.disposition === "recovered"));
  assert.deepEqual(await coordinator.attempt(expiredProcessing, recover), {
    disposition: "already_attempted",
  });
  assert.equal(postCalls, 1);
});

test("ending repair uses the authoritative top-level retryable state", async () => {
  const coordinator = createFeedbackRecoveryCoordinator();
  let postCalls = 0;

  const result = await coordinator.attempt(
    { status: "missing", retryable: true },
    async () => {
      postCalls += 1;
      return { status: "pending", retryable: false };
    }
  );

  assert.equal(result.disposition, "recovered");
  assert.equal(postCalls, 1);
});

test("dispatch detail cannot override top-level non-retryable truth", async () => {
  const coordinator = createFeedbackRecoveryCoordinator();
  let postCalls = 0;
  const state = {
    status: "pending",
    retryable: false,
    dispatch: { retryable: true },
  };
  const result = await coordinator.attempt(state, async () => {
    postCalls += 1;
  });

  assert.deepEqual(result, { disposition: "not_retryable" });
  assert.equal(postCalls, 0);
});

test("settling remains GET-only and cannot trigger automatic recovery", async () => {
  const coordinator = createFeedbackRecoveryCoordinator();
  let postCalls = 0;

  const result = await coordinator.attempt(
    { status: "settling", retryable: false },
    async () => {
      postCalls += 1;
    }
  );

  assert.deepEqual(result, { disposition: "not_retryable" });
  assert.equal(postCalls, 0);
});

test("poll budget is finite and reset only starts a new bounded window", () => {
  const budget = createFeedbackPollBudget(2);
  assert.equal(budget.consume(), true);
  assert.equal(budget.consume(), true);
  assert.equal(budget.consume(), false);
  budget.reset();
  assert.equal(budget.consume(), true);
});

test("both feedback clients bind top-level retry truth to the shared gate", async () => {
  for (const file of [
    "app/feedback/[sessionId]/page.tsx",
    "app/feedback/[sessionId]/components/feedback-loading.tsx",
  ]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /data\.retryable === true/);
    assert.match(source, /recoveryCoordinator\.current\.attempt/);
    assert.match(source, /createFeedbackPollBudget/);
    assert.match(
      source,
      /recoveryCoordinator\.current = createFeedbackRecoveryCoordinator\(\)/
    );
    assert.match(source, /pollBudget\.current = createFeedbackPollBudget\(/);
    assert.doesNotMatch(source, /dispatch\??\.retryable/);
  }
});
