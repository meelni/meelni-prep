import assert from "node:assert/strict";
import test from "node:test";

import { getChildExitAction } from "./start-local-dev-processes.mjs";

test("getChildExitAction exits the wrapper when the web process exits", () => {
  assert.equal(getChildExitAction({ role: "web" }), "exit");
});

test("getChildExitAction keeps the wrapper alive when the optional agent exits", () => {
  assert.equal(getChildExitAction({ role: "agent" }), "keep-running");
});

test("getChildExitAction exits the wrapper when the Inngest process exits", () => {
  assert.equal(getChildExitAction({ role: "inngest" }), "exit");
});
