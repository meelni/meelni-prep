import assert from "node:assert/strict";
import test from "node:test";

import { INTERVIEW_LIFECYCLE_SLOS } from "@/lib/operations/interview-lifecycle-slo";
import {
  getUserEndAcceptanceTimeoutSql,
  USER_END_ACCEPTANCE_LOCK_TIMEOUT_MS,
  USER_END_ACCEPTANCE_STATEMENT_TIMEOUT_MS,
} from "./accept-user-interview-end";

test("user End lock and statement budgets expire inside the acceptance SLO", () => {
  assert.ok(
    USER_END_ACCEPTANCE_LOCK_TIMEOUT_MS <
      USER_END_ACCEPTANCE_STATEMENT_TIMEOUT_MS
  );
  assert.ok(
    USER_END_ACCEPTANCE_STATEMENT_TIMEOUT_MS <
      INTERVIEW_LIFECYCLE_SLOS.end_acceptance.upperBoundMs
  );
  assert.deepEqual(getUserEndAcceptanceTimeoutSql(), [
    "set local lock_timeout = '1500ms'",
    "set local statement_timeout = '2500ms'",
  ]);
});
