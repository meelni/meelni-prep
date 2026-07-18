import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DASHBOARD_CONTENT_PANEL_CLASS_NAME,
  DASHBOARD_MOBILE_NAV_CLASS_NAME,
  DASHBOARD_SIDEBAR_SHELL_CLASS_NAME,
  DashboardLayout,
  getInitialSidebarCollapsed,
  getSidebarCollapsedForViewport,
} from "./dashboard-layout";

test("dashboard shell keeps the sidebar on the same canvas color", () => {
  const html = renderToStaticMarkup(
    <DashboardLayout
      activeSection="overview"
      user={{ email: "savi@example.com" }}
    >
      <div>Dashboard content</div>
    </DashboardLayout>
  );

  assert.match(html, /<aside[^>]+bg-dashboard-canvas/);
  assert.doesNotMatch(html, /<aside[^>]+bg-dashboard-sidebar/);
});

test("dashboard shell wraps every section in the canonical content panel", () => {
  const html = renderToStaticMarkup(
    <DashboardLayout
      activeSection="history"
      user={{ email: "savi@example.com" }}
    >
      <div>History content</div>
    </DashboardLayout>
  );

  assert.match(html, /rounded-\[10px\]/);
  assert.match(html, /bg-dashboard-panel/);
  assert.match(html, /h-full/);
  assert.match(html, /overflow-hidden/);
  assert.match(html, /History content/);
});

test("dashboard shell does not reserve desktop sidebar width on mobile", () => {
  assert.match(DASHBOARD_SIDEBAR_SHELL_CLASS_NAME, /hidden/);
  assert.match(DASHBOARD_SIDEBAR_SHELL_CLASS_NAME, /md:block/);
});

test("dashboard shell provides a horizontally scrollable mobile workspace navigation", () => {
  const html = renderToStaticMarkup(
    <DashboardLayout
      activeSection="analytics"
      user={{ email: "savi@example.com" }}
    >
      <div>Analytics</div>
    </DashboardLayout>
  );

  assert.match(DASHBOARD_MOBILE_NAV_CLASS_NAME, /overflow-x-auto/);
  assert.match(DASHBOARD_MOBILE_NAV_CLASS_NAME, /md:hidden/);
  assert.match(html, /href="\/dashboard\/history"/);
  assert.match(html, /href="\/dashboard\/questions"/);
  assert.match(html, /aria-current="page"[^>]*><svg[^>]*>[\s\S]*Analytics/);
  assert.match(html, /min-h-11/);
});

test("dashboard shell keeps scrolling inside the content container", () => {
  const html = renderToStaticMarkup(
    <DashboardLayout
      activeSection="overview"
      user={{ email: "savi@example.com" }}
    >
      <div>Scrollable work surface</div>
    </DashboardLayout>
  );

  assert.match(html, /<main[^>]+overflow-hidden/);
  assert.match(html, /<section[^>]+overflow-hidden/);
  assert.doesNotMatch(html, /<main[^>]+overflow-auto/);
});

test("dashboard shell owns the global new mock interview action", () => {
  const html = renderToStaticMarkup(
    <DashboardLayout
      activeSection="questions"
      user={{ email: "savi@example.com" }}
    >
      <div>Question bank</div>
    </DashboardLayout>
  );

  assert.match(html, /href="\/dashboard\/new-interview"/);
  assert.match(html, />New Mock Interview</);
  assert.doesNotMatch(html, />New rep</i);
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
