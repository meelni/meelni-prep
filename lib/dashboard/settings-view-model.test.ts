import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_DASHBOARD_SETTINGS } from "./settings-contracts";
import {
  SETTINGS_NAV_ITEMS,
  buildSettingsAccountViewModel,
  buildSettingsPlanSummary,
  formatSettingsDateLabel,
  resolveSettingsCategory,
} from "./settings-view-model";

test("settings nav view model preserves the visible rail order", () => {
  assert.deepEqual(
    SETTINGS_NAV_ITEMS.map((item) => [item.id, item.label]),
    [
      ["account", "Account"],
      ["interview-defaults", "Interview defaults"],
      ["plan-credits", "Plan & credits"],
      ["notifications", "Notifications"],
      ["data-privacy", "Data & privacy"],
    ]
  );
});

test("settings category resolver accepts known sections and preserves current tab for unknown sections", () => {
  assert.equal(resolveSettingsCategory("data-privacy"), "data-privacy");
  assert.equal(
    resolveSettingsCategory("unknown", "interview-defaults"),
    "interview-defaults"
  );
  assert.equal(resolveSettingsCategory(null), "account");
});

test("settings account view model keeps auth display rules out of the component", () => {
  const google = buildSettingsAccountViewModel({
    settings: { ...DEFAULT_DASHBOARD_SETTINGS, displayName: "Savi Singh" },
    fallbackName: "fallback",
    email: "savi@example.com",
    provider: "google",
    sessionExpiresAt: 1795147200,
  });
  const email = buildSettingsAccountViewModel({
    settings: { ...DEFAULT_DASHBOARD_SETTINGS, displayName: "" },
    fallbackName: "Candidate",
    email: "candidate@example.com",
    provider: "email",
    sessionExpiresAt: null,
  });

  assert.deepEqual(google, {
    accountName: "Savi Singh",
    email: "savi@example.com",
    initials: "SS",
    signInMethod: "Google sign-in",
    sessionStartedAt: "Signed in on this device",
    displayName: "Savi Singh",
  });
  assert.deepEqual(email, {
    accountName: "Candidate",
    email: "candidate@example.com",
    initials: "C",
    signInMethod: "Email sign-in",
    sessionStartedAt: "Active session",
    displayName: "",
  });
});

test("settings plan summary view model preserves billing and credit fallback copy", () => {
  assert.deepEqual(
    buildSettingsPlanSummary({
      subscription: null,
      credits: null,
    }),
    [
      {
        label: "Plan",
        value: "Unavailable",
        description: "Current status not loaded",
      },
      {
        label: "Available credits",
        value: "0 credits",
        description: "None reserved",
      },
      {
        label: "Next expiration",
        value: "None",
        description: "No credits currently expire",
      },
    ]
  );

  assert.deepEqual(
    buildSettingsPlanSummary({
      subscription: {
        planName: "Starter",
        status: "active",
        cancelAtPeriodEnd: true,
      },
      credits: {
        availableCredits: 6,
        reservedCredits: 1,
        nextCreditExpiresAt: "2026-08-05T00:00:00.000Z",
      },
    }),
    [
      { label: "Plan", value: "Starter", description: "Active" },
      {
        label: "Available credits",
        value: "6 credits",
        description: "1 reserved for an interview",
      },
      {
        label: "Next expiration",
        value: formatSettingsDateLabel("2026-08-05T00:00:00.000Z"),
        description: "Plan scheduled to end",
      },
    ]
  );
});
