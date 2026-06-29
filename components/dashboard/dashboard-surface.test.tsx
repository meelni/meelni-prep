import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("dashboard sections avoid redundant top-level page headers", () => {
  const sectionFiles = [
    "components/dashboard/sections/overview.tsx",
    "components/dashboard/sections/history.tsx",
    "components/dashboard/sections/questions.tsx",
    "components/dashboard/sections/analytics.tsx",
    "components/dashboard/sections/settings.tsx",
  ];

  for (const file of sectionFiles) {
    const source = readFileSync(file, "utf8");

    assert.doesNotMatch(source, /DashboardPageHeader/, file);
    assert.doesNotMatch(source, /font-display[^"]*text-foreground/, file);
    assert.doesNotMatch(source, /text-muted-foreground font-sans/, file);
  }
});

test("dashboard surface does not expose a top-level page header primitive", () => {
  const source = readFileSync(
    "components/dashboard/dashboard-surface.tsx",
    "utf8"
  );

  assert.doesNotMatch(source, /DashboardPageHeader/);
  assert.doesNotMatch(source, /DASHBOARD_PAGE_TITLE_CLASS_NAME/);
  assert.doesNotMatch(source, /DASHBOARD_PAGE_DESCRIPTION_CLASS_NAME/);
});
