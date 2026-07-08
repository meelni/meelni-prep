import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DASHBOARD_CONTENT_PANEL_CLASS_NAME,
  DASHBOARD_SIDEBAR_SHELL_CLASS_NAME,
  DashboardLayout,
} from "./dashboard-layout";

test("dashboard shell keeps the sidebar on the same canvas color", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      DashboardLayout,
      {
        activeSection: "overview",
        user: { email: "savi@example.com" },
      },
      React.createElement("div", null, "Dashboard content")
    )
  );

  assert.match(html, /<aside[^>]+bg-dashboard-canvas/);
  assert.doesNotMatch(html, /<aside[^>]+bg-dashboard-sidebar/);
});

test("dashboard shell wraps every section in the canonical content panel", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      DashboardLayout,
      {
        activeSection: "history",
        user: { email: "savi@example.com" },
      },
      React.createElement("div", null, "History content")
    )
  );

  assert.match(html, /rounded-\[10px\]/);
  assert.match(html, /bg-dashboard-panel/);
  assert.match(html, /History content/);
});

test("dashboard shell does not reserve desktop sidebar width on mobile", () => {
  assert.match(DASHBOARD_SIDEBAR_SHELL_CLASS_NAME, /hidden/);
  assert.match(DASHBOARD_SIDEBAR_SHELL_CLASS_NAME, /md:block/);
});

test("dashboard content panel does not add a black frame or shadow around pages", () => {
  assert.match(DASHBOARD_CONTENT_PANEL_CLASS_NAME, /bg-dashboard-panel/);
  assert.match(
    DASHBOARD_CONTENT_PANEL_CLASS_NAME,
    /border-dashboard-panel-border/
  );
  assert.doesNotMatch(DASHBOARD_CONTENT_PANEL_CLASS_NAME, /shadow/);
});
