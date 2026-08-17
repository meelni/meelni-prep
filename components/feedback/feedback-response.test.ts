import assert from "node:assert/strict";
import test from "node:test";

import {
  FeedbackTransportError,
  decodeFeedbackHttpResponseOrThrow,
  decodeFeedbackResponseOrThrow,
  toFeedbackTransportFailure,
} from "./feedback-response";

test("component response boundary rejects unknown and malformed lifecycle payloads", () => {
  for (const payload of [
    null,
    {},
    { status: "invented", retryable: false },
    { status: "pending", retryable: "sometimes" },
    { status: "completed", retryable: false, feedback: null },
  ]) {
    assert.throws(
      () => decodeFeedbackResponseOrThrow(payload),
      /unsupported response/
    );
  }
});

test("component response boundary returns a decoded lifecycle response", () => {
  assert.deepEqual(
    decodeFeedbackResponseOrThrow({ status: "processing", retryable: true }),
    { status: "processing", retryable: true }
  );
});

test("transient HTTP failures remain retryable before lifecycle decoding", () => {
  for (const status of [408, 425, 429, 500, 503]) {
    assert.throws(
      () =>
        decodeFeedbackHttpResponseOrThrow(
          { ok: false, status },
          { error: "provider details must not become lifecycle copy" }
        ),
      (error) =>
        error instanceof FeedbackTransportError &&
        error.retryable === true &&
        /reconnecting to your saved interview/.test(error.message)
    );
  }
});

test("non-retryable HTTP failures use generic transport copy", () => {
  assert.throws(
    () =>
      decodeFeedbackHttpResponseOrThrow(
        { ok: false, status: 400 },
        { error: "internal details" }
      ),
    (error) =>
      error instanceof FeedbackTransportError &&
      error.retryable === false &&
      error.message === "Feedback could not be loaded."
  );
});

test("active-session conflict remains a decoded lifecycle response", () => {
  assert.deepEqual(
    decodeFeedbackHttpResponseOrThrow(
      { ok: false, status: 409 },
      {
        status: "session_not_ended",
        retryable: false,
        message: "This interview has not ended yet.",
      }
    ),
    {
      status: "session_not_ended",
      retryable: false,
      message: "This interview has not ended yet.",
    }
  );
});

test("successful malformed responses remain unsupported lifecycle responses", () => {
  assert.throws(
    () => decodeFeedbackHttpResponseOrThrow({ ok: true, status: 200 }, {}),
    /unsupported response/
  );
});

test("successful legacy responses require the canonical weighted total", () => {
  const feedback = {
    kind: "legacy",
    id: "synthetic-feedback-legacy",
    sessionId: "synthetic-session-legacy",
    summary: "A fully synthetic historical feedback summary.",
    createdAt: "2026-08-17T12:00:00.000Z",
    nextPracticeRecommendation: null,
    scores: {
      structure: 8,
      clarity: 7,
      insight: 9,
      communication: 8,
      leadership: 7,
      overall: 7.9,
    },
    rubricVersion: "1.0.0",
    strengths: ["A fully synthetic strength."],
    improvements: ["A fully synthetic improvement."],
  };

  assert.equal(
    decodeFeedbackHttpResponseOrThrow(
      { ok: true, status: 200 },
      { status: "completed", retryable: false, feedback }
    ).status,
    "completed"
  );
  assert.throws(
    () =>
      decodeFeedbackHttpResponseOrThrow(
        { ok: true, status: 200 },
        {
          status: "completed",
          retryable: false,
          feedback: {
            ...feedback,
            scores: { ...feedback.scores, overall: 8 },
          },
        }
      ),
    /unsupported response/
  );
});

test("network failures are classified as retryable transport failures", () => {
  assert.deepEqual(toFeedbackTransportFailure(new TypeError("fetch failed")), {
    message:
      "We’re reconnecting to your saved interview. This page will update automatically.",
    retryable: true,
  });
  assert.equal(
    toFeedbackTransportFailure(new Error("unsupported response")),
    null
  );
});

test("request deadline aborts are classified as retryable transport failures", () => {
  const error = new Error("request aborted");
  error.name = "AbortError";

  assert.deepEqual(toFeedbackTransportFailure(error), {
    message:
      "We’re reconnecting to your saved interview. This page will update automatically.",
    retryable: true,
  });
});
