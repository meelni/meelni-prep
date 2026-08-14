import assert from "node:assert/strict";
import test from "node:test";

import { reportFeedbackGenerationAttempt } from "./feedback-generation-attempt";

test("feedback attempt evidence is content-free and closed", () => {
  const writes: string[] = [];
  const input = {
    stage: "provider" as const,
    attempt: 2,
    outcome: "retrying" as const,
    failureClass: "provider_rate_limited" as const,
    durationMs: 1_250,
    remainingBudgetMs: 42_000,
    retryAfterMs: 2_500,
    providerDiagnosticKind: "provider_rate_limited" as const,
    providerHttpStatus: 429,
    observedModel: "gpt-fixture",
    observedServiceTier: "default",
    transcript: "PRIVATE_INTERVIEW_CONTENT",
    providerPayload: "PRIVATE_PROVIDER_PAYLOAD",
  };

  const event = reportFeedbackGenerationAttempt(
    input,
    (value) => writes.push(value),
    () => new Date("2026-08-13T20:00:00.000Z")
  );

  assert.ok(event);
  assert.equal(event.usage, null);
  assert.deepEqual(writes, [JSON.stringify(event)]);
  assert.equal(writes[0]?.includes("PRIVATE_INTERVIEW_CONTENT"), false);
  assert.equal(writes[0]?.includes("PRIVATE_PROVIDER_PAYLOAD"), false);
  assert.deepEqual(Object.keys(event).sort(), [
    "attempt",
    "durationMs",
    "event",
    "failureClass",
    "observedModel",
    "observedServiceTier",
    "occurredAt",
    "outcome",
    "providerDiagnosticKind",
    "providerHttpStatus",
    "remainingBudgetMs",
    "retryAfterMs",
    "stage",
    "usage",
    "version",
  ]);
});

test("feedback attempt evidence rejects unbounded metadata", () => {
  const writes: string[] = [];

  const event = reportFeedbackGenerationAttempt(
    {
      stage: "provider",
      attempt: 1,
      outcome: "failed",
      durationMs: 90_001,
      remainingBudgetMs: 0,
    },
    (value) => writes.push(value)
  );

  assert.equal(event, null);
  assert.deepEqual(writes, []);
});
