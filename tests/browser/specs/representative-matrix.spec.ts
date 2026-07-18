import { expect, test } from "@playwright/test";

import {
  assertCriticalAccessibility,
  assertDialogFocusContract,
  assertExactPageLocation,
  assertLayoutAndPrimaryAction,
  attachEvidence,
} from "../support/assertions";
import { BROWSER_QA_SURFACES } from "../support/matrix";
import {
  installBrowserActivityGuard,
  installPublicNetworkFixtures,
} from "../support/public-fixtures";

for (const surface of BROWSER_QA_SURFACES) {
  test(`${surface.id} preserves its responsive accessibility contract`, async ({
    page,
  }, testInfo) => {
    const activity = await installBrowserActivityGuard(page, surface.target);
    if (surface.target === "next") {
      await installPublicNetworkFixtures(page);
    }
    await page.goto(surface.href, { waitUntil: "domcontentloaded" });
    if (surface.target === "next") {
      await page.waitForLoadState("networkidle");
    }
    const location = await assertExactPageLocation({
      baseURL: testInfo.project.use.baseURL,
      expectedHref: surface.href,
      page,
    });
    await page.evaluate(() => document.fonts.ready);
    if (surface.id === "landing") {
      await expect(
        page
          .locator("#hero")
          .getByRole("link", { name: "Start a mock interview" })
          .locator("..")
      ).toHaveCSS("opacity", "1");
    }
    if (
      surface.id === "explore" &&
      !testInfo.project.name.startsWith("mobile")
    ) {
      await expect(
        page.getByRole("link", { name: "Blog" }).locator("..")
      ).toHaveCSS("opacity", "1");
    }

    const action = surface.primaryAction(page);
    const layout = await assertLayoutAndPrimaryAction({
      action,
      page,
      mobile: testInfo.project.name.startsWith("mobile"),
    });
    const accessibility = await assertCriticalAccessibility(
      page,
      testInfo,
      surface.id
    );

    await attachEvidence(testInfo, {
      accessibility,
      layout,
      location,
      project: testInfo.project.name,
      surface: surface.id,
      target: surface.target,
      url: page.url(),
      unexpectedActivity: activity.unexpected,
    });
    activity.assertClean();
  });
}

test("landing voice demo has a name and restores focus", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "next");
  await installPublicNetworkFixtures(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await assertExactPageLocation({
    baseURL: testInfo.project.use.baseURL,
    expectedHref: "/",
    page,
  });
  await expect(
    page
      .locator("#hero")
      .getByRole("link", { name: "Start a mock interview" })
      .locator("..")
  ).toHaveCSS("opacity", "1");
  await assertDialogFocusContract({
    dialogName: "Meelni voice demo",
    page,
    trigger: page.getByRole("button", { name: "Try voice demo" }),
  });
  activity.assertClean();
});

test("Explore sign-in dialog has a name and restores focus", async ({
  page,
}) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto("http://127.0.0.1:4173/?scenario=explore", {
    waitUntil: "domcontentloaded",
  });
  await assertExactPageLocation({
    expectedHref: "http://127.0.0.1:4173/?scenario=explore",
    page,
  });
  const trigger = page
    .getByRole("button", { name: /^Practice question:/ })
    .first();
  await expect(trigger).toBeVisible();
  await assertDialogFocusContract({
    dialogName: "Ready to practice?",
    page,
    trigger,
  });
  activity.assertClean();
});

test("interview end dialog has a name and restores focus", async ({ page }) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto("http://127.0.0.1:4173/?scenario=interview");
  await assertExactPageLocation({
    expectedHref: "http://127.0.0.1:4173/?scenario=interview",
    page,
  });
  await assertDialogFocusContract({
    dialogName: "End Interview?",
    page,
    trigger: page.getByRole("button", { name: "End interview" }),
  });
  activity.assertClean();
});
