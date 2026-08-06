import assert from "node:assert/strict";
import test from "node:test";

import { startOpikFeedbackEvaluationTrace } from "./opik";

function configuredEnv(overrides: Record<string, string> = {}) {
  return {
    OPIK_TRACING_ENABLED: "true",
    OPIK_API_KEY: "opik-secret",
    OPIK_WORKSPACE: "meelni-workspace",
    OPIK_PROJECT_NAME: "meelni",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    ...overrides,
  };
}

test("Opik feedback traces omit prompts and responses by default", async () => {
  const writes: Array<{ kind: string; data?: Record<string, unknown> }> = [];
  const client = fakeClient(writes);
  const trace = startOpikFeedbackEvaluationTrace(
    { model: "gpt-5.1", prompt: "private transcript" },
    { client, env: configuredEnv(), now: fixedClock() }
  );

  await trace.end({
    status: "success",
    usage: {
      inputTokens: 10,
      cachedInputTokens: 2,
      outputTokens: 5,
      totalTokens: 15,
    },
    response: "private feedback",
  });

  assert.equal(trace.enabled, true);
  assert.equal(trace.capturesContent, false);
  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("private transcript"), false);
  assert.equal(serialized.includes("private feedback"), false);
  assert.equal(serialized.includes("prompt_tokens"), true);
  assert.equal(serialized.includes("feedback_evaluation"), true);
});

test("Opik content capture requires the explicit content switch", async () => {
  const writes: Array<{ kind: string; data?: Record<string, unknown> }> = [];
  const trace = startOpikFeedbackEvaluationTrace(
    { model: "gpt-5.1", prompt: "captured transcript" },
    {
      client: fakeClient(writes),
      env: configuredEnv({ OPIK_CAPTURE_CONTENT: "true" }),
      now: fixedClock(),
    }
  );

  await trace.end({ status: "error", response: "captured response" });

  assert.equal(trace.capturesContent, true);
  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("captured transcript"), true);
  assert.equal(serialized.includes("captured response"), true);
  assert.equal(serialized.includes("FeedbackEvaluationError"), true);
  assert.equal(serialized.includes("room"), false);
  assert.equal(serialized.includes("session"), false);
});

test("Opik tracing stays disabled when its switch or credentials are incomplete", async () => {
  const disabled = startOpikFeedbackEvaluationTrace(
    { model: "gpt-5.1", prompt: "private" },
    { env: {} }
  );
  const incomplete = startOpikFeedbackEvaluationTrace(
    { model: "gpt-5.1", prompt: "private" },
    { env: { OPIK_TRACING_ENABLED: "true" } }
  );
  const invalidEndpoint = startOpikFeedbackEvaluationTrace(
    { model: "gpt-5.1", prompt: "private" },
    {
      env: configuredEnv({
        OPIK_URL_OVERRIDE: "http://untrusted.example.test/opik",
      }),
    }
  );
  const invalidWorkspace = startOpikFeedbackEvaluationTrace(
    { model: "gpt-5.1", prompt: "private" },
    { env: configuredEnv({ OPIK_WORKSPACE: "unsafe workspace\nheader" }) }
  );

  assert.equal(disabled.enabled, false);
  assert.equal(incomplete.enabled, false);
  assert.equal(invalidEndpoint.enabled, false);
  assert.equal(invalidWorkspace.enabled, false);
  await disabled.end({ status: "success" });
  await incomplete.end({ status: "success" });
  await invalidEndpoint.end({ status: "success" });
  await invalidWorkspace.end({ status: "success" });
});

function fakeClient(
  writes: Array<{ kind: string; data?: Record<string, unknown> }>
) {
  return {
    trace(data: Record<string, unknown>) {
      writes.push({ kind: "trace.start", data });
      return {
        span(spanData: Record<string, unknown>) {
          writes.push({ kind: "span.start", data: spanData });
          return {
            update(updateData: Record<string, unknown>) {
              writes.push({ kind: "span.update", data: updateData });
            },
            end() {
              writes.push({ kind: "span.end" });
            },
          };
        },
        update(updateData: Record<string, unknown>) {
          writes.push({ kind: "trace.update", data: updateData });
        },
        end() {
          writes.push({ kind: "trace.end" });
        },
      };
    },
    async flush() {
      writes.push({ kind: "flush" });
    },
  };
}

function fixedClock() {
  const times = [
    new Date("2026-08-05T12:00:00.000Z"),
    new Date("2026-08-05T12:00:01.000Z"),
  ];
  return () => times.shift() ?? new Date("2026-08-05T12:00:01.000Z");
}
