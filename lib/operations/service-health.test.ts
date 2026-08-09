import assert from "node:assert/strict";
import test from "node:test";

import {
  assessServiceHealth,
  createCachedServiceHealthReader,
  createDefaultServiceHealthDependencies,
  type ServiceHealthEvidence,
  type ServiceHealthStore,
} from "./service-health";

const NOW = new Date("2026-07-10T20:00:00.000Z");
const READY_ENV = {
  LIVEKIT_API_KEY: "key",
  LIVEKIT_API_SECRET: "secret",
  LIVEKIT_URL: "wss://livekit.example.test",
  LIVEKIT_INTERVIEW_AGENT_NAME: "interview-agent",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  INNGEST_EVENT_KEY: "event-key",
  INNGEST_SIGNING_KEY: "signing-key",
  VERCEL: "1",
  VERCEL_ENV: "preview",
};
const CLEAR_EVIDENCE: ServiceHealthEvidence = {
  questionBankReady: true,
  feedbackDispatchStale: false,
  feedbackDispatchFailed: false,
  stripeWebhookStale: false,
  stripeWebhookFailed: false,
};

test("healthy report exposes only fixed non-secret readiness fields", async () => {
  const report = await assessServiceHealth(
    dependencies(store(CLEAR_EVIDENCE), READY_ENV)
  );

  assert.deepEqual(report, {
    contract: "meelni_service_health",
    version: 1,
    checkedAt: NOW.toISOString(),
    status: "healthy",
    checks: [
      { name: "web", status: "healthy", code: "web_ready" },
      { name: "database", status: "healthy", code: "database_ready" },
      {
        name: "question_bank",
        status: "healthy",
        code: "question_bank_ready",
      },
      { name: "livekit", status: "healthy", code: "livekit_ready" },
      {
        name: "feedback_dispatch",
        status: "healthy",
        code: "feedback_dispatch_ready",
      },
      {
        name: "stripe_webhook",
        status: "healthy",
        code: "stripe_webhook_ready",
      },
    ],
  });
  assert.deepEqual(Object.keys(report).sort(), [
    "checkedAt",
    "checks",
    "contract",
    "status",
    "version",
  ]);
});

test("configuration and backlog failures degrade without leaking details", async () => {
  const report = await assessServiceHealth(
    dependencies(
      store({
        ...CLEAR_EVIDENCE,
        feedbackDispatchStale: true,
        stripeWebhookFailed: true,
      }),
      { ...READY_ENV, STRIPE_WEBHOOK_SECRET: "" }
    )
  );

  assert.equal(report.status, "degraded");
  assert.deepEqual(report.checks.slice(4), [
    {
      name: "feedback_dispatch",
      status: "degraded",
      code: "feedback_dispatch_stale",
    },
    {
      name: "stripe_webhook",
      status: "degraded",
      code: "stripe_webhook_config_missing",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(report), /secret|event-key|signing-key/i);
});

test("database and LiveKit failures make practice unavailable", async () => {
  const failingStore: ServiceHealthStore = {
    readEvidence: async () => {
      throw new Error("postgres://user:password@example.test/private");
    },
  };
  const report = await assessServiceHealth(dependencies(failingStore, {}));

  assert.equal(report.status, "unavailable");
  assert.deepEqual(report.checks.slice(1), [
    {
      name: "database",
      status: "unavailable",
      code: "database_unavailable",
    },
    {
      name: "question_bank",
      status: "unavailable",
      code: "question_bank_dependency_unavailable",
    },
    {
      name: "livekit",
      status: "unavailable",
      code: "livekit_unavailable",
    },
    {
      name: "feedback_dispatch",
      status: "unavailable",
      code: "feedback_dispatch_dependency_unavailable",
    },
    {
      name: "stripe_webhook",
      status: "unavailable",
      code: "stripe_webhook_dependency_unavailable",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(report), /postgres|password|private/i);
});

test("database evidence uses canonical feedback lease cutoffs", async () => {
  let captured:
    | {
        staleBefore: Date;
        feedbackQueueStaleBefore: Date;
        feedbackGenerationStaleBefore: Date;
        queryTimeoutMs: number;
      }
    | undefined;
  const capturingStore: ServiceHealthStore = {
    readEvidence: async (input) => {
      captured = input;
      return CLEAR_EVIDENCE;
    },
  };

  await assessServiceHealth(dependencies(capturingStore, READY_ENV));

  assert.equal(captured?.staleBefore.toISOString(), "2026-07-10T19:50:00.000Z");
  assert.equal(
    captured?.feedbackQueueStaleBefore.toISOString(),
    "2026-07-10T19:58:30.000Z"
  );
  assert.equal(
    captured?.feedbackGenerationStaleBefore.toISOString(),
    "2026-07-10T19:55:00.000Z"
  );
  assert.equal(captured?.queryTimeoutMs, 1);
});

test("an empty published question bank makes practice unavailable", async () => {
  const report = await assessServiceHealth(
    dependencies(
      store({ ...CLEAR_EVIDENCE, questionBankReady: false }),
      READY_ENV
    )
  );

  assert.equal(report.status, "unavailable");
  assert.deepEqual(report.checks[2], {
    name: "question_bank",
    status: "unavailable",
    code: "question_bank_empty",
  });
});

test("failed durable work outranks simultaneous stale evidence", async () => {
  const report = await assessServiceHealth(
    dependencies(
      store({
        questionBankReady: true,
        feedbackDispatchStale: true,
        feedbackDispatchFailed: true,
        stripeWebhookStale: true,
        stripeWebhookFailed: true,
      }),
      READY_ENV
    )
  );

  assert.deepEqual(report.checks.slice(4), [
    {
      name: "feedback_dispatch",
      status: "degraded",
      code: "feedback_dispatch_failed",
    },
    {
      name: "stripe_webhook",
      status: "degraded",
      code: "stripe_webhook_failed",
    },
  ]);
});

test("a hung database check fails closed at the configured timeout", async () => {
  const hangingStore: ServiceHealthStore = {
    readEvidence: () => new Promise(() => {}),
  };
  const report = await assessServiceHealth(
    createDefaultServiceHealthDependencies({
      env: READY_ENV,
      now: () => NOW,
      store: hangingStore,
      timeoutMs: 5,
    })
  );

  assert.equal(report.status, "unavailable");
  assert.equal(report.checks[1].code, "database_unavailable");
});

test("health reader coalesces concurrent checks and briefly reuses safe results", async () => {
  let calls = 0;
  let now = 1_000;
  const reader = createCachedServiceHealthReader({
    assess: async () => {
      calls += 1;
      await Promise.resolve();
      return {
        contract: "meelni_service_health",
        version: 1,
        checkedAt: NOW.toISOString(),
        status: "healthy",
        checks: [],
      };
    },
    now: () => now,
    ttlMs: 10_000,
  });

  await Promise.all([reader(), reader(), reader()]);
  assert.equal(calls, 1);
  await reader();
  assert.equal(calls, 1);
  now += 10_001;
  await reader();
  assert.equal(calls, 2);
});

function dependencies(
  healthStore: ServiceHealthStore,
  env: Readonly<Record<string, string | undefined>>
) {
  return createDefaultServiceHealthDependencies({
    env,
    now: () => NOW,
    store: healthStore,
    timeoutMs: 50,
  });
}

function store(evidence: ServiceHealthEvidence): ServiceHealthStore {
  return { readEvidence: async () => evidence };
}
