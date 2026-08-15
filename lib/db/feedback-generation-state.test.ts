import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FEEDBACK_GENERATION_LEASE_MS,
  FEEDBACK_QUEUE_CLAIM_TIMEOUT_MS,
  feedbackGenerationDeadlineTimestamp,
  isFeedbackGenerationLeaseExpired,
  isFeedbackQueueLeaseExpired,
  isFeedbackGenerationRetryable,
  isSkippedIntegrityRecoveryCandidate,
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
      isFeedbackGenerationRetryable({ status, processingStartedAt: null }, NOW),
      false
    );
  }
});

test("skipped integrity recovery requires the exact persisted late-false-negative shape", () => {
  const candidate = {
    status: "skipped",
    statusReason: "transcript_integrity_degraded",
    outcomeReason: "transcript_integrity_degraded",
    dispatchStatus: "sent",
    eventId: "feedback/generate.requested:session-1:1",
  } as const;

  assert.equal(isSkippedIntegrityRecoveryCandidate(candidate), true);
  for (const mismatch of [
    { status: "completed" },
    { statusReason: "no_reviewable_answer" },
    { outcomeReason: "no_reviewable_answer" },
    { dispatchStatus: "failed" },
    { eventId: null },
  ] as const) {
    assert.equal(
      isSkippedIntegrityRecoveryCandidate({ ...candidate, ...mismatch }),
      false
    );
  }
});

test("an acknowledged queue delivery expires exactly at the customer upper bound", () => {
  const base = {
    status: "pending",
    dispatchStatus: "sent",
  } as const;
  assert.equal(
    isFeedbackQueueLeaseExpired(
      {
        ...base,
        dispatchedAt: new Date(
          NOW.getTime() - FEEDBACK_QUEUE_CLAIM_TIMEOUT_MS + 1
        ),
      },
      NOW
    ),
    false
  );
  assert.equal(
    isFeedbackQueueLeaseExpired(
      {
        ...base,
        dispatchedAt: new Date(NOW.getTime() - FEEDBACK_QUEUE_CLAIM_TIMEOUT_MS),
      },
      NOW
    ),
    true
  );
  assert.equal(
    isFeedbackQueueLeaseExpired({ ...base, dispatchedAt: null }, NOW),
    true
  );
  assert.equal(
    isFeedbackQueueLeaseExpired(
      { ...base, status: "completed", dispatchedAt: null },
      NOW
    ),
    false
  );
});

test("database claims and terminal writes are fenced by event and deadline", () => {
  const source = readFileSync(
    new URL("./feedback-generation-state.ts", import.meta.url),
    "utf8"
  );
  const activeClaimUses = source.match(/\.where\(activeClaim\(/g) ?? [];

  assert.match(source, /eq\(feedback\.dispatchEventId, eventId\)/);
  assert.equal(
    (
      source.match(
        /CURRENT_TIMESTAMP < \$\{feedbackGenerationDeadlineTimestamp\(deadlineAt\)\}::timestamptz/g
      ) ?? []
    ).length,
    2
  );
  assert.match(source, /inArray\(feedback\.status, \["pending", "failed"\]\)/);
  assert.equal(activeClaimUses.length, 3);
  assert.doesNotMatch(source, /COALESCE/i);
  assert.doesNotMatch(source, /dispatchStatus:\s*"sent"/);
});

test("database deadline fences bind an explicit timestamp instead of a Date object", () => {
  assert.equal(
    feedbackGenerationDeadlineTimestamp(NOW),
    "2026-07-10T15:00:00.000Z"
  );
  assert.throws(
    () => feedbackGenerationDeadlineTimestamp(new Date(Number.NaN)),
    /Invalid time value/
  );
});

test("legacy null-version feedback cannot bypass dimension-coverage null guards", () => {
  const source = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
  const start = source.indexOf('"feedback_dimension_coverage_tuple_check"');
  const end = source.indexOf('"feedback_verified_prefix_scope_tuple_check"');
  const guard = source.slice(start, end);

  assert.match(
    guard,
    /schemaVersion\} IS DISTINCT FROM 'feedback\.dimension-coverage\.v1'/
  );
  assert.match(
    guard,
    /schemaVersion\} IS DISTINCT FROM 'feedback\.dimension-coverage\.v2'/
  );
  assert.doesNotMatch(guard, /NOT IN/);
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

test("skipped integrity retry is a narrow CAS that fences the prior dispatch identity", () => {
  const source = readFileSync(
    new URL("./feedback-generation-state.ts", import.meta.url),
    "utf8"
  );
  const retryBody = source.slice(
    source.indexOf("async prepareSkippedIntegrityRetry"),
    source.indexOf("async prepareRetry")
  );

  assert.match(retryBody, /eq\(feedback\.status, "skipped"\)/);
  assert.equal(
    (retryBody.match(/"transcript_integrity_degraded"/g) ?? []).length,
    2
  );
  assert.match(retryBody, /eq\(feedback\.dispatchStatus, "sent"\)/);
  assert.match(retryBody, /feedback\.dispatchEventId\} IS NOT NULL/);
  assert.match(retryBody, /status: "pending"/);
  assert.match(retryBody, /completionTier: "partial"/);
  assert.match(retryBody, /dispatchStatus: "failed"/);
  assert.match(retryBody, /FEEDBACK_RECOVERY_FENCE_PREFIX/);
  assert.match(retryBody, /feedback\.dispatchAttempts\} \+ 1/);
  assert.match(retryBody, /processingStartedAt: null/);
  assert.match(retryBody, /dispatchClaimedAt: null/);
  assert.match(retryBody, /dispatchedAt: null/);
  assert.match(retryBody, /dispatchEventId:/);
});
