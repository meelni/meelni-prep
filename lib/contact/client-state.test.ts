import assert from "node:assert/strict";
import test from "node:test";

import { isCurrentContactSubmissionVersion } from "./client-state";

test("an edited form rejects a stale submission response", () => {
  assert.equal(isCurrentContactSubmissionVersion(4, 4), true);
  assert.equal(isCurrentContactSubmissionVersion(4, 5), false);
});
