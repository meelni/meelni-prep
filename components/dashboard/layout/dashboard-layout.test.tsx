import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
import { getDashboardActiveSectionFromPath } from "./dashboard-navigation";

test("dashboard shell loading depends on authentication, not session history", () => {
  const source = readFileSync("app/dashboard/layout.tsx", "utf8");

  assert.doesNotMatch(source, /useSessions/);
  assert.doesNotMatch(source, /sessionsLoading/);
  assert.match(source, /if \(authLoading\)/);
});

function getMobileWorkspaceNavigation(html: string) {
  const navigation = html.match(
    /<nav aria-label="Workspace" class="[^"]*md:hidden[^"]*">[\s\S]*?<\/nav>/
  );

  assert.ok(navigation, "expected the visible-at-mobile workspace navigation");
  return navigation[0];
}

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

test("dashboard shell provides a stable mobile workspace navigation grid", () => {
  const html = renderToStaticMarkup(
    <DashboardLayout
      activeSection="analytics"
      user={{ email: "savi@example.com" }}
    >
      <div>Analytics</div>
    </DashboardLayout>
  );
  const mobileNavigation = getMobileWorkspaceNavigation(html);

  assert.doesNotMatch(DASHBOARD_MOBILE_NAV_CLASS_NAME, /overflow-x-auto/);
  assert.match(DASHBOARD_MOBILE_NAV_CLASS_NAME, /md:hidden/);
  assert.match(mobileNavigation, /grid-cols-3/);
  assert.match(mobileNavigation, /href="\/dashboard\/history"/);
  assert.match(mobileNavigation, /href="\/dashboard\/questions"/);
  assert.match(
    mobileNavigation,
    /aria-current="page"[^>]*><svg[^>]*>[\s\S]*Analytics/
  );
  assert.match(mobileNavigation, /min-h-11/);
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
  const mobileNavigation = getMobileWorkspaceNavigation(html);

  assert.match(mobileNavigation, /href="\/dashboard\/new-interview"/);
  assert.match(mobileNavigation, />New Mock Interview</);
  assert.match(mobileNavigation, /min-h-11/);
  assert.doesNotMatch(mobileNavigation, />New rep</i);
});

test("new mock interview is current without marking Overview current", () => {
  const html = renderToStaticMarkup(
    <DashboardLayout
      activeSection="new-interview"
      user={{ email: "savi@example.com" }}
    >
      <div>Interview setup</div>
    </DashboardLayout>
  );
  const mobileNavigation = getMobileWorkspaceNavigation(html);

  assert.match(
    mobileNavigation,
    /<a aria-current="page"[^>]*href="\/dashboard\/new-interview"/
  );
  assert.doesNotMatch(
    mobileNavigation,
    /<a(?=[^>]*href="\/dashboard")(?=[^>]*aria-current="page")[^>]*>/
  );
  assert.equal(
    getDashboardActiveSectionFromPath("/dashboard/new-interview"),
    "new-interview"
  );
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
