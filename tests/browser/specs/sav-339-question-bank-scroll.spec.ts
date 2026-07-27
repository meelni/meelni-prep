import { expect, test } from "@playwright/test";

import { installBrowserActivityGuard } from "../support/public-fixtures";

const harness = "http://127.0.0.1:4173/?scenario=question-bank";

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "SAV-339 owns one cross-viewport Chromium pass."
  );
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`SAV-339 keeps discovery controls stable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const activity = await installBrowserActivityGuard(page, "harness");

    await page.goto(harness, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);

    await expect(
      page.getByRole("heading", { name: "Question Bank" })
    ).toBeVisible();
    await expect(page.getByText("Start here", { exact: true })).toHaveCount(0);

    const controls = page
      .locator("[data-question-bank-controls]")
      .filter({ visible: true });
    const results = page.locator("[data-question-bank-list]");
    const firstRow = results.locator("[data-question-bank-row]").first();

    const before = {
      controls: await controls.boundingBox(),
      firstRow: await firstRow.boundingBox(),
      pageY: await page.evaluate(() => window.scrollY),
    };
    const resultDimensions = await results.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(resultDimensions.scrollHeight).toBeGreaterThan(
      resultDimensions.clientHeight
    );

    await results.evaluate((element) => {
      element.scrollTop = 320;
    });

    const after = {
      controls: await controls.boundingBox(),
      firstRow: await firstRow.boundingBox(),
      pageY: await page.evaluate(() => window.scrollY),
      resultsY: await results.evaluate((element) => element.scrollTop),
    };
    expect(after.resultsY).toBeGreaterThan(0);
    expect(after.pageY).toBe(before.pageY);
    expect(after.controls?.y).toBe(before.controls?.y);
    expect(after.firstRow?.y).toBeLessThan(before.firstRow?.y ?? 0);

    if (viewport.width < 1024) {
      await page.locator("summary").filter({ hasText: "Filters" }).click();
      await page
        .getByRole("combobox", { name: "Round" })
        .selectOption("Product Sense");
    } else {
      await page.getByRole("button", { name: "Product Sense 5" }).click();
      await expect(
        page.getByRole("button", { name: "All rounds 18" })
      ).toBeVisible();
    }
    await expect(results.locator("[data-question-bank-row]")).toHaveCount(5);
    await expect(page.getByText("5 questions match")).toBeVisible();

    await page.getByRole("textbox", { name: "Search" }).fill("Acme");
    await expect(results.locator("[data-question-bank-row]")).toHaveCount(1);
    await expect(page.getByText("1 question matches")).toBeVisible();

    const save = results
      .locator("[data-question-bank-row]")
      .getByRole("button", { name: /Save question|Save/ });
    await save.click();
    await expect(page.getByText("1 saved", { exact: false })).toBeVisible();

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
