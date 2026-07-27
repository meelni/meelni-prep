import { expect, test } from "@playwright/test";

import { installBrowserActivityGuard } from "../support/public-fixtures";

const harness = (scenario: "history-statuses" | "analytics" | "settings") =>
  `http://127.0.0.1:4173/?scenario=${scenario}`;

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "SAV-341 owns one cross-viewport Chromium pass."
  );
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`SAV-341 preserves dashboard hierarchy and containment at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const activity = await installBrowserActivityGuard(page, "harness");

    await page.goto(harness("history-statuses"), {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(
      page.getByRole("heading", { name: "Past interviews" })
    ).toBeVisible();
    await expect(page.getByText("Next review", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("Unavailable", { exact: true }).filter({ visible: true })
    ).toBeVisible();
    await expectNoHorizontalScrollRegions(page);

    await page.goto(harness("analytics"), {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(
      page.getByRole("heading", { name: "Focus next on structure" })
    ).toBeVisible();
    await expect(page.getByText("Next target", { exact: true })).toHaveCount(0);
    const barHeights = await page
      .locator("[data-progress-signal-bar]")
      .evaluateAll((bars) =>
        bars.map((bar) => bar.getBoundingClientRect().height)
      );
    expect(barHeights).toHaveLength(3);
    expect(barHeights.every((height) => height > 20)).toBe(true);
    await expectNoHorizontalScrollRegions(page);

    await page.goto(harness("settings"), {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => document.fonts.ready);
    if (viewport.width < 1024) {
      await page.getByRole("combobox", { name: "Settings section" }).click();
      await page.getByRole("option", { name: "Data & privacy" }).click();
    } else {
      await page.getByRole("button", { name: "Data & privacy" }).click();
    }

    const content = page.locator("[data-settings-content]");
    const before = await content.evaluate((element) => ({
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }));
    expect(before.overflowY).toBe("auto");
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
    await content.evaluate((element) => {
      element.scrollTop = Math.min(
        320,
        element.scrollHeight - element.clientHeight
      );
    });
    const after = await content.evaluate((element) => element.scrollTop);
    expect(after).toBeGreaterThan(before.scrollTop);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const deleteAction = page.getByRole("button", { name: "Delete" });
    await deleteAction.scrollIntoViewIfNeeded();
    await deleteAction.click();
    const dialog = page.getByRole("dialog", {
      name: "Request account deletion",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        "The request cannot be undone after it is accepted, and account access ends immediately."
      )
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(deleteAction).toBeFocused();
    await expectNoHorizontalScrollRegions(page);

    activity.assertClean();
  });
}

async function expectNoHorizontalScrollRegions(
  page: import("@playwright/test").Page
) {
  const offenders = await page.locator("body *").evaluateAll((elements) =>
    elements
      .filter(
        (element) =>
          element.scrollWidth > element.clientWidth + 1 &&
          getComputedStyle(element).overflowX !== "clip"
      )
      .map((element) => ({
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        tagName: element.tagName,
        text: element.textContent?.trim().slice(0, 80),
      }))
  );

  expect(offenders).toEqual([]);
}
