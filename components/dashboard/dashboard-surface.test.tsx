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

    assert.match(source, /DashboardPage/, file);
    assert.doesNotMatch(source, /<header/, file);
    assert.doesNotMatch(source, /DashboardPageHeader/, file);
    assert.doesNotMatch(source, /<h1/, file);
    assert.doesNotMatch(source, /text-muted-foreground font-sans/, file);
  }
});

test("settings section follows Paper rail layout and avoids old mixed account cards", () => {
  const source = readFileSync(
    "components/dashboard/sections/settings.tsx",
    "utf8"
  );

  assert.match(source, /DashboardPage label="Settings"/);
  assert.match(source, /SETTINGS_CATEGORY_ORDER\.map/);
  assert.match(source, /AccountPane/);
  assert.match(source, /PlanCreditsPane/);
  assert.match(source, /NotificationsPane/);
  assert.match(source, /DataPrivacyPane/);
  assert.doesNotMatch(source, /BillingSection/);
  assert.doesNotMatch(source, /Appearance/);
  assert.doesNotMatch(source, /Danger Zone/);
});

test("dashboard page chrome is compact and label-only", () => {
  const source = readFileSync(
    "components/dashboard/layout/dashboard-page.tsx",
    "utf8"
  );

  assert.match(source, /h-10/);
  assert.match(source, /border-b/);
  assert.match(source, /bg-transparent/);
  assert.match(source, /overflow-y-auto/);
  assert.doesNotMatch(source, /children.*header/);
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

test("dashboard progress charts render observed scores without future placeholders", () => {
  const sectionFiles = [
    "components/dashboard/sections/overview.tsx",
    "components/dashboard/sections/analytics.tsx",
  ];
  const chartSource = readFileSync(
    "components/dashboard/charts/progress-signal-bars.tsx",
    "utf8"
  );

  assert.match(chartSource, /bg-primary/);
  assert.match(chartSource, /Observed scores from completed feedback/);
  assert.doesNotMatch(chartSource, /Future progress slot/);
  assert.doesNotMatch(chartSource, /placeholder/);

  for (const file of sectionFiles) {
    const source = readFileSync(file, "utf8");

    assert.match(source, /ProgressSignalBars/, file);
    assert.doesNotMatch(source, /progressSignal\.values/, file);
  }
});

test("dashboard progress copy avoids unsupported superlatives and reliability claims", () => {
  const overviewSource = readFileSync(
    "components/dashboard/sections/overview.tsx",
    "utf8"
  );
  const analyticsSource = readFileSync(
    "components/dashboard/sections/analytics.tsx",
    "utf8"
  );

  assert.match(overviewSource, /Suggested next interview/);
  assert.doesNotMatch(overviewSource, /highest-leverage/i);
  assert.match(analyticsSource, /compare observed scores/);
  assert.doesNotMatch(analyticsSource, /reliable trend/i);
  assert.doesNotMatch(analyticsSource, /bottleneck diagnosis/i);
});
