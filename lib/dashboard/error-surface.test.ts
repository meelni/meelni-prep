import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DashboardError } from "../../components/dashboard/error";

test("dashboard errors render one accessible section surface without a nested shell", () => {
  const html = renderToStaticMarkup(
    React.createElement(DashboardError, {
      error: new Error("Session history is temporarily unavailable"),
      label: "Interview History",
      reset: () => undefined,
    })
  );

  assert.match(html, /Interview History/);
  assert.match(html, /role="alert"/);
  assert.match(html, />Retry</);
  assert.match(html, /Session history is temporarily unavailable/);
  assert.doesNotMatch(html, /<aside/);
  assert.doesNotMatch(html, /aria-label="Workspace"/);
});
