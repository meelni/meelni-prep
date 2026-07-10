import assert from "node:assert/strict";
import test from "node:test";

import { createAnalyticsPseudonym } from "./pseudonym";

test("analytics user pseudonyms are deterministic HMACs and key scoped", () => {
  const keyA = "a".repeat(32);
  const keyB = "b".repeat(32);
  const first = createAnalyticsPseudonym("user-123", keyA);
  assert.equal(first, createAnalyticsPseudonym("user-123", keyA));
  assert.notEqual(first, createAnalyticsPseudonym("user-123", keyB));
  assert.doesNotMatch(first!, /user-123/);
  assert.equal(createAnalyticsPseudonym("user-123", "short"), null);
});
