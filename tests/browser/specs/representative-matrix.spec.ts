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

  if (surfaceId === "landing") {
    const ownsCenterPoint = (locator: ReturnType<typeof page.locator>) =>
      locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );
        return hit === element || element.contains(hit);
      });
    const settlePaint = () =>
      page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          })
      );
    const assertRejectedMutation = async (
      label: string,
      content: string,
      assertMutationApplied?: () => Promise<void>
    ) => {
      const mutation = await page.addStyleTag({ content });
      await settlePaint();
      await assertMutationApplied?.();
      await expect(
        assertPopupAccessibility(
          page,
          testInfo,
          `landing-open-popup-${label}-regression-proof`,
          dialogId!,
          { vaulDrawerPseudoReview: { surfaceId } }
        )
      ).rejects.toThrow(/Vaul review|color-contrast/u);
      await mutation.evaluate((element) =>
        element.parentNode?.removeChild(element)
      );
      await settlePaint();
    };

    await assertRejectedMutation(
      "geometry-overlay",
      `#${dialogId}::after { top: 0 !important; bottom: 0 !important; height: auto !important; z-index: 1 !important; }`
    );
    await assertRejectedMutation(
      "outline-overlay",
      `#${dialogId}::after { outline: 600px solid rgb(255, 0, 0) !important; outline-offset: 0 !important; }`
    );
    await assertRejectedMutation(
      "rendered-contrast",
      `#${dialogId} [data-vaul-review-node="description"] { -webkit-text-fill-color: rgb(255, 255, 255) !important; }`
    );
    const description = page.locator('[data-vaul-review-node="description"]');
    expect(await ownsCenterPoint(description)).toBe(true);
    await assertRejectedMutation(
      "stacking-order",
      `#${dialogId} [data-vaul-review-node="description"] { position: relative !important; z-index: -1 !important; }`,
      async () => expect(await ownsCenterPoint(description)).toBe(false)
    );
    const activation = page.locator('[data-vaul-review-node="activation"]');
    expect(await ownsCenterPoint(activation)).toBe(true);
    await assertRejectedMutation(
      "positioned-offset-interception",
      `#${dialogId} a:has([data-vaul-review-node="title"]) { top: 307px !important; left: 80px !important; }`,
      async () => expect(await ownsCenterPoint(activation)).toBe(false)
    );
    await assertRejectedMutation(
      "painted-border-overlay",
      `#${dialogId} [data-vaul-review-node="description"] { border: 300px solid rgb(255, 0, 0) !important; }`,
      async () => {
        const exceedsDrawer = await description.evaluate((element, id) => {
          const drawer = document.getElementById(id);
          if (!drawer) return false;
          const elementRect = element.getBoundingClientRect();
          const drawerRect = drawer.getBoundingClientRect();
          return (
            elementRect.left < drawerRect.left ||
            elementRect.top < drawerRect.top ||
            elementRect.right > drawerRect.right ||
            elementRect.bottom > drawerRect.bottom
          );
        }, dialogId!);
        expect(exceedsDrawer).toBe(true);
      }
    );
    await assertRejectedMutation(
      "non-hit-testable-paint-occlusion",
      `#${dialogId} > div:first-child::before { content: ""; position: fixed; left: 17px; bottom: 17px; width: 356px; height: 44px; background: rgb(255, 0, 0); z-index: 100; pointer-events: none; }`,
      async () => {
        expect(await ownsCenterPoint(activation)).toBe(true);
        const visuallyObscuresActivation = await page
          .locator(`#${dialogId} > div:first-child`)
          .evaluate((handle) => {
            const style = getComputedStyle(handle, "::before");
            const activation = document.querySelector(
              '[data-vaul-review-node="activation"]'
            );
            if (!(activation instanceof HTMLElement)) return false;
            const activationRect = activation.getBoundingClientRect();
            const width = Number.parseFloat(style.width);
            const height = Number.parseFloat(style.height);
            const left = Number.parseFloat(style.left);
            const bottom = Number.parseFloat(style.bottom);
            const top = window.innerHeight - bottom - height;
            const right = left + width;
            return (
              style.backgroundColor === "rgb(255, 0, 0)" &&
              style.opacity === "1" &&
              style.pointerEvents === "none" &&
              style.position === "fixed" &&
              style.zIndex === "100" &&
              left <= activationRect.left &&
              top <= activationRect.top &&
              right >= activationRect.right &&
              top + height >= activationRect.bottom
            );
          });
        expect(visuallyObscuresActivation).toBe(true);
      }
    );
    await assertRejectedMutation(
      "same-background-partial-occlusion",
      `#${dialogId} > div:first-child::after { content: ""; position: fixed; left: 17px; bottom: 17px; width: 200px; height: 44px; background: var(--primary); z-index: 100; pointer-events: none; }`,
      async () => {
        expect(await ownsCenterPoint(activation)).toBe(true);
        const partialOcclusion = await page
          .locator(`#${dialogId} > div:first-child`)
          .evaluate((handle) => {
            const style = getComputedStyle(handle, "::after");
            const activation = document.querySelector(
              '[data-vaul-review-node="activation"]'
            );
            if (!(activation instanceof HTMLElement)) return false;
            const activationStyle = getComputedStyle(activation);
            const activationRect = activation.getBoundingClientRect();
            const width = Number.parseFloat(style.width);
            const height = Number.parseFloat(style.height);
            const overlapWidth = Math.max(
              0,
              Math.min(17 + width, activationRect.right) -
                Math.max(17, activationRect.left)
            );
            const overlapHeight = Math.min(height, activationRect.height);
            const overlapRatio =
              (overlapWidth * overlapHeight) /
              (activationRect.width * activationRect.height);
            return (
              style.backgroundColor === activationStyle.backgroundColor &&
              style.pointerEvents === "none" &&
              style.position === "fixed" &&
              style.zIndex === "100" &&
              overlapRatio > 0.5 &&
              overlapRatio < 1
            );
          });
        expect(partialOcclusion).toBe(true);
      }
    );
  }

  const accessibility = await assertPopupAccessibility(
    page,
    testInfo,
    `${surfaceId}-open-popup`,
    dialogId!,
    { vaulDrawerPseudoReview: { surfaceId } }
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
