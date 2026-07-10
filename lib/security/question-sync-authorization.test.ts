import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeQuestionSyncRequest,
  isValidQuestionSyncSecret,
} from "./question-sync-authorization";

const SECRET = "question-sync-fixture-abc123-".repeat(2);

test("question sync secrets require a strong non-placeholder value", () => {
  assert.equal(isValidQuestionSyncSecret(SECRET), true);
  assert.equal(isValidQuestionSyncSecret(undefined), false);
  assert.equal(isValidQuestionSyncSecret(""), false);
  assert.equal(isValidQuestionSyncSecret("short-secret"), false);
  assert.equal(isValidQuestionSyncSecret(` ${SECRET}`), false);
  assert.equal(isValidQuestionSyncSecret(`${SECRET}\n`), false);
  assert.equal(
    isValidQuestionSyncSecret("change-me-question-sync-secret-123456789"),
    false
  );
  assert.equal(isValidQuestionSyncSecret("a".repeat(64)), false);
});

test("question sync authorization fails closed for missing or invalid config", () => {
  assert.deepEqual(authorizeQuestionSyncRequest(null, undefined), {
    authorized: false,
    reason: "configuration",
  });
  assert.deepEqual(
    authorizeQuestionSyncRequest("Bearer short-secret", "short-secret"),
    { authorized: false, reason: "configuration" }
  );
});

test("question sync authorization requires one exact bearer credential", () => {
  assert.deepEqual(authorizeQuestionSyncRequest(`Bearer ${SECRET}`, SECRET), {
    authorized: true,
  });

  for (const header of [
    null,
    SECRET,
    `Basic ${SECRET}`,
    `bearer ${SECRET}`,
    `Bearer wrong-${SECRET}`,
    `Bearer ${SECRET} extra`,
  ]) {
    assert.deepEqual(authorizeQuestionSyncRequest(header, SECRET), {
      authorized: false,
      reason: "credentials",
    });
  }
});
