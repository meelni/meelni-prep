import { expect, test } from "@playwright/test";

import {
  assertCriticalAccessibility,
  assertNoHorizontalOverflow,
} from "../support/assertions";
import { installBrowserActivityGuard } from "../support/public-fixtures";

const lab = (scenario: "loading" | "malformed" | "processing") =>
  `http://127.0.0.1:4173/?scenario=feedback-lab&lab=${scenario}`;

test("SAV-455 exposes keyboard-safe lab controls and atomic processing status", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto(lab("processing"));

  const scenarioButton = page.getByRole("button", {
    name: "Processing saved interview. Expected processing",
  });
  await page.keyboard.press("Tab");
  await expect(scenarioButton).toBeFocused();
  await expect(scenarioButton).toHaveAttribute("aria-pressed", "true");

  const focusEvidence = await scenarioButton.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      boxShadow: style.boxShadow,
      height: rect.height,
      outlineStyle: style.outlineStyle,
    };
  });
  expect(focusEvidence.height).toBeGreaterThanOrEqual(44);
  expect(
    focusEvidence.boxShadow !== "none" || focusEvidence.outlineStyle !== "none",
    "focused scenario control must expose a visible focus indicator"
  ).toBe(true);

  const status = page.locator("[data-feedback-stage-status]");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(status).toHaveAttribute("aria-busy", "true");
  await expect(
    page.getByRole("heading", {
      name: /How would you prioritize a long list of competing synthetic customer needs/,
    })
  ).toBeVisible();
  await expectOutcomeMatch(page, "processing");

  await assertNoHorizontalOverflow(page);
  await assertCriticalAccessibility(
    page,
    testInfo,
    "sav-455-feedback-lab-processing"
  );
  await attachScreenshot(page, testInfo, "processing");
  activity.assertClean();
});

test("SAV-455 keeps loading polite, atomic, and outcome-checked", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto(lab("loading"));

  const loading = page.locator('[role="status"]').filter({
    has: page.getByText("Loading feedback", { exact: true }),
  });
  await expect(loading).toHaveAttribute("aria-live", "polite");
  await expect(loading).toHaveAttribute("aria-atomic", "true");
  await expect(loading).toHaveAttribute("aria-busy", "true");
  await expectOutcomeMatch(page, "loading");

  await assertNoHorizontalOverflow(page);
  await assertCriticalAccessibility(
    page,
    testInfo,
    "sav-455-feedback-lab-loading"
  );
  activity.assertClean();
});

test("SAV-455 maps a malformed artifact to the explicit unavailable state", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto(lab("malformed"));

  await expect(
    page.getByRole("heading", { name: "Feedback unavailable" })
  ).toBeVisible();
  await expect(
    page.getByText(/could not be verified, so no customer feedback is shown/i)
  ).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expectOutcomeMatch(page, "unavailable");

  await assertNoHorizontalOverflow(page);
  await assertCriticalAccessibility(
    page,
    testInfo,
    "sav-455-feedback-lab-malformed"
  );
  await attachScreenshot(page, testInfo, "malformed");
  activity.assertClean();
});

async function expectOutcomeMatch(
  page: import("@playwright/test").Page,
  expected: string
) {
  const labRoot = page.locator("[data-feedback-lab]");
  await expect(labRoot).toHaveAttribute(
    "data-feedback-lab-expected-outcome",
    expected
  );
  await expect(labRoot).toHaveAttribute(
    "data-feedback-lab-rendered-outcome",
    expected
  );
  await expect(
    page.locator("[data-feedback-lab-outcome-status]")
  ).toContainText("matches the rendered customer outcome");
}

async function attachScreenshot(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
  state: string
) {
  await testInfo.attach(`sav-455-${state}-${testInfo.project.name}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}
