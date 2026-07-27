import { expect, test } from "@playwright/test";

import {
  assertCriticalAccessibility,
  assertDialogFocusContract,
  assertExactPageLocation,
  assertLayoutAndPrimaryAction,
  assertPopupAccessibility,
  attachEvidence,
} from "../support/assertions";
import { BROWSER_QA_SURFACES } from "../support/matrix";
import {
  installBrowserActivityGuard,
  installPublicNetworkFixtures,
} from "../support/public-fixtures";

async function assertMobileNavigationDrawerContract({
  actionName,
  currentDestination,
  page,
  surfaceId,
  testInfo,
  triggerName,
}: {
  actionName: string;
  currentDestination?: string;
  page: Parameters<typeof assertCriticalAccessibility>[0];
  surfaceId: "dashboard" | "landing" | "pricing";
  testInfo: Parameters<typeof assertCriticalAccessibility>[1];
  triggerName: string;
}) {
  const trigger = page.locator(`button[aria-label="${triggerName}"]`);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).not.toHaveAttribute("aria-controls");

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Meelni" });
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async (element) => {
    await Promise.allSettled(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished)
    );
  });
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const [controlledId, dialogId] = await Promise.all([
    trigger.getAttribute("aria-controls"),
    dialog.getAttribute("id"),
  ]);
  expect(controlledId).toBeTruthy();
  expect(controlledId).toBe(dialogId);

  const geometry = await dialog.evaluate((element) => {
    const dialogRect = element.getBoundingClientRect();
    const dialogStyle = getComputedStyle(element);

    return {
      bottom: dialogRect.bottom,
      height: dialogRect.height,
      left: dialogRect.left,
      position: dialogStyle.position,
      right: dialogRect.right,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: dialogRect.width,
    };
  });
  expect(geometry.position).toBe("fixed");
  expect(geometry.left).toBeCloseTo(0, 1);
  expect(geometry.bottom).toBeCloseTo(geometry.viewportHeight, 1);
  expect(geometry.height).toBeCloseTo(geometry.viewportHeight, 1);
  expect(geometry.width).toBeLessThan(geometry.viewportWidth);
  expect(geometry.width).toBeLessThanOrEqual(352);
  expect(geometry.right).toBeCloseTo(geometry.width, 1);

  await expect(dialog.getByRole("link", { name: actionName })).toBeVisible();
  if (currentDestination) {
    await expect(
      dialog.getByRole("link", { name: currentDestination })
    ).toHaveAttribute("aria-current", "page");
  }

  const accessibility = await assertPopupAccessibility(
    page,
    testInfo,
    `${surfaceId}-open-popup`,
    dialogId!
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

  if (testInfo.project.name.startsWith("mobile")) {
    await listbox.evaluate((element) => {
      const criticalRegression = document.createElement("img");
      criticalRegression.id = "open-popup-critical-regression";
      criticalRegression.src =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";
      element.append(criticalRegression);
    });
    await expect(
      assertPopupAccessibility(
        page,
        testInfo,
        "explore-open-popup-regression-proof",
        listboxId!
      )
    ).rejects.toThrow(/image-alt/u);
    await page
      .locator("#open-popup-critical-regression")
      .evaluate((element) => {
        element.remove();
      });
  }

  const accessibility = await assertPopupAccessibility(
    page,
    testInfo,
    "explore-open-popup",
    listboxId!
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
    if (surface.id === "settings") {
      const saveAction = page.getByRole("button", { name: "Save changes" });
      await expect(saveAction).toBeDisabled();
      await page.getByLabel("Display name").fill("Jordan Lee");
      await expect(saveAction).toBeEnabled();
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
      const startAction = page.getByRole("button", {
        name: "Start mock interview",
      });
      const changeSetup = page.getByRole("button", { name: "Change setup" });
      const [startBox, changeBox, viewport] = await Promise.all([
        startAction.boundingBox(),
        changeSetup.boundingBox(),
        page.viewportSize(),
      ]);
      expect(startBox).not.toBeNull();
      expect(changeBox).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(startBox!.y).toBeGreaterThanOrEqual(0);
      expect(startBox!.y + startBox!.height).toBeLessThanOrEqual(
        viewport!.height
      );
      expect(
        changeBox!.y,
        "setup customization must follow the real start action"
      ).toBeGreaterThanOrEqual(startBox!.y + startBox!.height - 1);
    }
    if (surface.id === "new-interview") {
      await expect(
        page.getByText("Recommended setup", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Start mock interview" })
      ).toBeVisible();
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
      openPopupAccessibility = await assertMobileNavigationDrawerContract({
        actionName: "Start a mock interview",
        page,
        surfaceId: surface.id,
        testInfo,
        triggerName: "Open navigation menu",
      });
    }
    if (
      testInfo.project.name.startsWith("mobile") &&
      surface.id === "dashboard"
    ) {
      openPopupAccessibility = await assertMobileNavigationDrawerContract({
        actionName: "New Mock Interview",
        currentDestination: "Overview",
        page,
        surfaceId: "dashboard",
        testInfo,
        triggerName: "Open workspace navigation",
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
    dialogName: "End interview?",
    page,
    trigger: page.getByRole("button", { name: "End interview" }),
  });
  activity.assertClean();
});
