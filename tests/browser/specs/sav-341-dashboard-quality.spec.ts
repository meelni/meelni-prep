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
    await expect(
      page.getByRole("navigation", { name: "Interview history pages" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    await expect(page.getByText("Next review", { exact: true })).toHaveCount(0);
    await expect(
      page
        .getByText("Feedback failed", { exact: true })
        .filter({ visible: true })
    ).toBeVisible();
    if (viewport.width < 1024) {
      const filterSelect = page.getByRole("combobox", {
        name: "Filter interviews by round",
      });
      await filterSelect.click();
      await page.getByRole("option", { name: "Strategy" }).click();
      await expect(filterSelect).toHaveText("Strategy");
    } else {
      const strategyFilter = page.getByRole("button", { name: "Strategy" });
      await strategyFilter.click();
      await expect(strategyFilter).toHaveAttribute("aria-pressed", "true");
    }
    await expect(
      page.getByText("Showing 1 match on this page (1–5 of 25 interviews)")
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
    const progressItems = page.locator("[data-progress-signal-item]");
    await expect(progressItems).toHaveCount(3);
    await expect(progressItems.nth(0)).toContainText("6.6");
    await expect(progressItems.nth(0)).toContainText("Jul 3");
    await expect(progressItems.nth(0)).toContainText("Product Sense");
    await expect(progressItems.nth(2)).toContainText("7.6");
    await expect(progressItems.nth(2)).toContainText("Jul 17");
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

    await expect(
      page.getByRole("group", { name: "Optional product analytics" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Analytics off" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Turn optional analytics on" })
    ).toBeVisible();

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

    const deleteAction = page.getByRole("button", { name: "Delete account" });
    await deleteAction.scrollIntoViewIfNeeded();
    await deleteAction.click();
    const dialog = page.getByRole("dialog", {
      name: "Request account deletion",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        "This permanently closes your account. If the request succeeds, you’ll be signed out immediately."
      )
    ).toBeVisible();
    const cancelContrast = await dialog
      .getByRole("button", { name: "Cancel" })
      .evaluate((element) => {
        const parseRgb = (value: string) =>
          value
            .match(/\d+(?:\.\d+)?/g)
            ?.slice(0, 3)
            .map(Number) ?? [0, 0, 0];
        const luminance = ([red, green, blue]: number[]) => {
          const [r, g, b] = [red, green, blue].map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const styles = getComputedStyle(element);
        const foreground = luminance(parseRgb(styles.color));
        const background = luminance(parseRgb(styles.backgroundColor));
        const ratio =
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05);

        return {
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          ratio,
        };
      });
    expect(cancelContrast.ratio).toBeGreaterThanOrEqual(4.5);
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
      .filter((element) => {
        const style = getComputedStyle(element);
        const isVisuallyHidden =
          style.position === "absolute" &&
          element.clientWidth <= 1 &&
          element.clientHeight <= 1;

        return (
          !isVisuallyHidden &&
          element.scrollWidth > element.clientWidth + 1 &&
          style.overflowX !== "clip"
        );
      })
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
