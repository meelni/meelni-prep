import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FEEDBACK_GENERATION_LEASE_MS,
  isFeedbackGenerationLeaseExpired,
  isFeedbackGenerationRetryable,
} from "./feedback-generation-state";

const NOW = new Date("2026-07-10T15:00:00.000Z");

test("failed and stale processing feedback are retryable", () => {
  assert.equal(
    isFeedbackGenerationRetryable(
      { status: "failed", processingStartedAt: NOW },
      NOW
    ),
    true
  );
  assert.equal(
    isFeedbackGenerationLeaseExpired(
      {
        status: "processing",
        processingStartedAt: new Date(
          NOW.getTime() - FEEDBACK_GENERATION_LEASE_MS
        ),
      },
      NOW
    ),
    true
  );
  assert.equal(
    isFeedbackGenerationRetryable(
      {
        status: "processing",
        processingStartedAt: new Date(
          NOW.getTime() - FEEDBACK_GENERATION_LEASE_MS + 1
        ),
      },
      NOW
    ),
    false
  );
});

test("terminal and pending feedback never reopen through lease recovery", () => {
  for (const status of ["pending", "completed", "skipped"] as const) {
    assert.equal(
      isFeedbackGenerationRetryable(
        { status, processingStartedAt: null },
        NOW
      ),
      false
    );
  }
});

test("database claims and terminal writes are fenced by the exact event", () => {
  const source = readFileSync(
    new URL("./feedback-generation-state.ts", import.meta.url),
    "utf8"
  );
  const activeClaimUses = source.match(/\.where\(activeClaim\(/g) ?? [];

  assert.match(source, /eq\(feedback\.dispatchEventId, eventId\)/);
  assert.match(source, /inArray\(feedback\.status, \["pending", "failed"\]\)/);
  assert.equal(activeClaimUses.length, 3);
  assert.doesNotMatch(source, /COALESCE/i);
  assert.doesNotMatch(source, /dispatchStatus:\s*"sent"/);
});

test("retry preparation cannot reopen terminal or active leased work", () => {
  const source = readFileSync(
    new URL("./feedback-generation-state.ts", import.meta.url),
    "utf8"
  );
  const retryBody = source.slice(
    source.indexOf("async prepareRetry"),
    source.indexOf("function activeClaim")
  );

  assert.match(retryBody, /eq\(feedback\.status, "failed"\)/);
  assert.match(retryBody, /eq\(feedback\.status, "processing"\)/);
  assert.match(retryBody, /lte\(feedback\.processingStartedAt, staleBefore\)/);
  assert.doesNotMatch(retryBody, /"completed"|"skipped"/);
});
