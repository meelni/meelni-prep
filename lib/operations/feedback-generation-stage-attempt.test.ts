import assert from "node:assert/strict";
import test from "node:test";

import {
  feedbackGenerationEventFence,
  normalizeFeedbackGenerationStageAttempt,
  resolveFeedbackGenerationRuntimeMetadata,
} from "./feedback-generation-stage-attempt";

test("stage attempt normalization emits only the closed content-free shape", () => {
  const normalized = normalizeFeedbackGenerationStageAttempt({
    generationEventId: "evt_fixture_1",
    workflowAttempt: 1,
    operation: "provider_request",
    stage: "provider",
    providerAttempt: 2,
    outcome: "retrying",
    failureClass: "provider_rate_limited",
    retryable: true,
    startedAt: new Date("2026-08-14T06:00:00.000Z"),
    completedAt: new Date("2026-08-14T06:00:01.250Z"),
    durationMs: 1_250,
    remainingBudgetMs: 42_000,
    retryAfterMs: 2_500,
    environmentClass: "test",
    release: "fixture-sha",
    providerDiagnosticKind: "provider_rate_limited",
    providerHttpStatus: 429,
    observedModel: "gpt-fixture",
    observedServiceTier: "default",
    usage: {
      inputTokens: 100,
      cachedInputTokens: 25,
      outputTokens: 50,
      totalTokens: 150,
    },
    userId: "PRIVATE_USER",
    sessionId: "PRIVATE_SESSION",
    roomName: "PRIVATE_ROOM",
    transcript: "PRIVATE_TRANSCRIPT",
    feedback: "PRIVATE_FEEDBACK",
    rawError: "PRIVATE_ERROR",
    providerPayload: "PRIVATE_PROVIDER_PAYLOAD",
  } as never);

  assert.ok(normalized);
  assert.equal(normalized.durationBucket, "1s_to_5s");
  assert.equal(
    normalized.generationEventFence,
    feedbackGenerationEventFence("evt_fixture_1")
  );
  const serialized = JSON.stringify(normalized);
  for (const privateValue of [
    "PRIVATE_USER",
    "PRIVATE_SESSION",
    "PRIVATE_ROOM",
    "PRIVATE_TRANSCRIPT",
    "PRIVATE_FEEDBACK",
    "PRIVATE_ERROR",
    "PRIVATE_PROVIDER_PAYLOAD",
    "evt_fixture_1",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.deepEqual(Object.keys(normalized).sort(), [
    "completedAt",
    "durationBucket",
    "durationMs",
    "environmentClass",
    "failureClass",
    "generationEventFence",
    "observedModel",
    "observedServiceTier",
    "operation",
    "outcome",
    "providerAttempt",
    "providerDiagnosticKind",
    "providerHttpStatus",
    "release",
    "remainingBudgetMs",
    "retryAfterMs",
    "retryable",
    "stage",
    "startedAt",
    "usage",
    "workflowAttempt",
  ]);
});

test("stage attempt normalization rejects open, inconsistent, and unbounded metadata", () => {
  const base = {
    generationEventId: "evt_fixture_1",
    workflowAttempt: 1,
    operation: "claim" as const,
    stage: "claim" as const,
    providerAttempt: null,
    outcome: "succeeded" as const,
    retryable: false,
    startedAt: new Date("2026-08-14T06:00:00.000Z"),
    completedAt: new Date("2026-08-14T06:00:00.010Z"),
    durationMs: 10,
    remainingBudgetMs: 89_000,
    environmentClass: "test" as const,
  };

  const exactFence = normalizeFeedbackGenerationStageAttempt(base);
  assert.ok(exactFence);
  assert.equal(
    exactFence.generationEventFence,
    feedbackGenerationEventFence(base.generationEventId)
  );
  for (const generationEventId of [
    ` ${base.generationEventId}`,
    `${base.generationEventId} `,
  ]) {
    assert.equal(
      normalizeFeedbackGenerationStageAttempt({
        ...base,
        generationEventId,
      }),
      null
    );
    assert.notEqual(
      feedbackGenerationEventFence(generationEventId),
      exactFence.generationEventFence
    );
  }

  assert.equal(
    normalizeFeedbackGenerationStageAttempt({
      ...base,
      operation: "provider_request",
      stage: "provider",
      providerAttempt: null,
    }),
    null
  );
  assert.equal(
    normalizeFeedbackGenerationStageAttempt({
      ...base,
      providerAttempt: 1,
    }),
    null
  );
  assert.equal(
    normalizeFeedbackGenerationStageAttempt({
      ...base,
      durationMs: 90_001,
    }),
    null
  );
  assert.equal(
    normalizeFeedbackGenerationStageAttempt({
      ...base,
      completedAt: new Date("2026-08-14T06:01:00.000Z"),
    }),
    null
  );
  assert.equal(
    normalizeFeedbackGenerationStageAttempt({
      ...base,
      outcome: "retrying",
      retryable: false,
      failureClass: "transport_network",
    }),
    null
  );
  assert.equal(
    normalizeFeedbackGenerationStageAttempt({
      ...base,
      providerDiagnosticKind: "provider_timeout",
    }),
    null
  );
  assert.equal(
    normalizeFeedbackGenerationStageAttempt({
      ...base,
      operation: "provider_response",
      stage: "validation",
      providerAttempt: 1,
      retryAfterMs: 1_000,
    }),
    null
  );
  assert.equal(
    normalizeFeedbackGenerationStageAttempt({
      ...base,
      release: "unsafe release label",
    }),
    null
  );
});

test("runtime metadata is closed and sanitizes release identity", () => {
  assert.deepEqual(
    resolveFeedbackGenerationRuntimeMetadata({
      NODE_ENV: "test",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "staging",
      VERCEL_GIT_COMMIT_SHA: "abc123",
    }),
    { environmentClass: "staging", release: "abc123" }
  );
  assert.deepEqual(
    resolveFeedbackGenerationRuntimeMetadata({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "unsafe release",
    }),
    { environmentClass: "production", release: null }
  );
});
