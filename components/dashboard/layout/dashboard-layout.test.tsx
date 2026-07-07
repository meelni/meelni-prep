import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DASHBOARD_CONTENT_PANEL_CLASS_NAME,
  DashboardLayout,
  getInitialSidebarCollapsed,
  getSidebarCollapsedForViewport,
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
  assert.match(html, /h-full/);
  assert.match(html, /overflow-hidden/);
  assert.match(html, /History content/);
});

test("dashboard shell keeps scrolling inside the content container", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      DashboardLayout,
      {
        activeSection: "overview",
        user: { email: "savi@example.com" },
      },
      React.createElement("div", null, "Scrollable work surface")
    )
  );

  assert.match(html, /<main[^>]+overflow-hidden/);
  assert.match(html, /<section[^>]+overflow-hidden/);
  assert.doesNotMatch(html, /<main[^>]+overflow-auto/);
});

test("dashboard shell owns the global new rep action", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      DashboardLayout,
      {
        activeSection: "questions",
        user: { email: "savi@example.com" },
      },
      React.createElement("div", null, "Question bank")
    )
  );

  assert.match(html, /href="\/setup"/);
  assert.match(html, />New rep</);
  assert.doesNotMatch(html, /New Interview/);
});

test("dashboard content panel does not add a black frame or shadow around pages", () => {
  assert.match(DASHBOARD_CONTENT_PANEL_CLASS_NAME, /bg-dashboard-panel/);
  assert.match(
    DASHBOARD_CONTENT_PANEL_CLASS_NAME,
    /border-dashboard-panel-border/
  );
  assert.doesNotMatch(DASHBOARD_CONTENT_PANEL_CLASS_NAME, /shadow/);
});

test("dashboard sidebar collapses for mobile but expands again on desktop", () => {
  assert.equal(
    getInitialSidebarCollapsed({ isMobile: true, savedCollapsed: false }),
    true
  );
  assert.equal(
    getInitialSidebarCollapsed({ isMobile: false, savedCollapsed: true }),
    true
  );
  assert.equal(
    getSidebarCollapsedForViewport({
      isMobile: true,
    }),
    true
  );
  assert.equal(
    getSidebarCollapsedForViewport({
      isMobile: false,
    }),
    false
  );
});
