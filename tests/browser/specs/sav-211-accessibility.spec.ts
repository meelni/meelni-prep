import { expect, test, type Page } from "@playwright/test";

import {
  assertCriticalAccessibility,
  assertExactPageLocation,
  assertLayoutAndPrimaryAction,
  assertNoHorizontalOverflow,
  attachEvidence,
} from "../support/assertions";
import {
  SAV_211_BROWSER_SCENARIOS,
  sav211PrimaryAction,
  sav211ScenarioHref,
} from "../support/sav-211-matrix";
import { installBrowserActivityGuard } from "../support/public-fixtures";

for (const scenario of SAV_211_BROWSER_SCENARIOS) {
  test(`SAV-211 ${scenario.id} owns its browser accessibility state`, async ({
    page,
  }, testInfo) => {
    const activity = await installBrowserActivityGuard(page, "harness");
    const href = sav211ScenarioHref(scenario.id);
    await page.goto(href, { waitUntil: "domcontentloaded" });
    const location = await assertExactPageLocation({
      expectedHref: href,
      page,
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByText(scenario.expectedText).first()).toBeVisible();

    if (scenario.id === "consent-undecided") {
      await assertConsentNoticeFloatsOverContent(page);
    } else if (
      scenario.id === "consent-accepted" ||
      scenario.id === "consent-declined"
    ) {
      await expect(page.locator("[data-cookie-consent-banner]")).toHaveCount(0);
    }

    const primaryAction = sav211PrimaryAction(page, scenario.id);
    const layout = primaryAction
      ? await assertLayoutAndPrimaryAction({
          action: primaryAction,
          page,
          mobile: testInfo.project.name.startsWith("mobile"),
        })
      : await assertNoHorizontalOverflow(page);
    const accessibility = await assertCriticalAccessibility(
      page,
      testInfo,
      scenario.id
    );

    await attachEvidence(testInfo, {
      accessibility,
      layout,
      location,
      project: testInfo.project.name,
      scenario: scenario.id,
      unexpectedActivity: activity.unexpected,
    });
    activity.assertClean();
  });
}

test("SAV-211 comparison supports radio movement and retry recovery", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "harness", {
    allowedConsoleErrors: [/feedback_comparison_fetch_failed/],
  });
  const href = sav211ScenarioHref("feedback-compare");
  await page.goto(href, { waitUntil: "domcontentloaded" });

  const group = page.getByRole("radiogroup", { name: "Earlier Attempt" });
  await expect(group).toBeVisible();
  const radios = group.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(radios.nth(0)).toHaveAttribute("tabindex", "0");
  await expect(radios.nth(1)).toHaveAttribute("tabindex", "-1");

  await radios.nth(0).click();
  const retryAlert = page.getByRole("alert");
  await expect(retryAlert).toContainText("Comparison Unavailable");
  await retryAlert.getByRole("button", { name: "Retry Comparison" }).click();
  await expect(page.getByText("Jul 10, 2026")).toBeVisible();

  await radios.nth(0).focus();
  await radios.nth(0).press("ArrowDown");
  await expect(radios.nth(1)).toBeFocused();
  await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(radios.nth(0)).toHaveAttribute("tabindex", "-1");
  await expect(radios.nth(1)).toHaveAttribute("tabindex", "0");
  await expect(page.getByText("Jul 3, 2026")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Attempt Comparison" })
  ).toBeVisible();

  const layout = await assertNoHorizontalOverflow(page);
  const accessibility = await assertCriticalAccessibility(
    page,
    testInfo,
    "feedback-compare-interaction"
  );
  await attachEvidence(testInfo, {
    accessibility,
    layout,
    project: testInfo.project.name,
    scenario: "feedback-compare-interaction",
    unexpectedActivity: activity.unexpected,
  });
  activity.assertClean();
});

test("SAV-211 consent choices remove the floating notice", async ({ page }) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  const href = sav211ScenarioHref("consent-undecided");

  await page.goto(href, { waitUntil: "domcontentloaded" });
  await assertConsentNoticeFloatsOverContent(page);
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.locator("[data-cookie-consent-banner]")).toHaveCount(0);
  await expect(page.getByRole("main")).toBeVisible();

  await page.goto(href, { waitUntil: "domcontentloaded" });
  await assertConsentNoticeFloatsOverContent(page);
  await page.getByRole("button", { name: "Allow analytics" }).click();
  await expect(page.locator("[data-cookie-consent-banner]")).toHaveCount(0);
  await expect(page.getByRole("main")).toBeVisible();
  activity.assertClean();
});

async function assertConsentNoticeFloatsOverContent(page: Page) {
  const banner = page.locator("[data-cookie-consent-banner]");
  const content = page.locator("[data-consent-primary-content]");
  await expect(banner).toBeVisible();
  await expect(content).toBeVisible();

  const [bannerBox, contentBox, position] = await Promise.all([
    banner.boundingBox(),
    content.boundingBox(),
    banner.evaluate((element) => getComputedStyle(element).position),
  ]);
  expect(bannerBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(position).toBe("fixed");
  expect(contentBox!.y).toBeLessThan(bannerBox!.y);
  expect(bannerBox!.x).toBeGreaterThanOrEqual(15);
  expect(bannerBox!.y).toBeGreaterThanOrEqual(0);

  for (const action of [
    page.getByRole("link", { name: "Privacy" }),
    page.getByRole("button", { name: "Decline" }),
    page.getByRole("button", { name: "Allow analytics" }),
  ]) {
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
}
