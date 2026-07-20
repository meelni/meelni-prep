import { expect, test } from "@playwright/test";

import {
  assertCriticalAccessibility,
  assertDialogFocusContract,
  assertExactPageLocation,
  assertLayoutAndPrimaryAction,
  assertPopupAriaAccessibility,
  attachEvidence,
} from "../support/assertions";
import { BROWSER_QA_SURFACES } from "../support/matrix";
import {
  installBrowserActivityGuard,
  installPublicNetworkFixtures,
} from "../support/public-fixtures";

async function assertMobileNavigationPopupContract({
  page,
  surfaceId,
  testInfo,
}: {
  page: Parameters<typeof assertCriticalAccessibility>[0];
  surfaceId: "landing" | "pricing";
  testInfo: Parameters<typeof assertCriticalAccessibility>[1];
}) {
  const trigger = page.locator('button[aria-label="Open navigation menu"]');
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).not.toHaveAttribute("aria-controls");

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Meelni" });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const [controlledId, dialogId] = await Promise.all([
    trigger.getAttribute("aria-controls"),
    dialog.getAttribute("id"),
  ]);
  expect(controlledId).toBeTruthy();
  expect(controlledId).toBe(dialogId);

  const accessibility = await assertPopupAriaAccessibility(
    page,
    testInfo,
    `${surfaceId}-open-popup`
  );

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).not.toHaveAttribute("aria-controls");

  return {
    accessibility,
    relation: {
      closedControls: null,
      openControls: controlledId,
      targetId: dialogId,
      afterCloseControls: null,
    },
  };
}

async function assertExploreSelectPopupContract({
  page,
  testInfo,
}: {
  page: Parameters<typeof assertCriticalAccessibility>[0];
  testInfo: Parameters<typeof assertCriticalAccessibility>[1];
}) {
  const trigger = page.locator(
    'button[role="combobox"][aria-label="Filter by question type"]'
  );
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).not.toHaveAttribute("aria-controls");

  await trigger.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const [controlledId, listboxId] = await Promise.all([
    trigger.getAttribute("aria-controls"),
    listbox.getAttribute("id"),
  ]);
  expect(controlledId).toBeTruthy();
  expect(controlledId).toBe(listboxId);

  const accessibility = await assertPopupAriaAccessibility(
    page,
    testInfo,
    "explore-open-popup"
  );

  await page.keyboard.press("Escape");
  await expect(listbox).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).not.toHaveAttribute("aria-controls");

  return {
    accessibility,
    relation: {
      closedControls: null,
      openControls: controlledId,
      targetId: listboxId,
      afterCloseControls: null,
    },
  };
}

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
    if (
      surface.id === "new-interview" &&
      testInfo.project.name.startsWith("mobile")
    ) {
      await page.evaluate(async () => {
        window.scrollTo({ left: 0, top: 0, behavior: "auto" });
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      });
      const selectedDifficulty = page.getByRole("button", {
        name: /IC PM 2-4 years experience/,
      });
      const summary = page.getByRole("region", {
        name: "Interview summary",
      });
      const [selectedDifficultyBox, summaryBox] = await Promise.all([
        selectedDifficulty.boundingBox(),
        summary.boundingBox(),
      ]);
      expect(selectedDifficultyBox).not.toBeNull();
      expect(summaryBox).not.toBeNull();
      expect(
        summaryBox!.y,
        "mobile interview summary must not overlap the selected difficulty"
      ).toBeGreaterThanOrEqual(
        selectedDifficultyBox!.y + selectedDifficultyBox!.height - 1
      );
    }
    const accessibility = await assertCriticalAccessibility(
      page,
      testInfo,
      surface.id
    );
    let openPopupAccessibility = null;
    if (
      testInfo.project.name.startsWith("mobile") &&
      (surface.id === "landing" || surface.id === "pricing")
    ) {
      openPopupAccessibility = await assertMobileNavigationPopupContract({
        page,
        surfaceId: surface.id,
        testInfo,
      });
    }
    if (surface.id === "explore") {
      openPopupAccessibility = await assertExploreSelectPopupContract({
        page,
        testInfo,
      });
    }

    await attachEvidence(testInfo, {
      accessibility,
      layout,
      location,
      openPopupAccessibility,
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
