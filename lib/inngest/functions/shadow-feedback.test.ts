import assert from "node:assert/strict";
import test from "node:test";

import {
  compareShadowFeedback,
  evaluateShadowFeedback,
  scheduleShadowFeedback,
} from "./shadow-feedback";

test("shadow handlers are registered on authoritative triggers with exact-key evaluation concurrency", () => {
  const scheduled = registeredView(scheduleShadowFeedback);
  const compared = registeredView(compareShadowFeedback);
  const evaluated = registeredView(evaluateShadowFeedback);
  assert.deepEqual(scheduled.opts.triggers, [
    { event: "feedback/generate.requested" },
  ]);
  assert.deepEqual(compared.opts.triggers, [
    { event: "insights/update.requested" },
  ]);
  assert.deepEqual(evaluated.opts.triggers, [
    { event: "feedback/shadow.evaluate.requested" },
  ]);
  assert.deepEqual(evaluated.opts.concurrency, [
    { limit: 1, key: "event.data.intent.key.keyFingerprint" },
  ]);
});

test("registered provider-neutral handlers remain inert with enabled capabilities", async () => {
  await withEnabledCapabilities(async () => {
    const forbiddenStep = new Proxy(
      {},
      {
        get() {
          throw new Error("shadow_handler_step_side_effect");
        },
      }
    );
    const baseEvent = {
      id: "synthetic-event",
      ts: Date.parse("2026-08-14T10:00:00.000Z"),
      data: {
        sessionId: "44700000-0000-4000-8000-000000000447",
        userId: "44700000-0000-4000-8000-000000000001",
      },
    };
    const scheduled = await registeredView(scheduleShadowFeedback).fn({
      event: baseEvent,
      step: forbiddenStep,
    } as never);
    const compared = await registeredView(compareShadowFeedback).fn({
      event: baseEvent,
      step: forbiddenStep,
    } as never);
    const evaluated = await registeredView(evaluateShadowFeedback).fn({
      event: { ...baseEvent, data: {} },
      step: forbiddenStep,
    } as never);

    assert.deepEqual(scheduled, {
      status: "runtime_unavailable",
      intentCount: 0,
    });
    assert.deepEqual(compared, {
      status: "runtime_unavailable",
      report: null,
    });
    assert.deepEqual(evaluated, {
      status: "runtime_unavailable",
      outcome: null,
    });
  });
});

async function withEnabledCapabilities(work: () => Promise<void>) {
  const previousExecution = process.env.MEELNI_SHADOW_FEEDBACK_EXECUTION;
  const previousStorage = process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE;
  process.env.MEELNI_SHADOW_FEEDBACK_EXECUTION = "enabled";
  process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE = "enabled";
  try {
    await work();
  } finally {
    restoreEnvironment("MEELNI_SHADOW_FEEDBACK_EXECUTION", previousExecution);
    restoreEnvironment(
      "MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE",
      previousStorage
    );
  }
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function registeredView(value: unknown): {
  opts: {
    triggers: Array<{ event: string }>;
    concurrency?: Array<{ limit: number; key: string }>;
  };
  fn(input: unknown): Promise<unknown>;
} {
  return value as {
    opts: {
      triggers: Array<{ event: string }>;
      concurrency?: Array<{ limit: number; key: string }>;
    };
    fn(input: unknown): Promise<unknown>;
  };
}
