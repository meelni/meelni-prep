import assert from "node:assert/strict";
import test from "node:test";

import {
  FeedbackProviderInvocationError,
  type FeedbackProviderInvocationDiagnosticKind,
} from "./scorer";
import { DeadlineExceededError } from "@/lib/http/deadline";
import {
  FEEDBACK_GENERATION_DEADLINE_MS,
  FeedbackGenerationPolicyError,
  classifyFeedbackGenerationFailure,
  getFeedbackGenerationDeadlineAt,
  isDurableFeedbackGenerationRetry,
  planFeedbackProviderAttempt,
} from "./feedback-generation-policy";

test("feedback deadline is anchored once to the accepted request timestamp", () => {
  const requestedAtMs = Date.parse("2026-08-13T20:00:00.000Z");

  assert.equal(
    getFeedbackGenerationDeadlineAt({
      requestedAtMs,
      nowMs: requestedAtMs + 12_000,
    }),
    requestedAtMs + FEEDBACK_GENERATION_DEADLINE_MS
  );
  assert.equal(
    getFeedbackGenerationDeadlineAt({
      requestedAtMs: requestedAtMs + 1,
      nowMs: requestedAtMs,
    }),
    requestedAtMs + FEEDBACK_GENERATION_DEADLINE_MS
  );
});

test("durable retry ownership excludes closed policy outcomes", () => {
  const transientPersistence = new Error("transient_database_unavailable");
  const policyFailure = classifyFeedbackGenerationFailure(
    new FeedbackProviderInvocationError(
      "evaluation_provider_returned_invalid_json"
    ),
    "validation"
  );

  assert.equal(isDurableFeedbackGenerationRetry(transientPersistence), true);
  assert.equal(
    isDurableFeedbackGenerationRetry(
      new FeedbackGenerationPolicyError(policyFailure)
    ),
    false
  );
});

test("provider attempt planning reserves persistence time and fails closed", () => {
  assert.deepEqual(
    planFeedbackProviderAttempt({
      attempt: 1,
      deadlineAtMs: 90_000,
      nowMs: 0,
    }),
    {
      attempt: 1,
      delayMs: 0,
      requestTimeoutMs: 75_000,
      remainingBudgetMs: 90_000,
    }
  );
  assert.equal(
    planFeedbackProviderAttempt({
      attempt: 2,
      deadlineAtMs: 90_000,
      nowMs: 75_000,
      retryAfterMs: 10_000,
    }),
    null
  );
  assert.deepEqual(
    planFeedbackProviderAttempt({
      attempt: 2,
      deadlineAtMs: 90_000,
      nowMs: 10_000,
      retryDelayApplied: true,
    }),
    {
      attempt: 2,
      delayMs: 0,
      requestTimeoutMs: 75_000,
      remainingBudgetMs: 80_000,
    }
  );
  assert.equal(
    planFeedbackProviderAttempt({
      attempt: 4,
      deadlineAtMs: 90_000,
      nowMs: 0,
    }),
    null
  );
});

test("only the per-attempt deadline is a retryable provider timeout", () => {
  const attemptTimeout = classifyFeedbackGenerationFailure(
    new DeadlineExceededError("feedback_provider_attempt"),
    "provider"
  );
  assert.equal(attemptTimeout.failureClass, "transport_timeout");
  assert.equal(attemptTimeout.retryable, true);

  const eventDeadline = classifyFeedbackGenerationFailure(
    new DeadlineExceededError("feedback_generation_provider"),
    "provider"
  );
  assert.equal(eventDeadline.failureClass, "deadline_exceeded");
  assert.equal(eventDeadline.retryable, false);
});

test("closed provider failure matrix retries only transient transport and capacity", () => {
  const transient: Array<{
    diagnostic: FeedbackProviderInvocationDiagnosticKind;
    failureClass: string;
  }> = [
    { diagnostic: "provider_timeout", failureClass: "transport_timeout" },
    { diagnostic: "provider_network", failureClass: "transport_network" },
    {
      diagnostic: "provider_rate_limited",
      failureClass: "provider_rate_limited",
    },
    { diagnostic: "provider_server_error", failureClass: "provider_capacity" },
  ];
  for (const entry of transient) {
    const failure = classifyFeedbackGenerationFailure(
      invocationFailure(entry.diagnostic),
      "provider"
    );
    assert.equal(failure.failureClass, entry.failureClass);
    assert.equal(failure.retryable, true);
  }

  for (const diagnostic of [
    "provider_authentication",
    "provider_permission",
    "provider_not_found",
    "provider_bad_request",
    "provider_unprocessable",
    "provider_unknown",
  ] as const) {
    const failure = classifyFeedbackGenerationFailure(
      invocationFailure(diagnostic),
      "provider"
    );
    assert.equal(failure.retryable, false, diagnostic);
  }

  const malformed = classifyFeedbackGenerationFailure(
    new FeedbackProviderInvocationError(
      "evaluation_provider_returned_invalid_json"
    ),
    "validation"
  );
  assert.equal(malformed.stage, "validation");
  assert.equal(malformed.failureClass, "provider_contract");
  assert.equal(malformed.retryable, false);
});

test("Retry-After is retained as typed provider evidence", () => {
  const failure = classifyFeedbackGenerationFailure(
    new FeedbackProviderInvocationError(
      "evaluation_provider_invocation_failed",
      undefined,
      "fixture-model",
      "default",
      {
        diagnostic: {
          kind: "provider_rate_limited",
          httpStatus: 429,
          retryAfterMs: 2_500,
        },
      }
    ),
    "provider"
  );

  assert.equal(failure.retryAfterMs, 2_500);
  assert.equal(failure.providerHttpStatus, 429);
  assert.equal(failure.observedModel, "fixture-model");
  assert.equal(failure.observedServiceTier, "default");
});

function invocationFailure(
  diagnostic: FeedbackProviderInvocationDiagnosticKind
): FeedbackProviderInvocationError {
  return new FeedbackProviderInvocationError(
    "evaluation_provider_invocation_failed",
    undefined,
    undefined,
    undefined,
    { diagnostic: { kind: diagnostic } }
  );
}
