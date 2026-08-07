import assert from "node:assert/strict";
import test from "node:test";

import { INTERACTIVE_READ_STATEMENT_TIMEOUT_MS } from "@/lib/http/deadline";
import { getInteractiveReadStatementTimeoutSql } from "./interactive-read";

test("interactive reads use a transaction-local statement timeout", () => {
  assert.equal(
    getInteractiveReadStatementTimeoutSql(),
    `set local statement_timeout = '${INTERACTIVE_READ_STATEMENT_TIMEOUT_MS}ms'`
  );
  assert.ok(INTERACTIVE_READ_STATEMENT_TIMEOUT_MS < 10_000);
});
