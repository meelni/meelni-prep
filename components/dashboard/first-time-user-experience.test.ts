import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FTUE_EMPTY_STATE_COPY } from "./first-time-user-experience";

test("dashboard first-time empty state uses focused interview copy", () => {
  assert.deepEqual(FTUE_EMPTY_STATE_COPY, {
    title: "No active interviews yet",
    body: "Start a practice interview when you're ready.",
    cta: "Start new interview",
  });
});

test("dashboard first-time empty state stays text-only", () => {
  const component = readFileSync(
    "components/dashboard/first-time-user-experience.tsx",
    "utf8"
  );
  const css = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(component, /DashboardEmptyStateIllustration/);
  assert.doesNotMatch(css, /dashboard-empty-state-illustration/);
  assert.doesNotMatch(css, /dashboard-empty-state-float/);
});
