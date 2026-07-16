import assert from "node:assert/strict";
import test from "node:test";

import {
  SETTINGS_CATEGORY_ORDER,
  SETTINGS_DATA_CONTRACT,
  initialsForUser,
  normalizeDashboardSettings,
  type DashboardSettings,
} from "./settings-contracts";

test("settings contract covers every local settings rail category", () => {
  const categories = new Set(
    SETTINGS_DATA_CONTRACT.map((item) => item.category)
  );

  for (const category of SETTINGS_CATEGORY_ORDER) {
    assert.equal(categories.has(category), true, category);
  }
});

test("settings contract documents backed source and action state for visible controls", () => {
  for (const item of SETTINGS_DATA_CONTRACT) {
    assert.ok(item.source.length > 0, item.label);
    assert.match(item.action, /^(editable|read-only|external|future)$/);
    assert.equal(item.shipsNow, true, item.label);
  }

  assert.ok(
    SETTINGS_DATA_CONTRACT.some(
      (item) =>
        item.category === "account" &&
        item.label === "Target role and interview timeline" &&
        item.action === "future"
    )
  );
  assert.ok(
    SETTINGS_DATA_CONTRACT.some(
      (item) =>
        item.category === "data-privacy" &&
        item.label === "Transcript and audio handling disclosure" &&
        item.action === "read-only"
    )
  );
  assert.ok(
    SETTINGS_DATA_CONTRACT.some(
      (item) =>
        item.category === "plan-credits" &&
        item.source.includes("/api/billing/credits")
    )
  );
});

test("settings defaults normalize missing API rows without fake profile data", () => {
  const settings = normalizeDashboardSettings(null, "Savi Singh");

  assert.equal(settings.displayName, "Savi Singh");
  assert.equal(settings.defaultInterviewType, "product_sense");
  assert.equal(settings.defaultDifficulty, "medium");
  assert.equal(settings.emailNotifications, true);
  assert.equal(settings.weeklyProgressReport, false);
  assert.equal("saveTranscripts" in settings, false);
  assert.equal("autoSaveTranscripts" in settings, false);
  assert.equal("shareAnonymousData" in settings, false);
});

test("settings normalization drops retired preference fields from stale payloads", () => {
  const settings = normalizeDashboardSettings({
    displayName: "Candidate",
    saveTranscripts: false,
    autoSaveTranscripts: false,
    shareAnonymousData: false,
  } as Partial<DashboardSettings> & Record<string, unknown>);

  assert.equal(settings.displayName, "Candidate");
  assert.equal("saveTranscripts" in settings, false);
  assert.equal("autoSaveTranscripts" in settings, false);
  assert.equal("shareAnonymousData" in settings, false);
});

test("settings initials prefer display name and fall back to email", () => {
  assert.equal(initialsForUser("Savi Singh", "savi@example.com"), "SS");
  assert.equal(initialsForUser("", "savi@example.com"), "S");
});
