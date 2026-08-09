import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyTranscriptHydrationResponse,
  getTranscriptHydrationRetryDelayMs,
} from "./transcript-hydration";

test("classifies transient transcript read responses for bounded recovery", () => {
  for (const status of [408, 425, 429, 500, 503, 599]) {
    assert.equal(classifyTranscriptHydrationResponse(status), "retryable");
  }
  for (const status of [401, 403, 404]) {
    assert.equal(
      classifyTranscriptHydrationResponse(status),
      "authorization_lost"
    );
  }
  assert.equal(classifyTranscriptHydrationResponse(400), "failed");
  assert.equal(classifyTranscriptHydrationResponse(200), "success");
});

test("bounds Retry-After and local backoff delays", () => {
  assert.equal(
    getTranscriptHydrationRetryDelayMs(
      new Response(null, { headers: { "Retry-After": "10" } }),
      0
    ),
    3_000
  );
  assert.equal(getTranscriptHydrationRetryDelayMs(null, 0), 250);
  assert.equal(getTranscriptHydrationRetryDelayMs(null, 1), 750);
  assert.equal(getTranscriptHydrationRetryDelayMs(null, 10), 750);
});
