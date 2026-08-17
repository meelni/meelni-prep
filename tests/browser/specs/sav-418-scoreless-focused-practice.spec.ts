import { expect, test } from "@playwright/test";

import { installBrowserActivityGuard } from "../support/public-fixtures";

const harness = (scenario: string) =>
  `http://127.0.0.1:4173/?scenario=${scenario}`;

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "SAV-418 owns one cross-viewport Chromium pass."
  );
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  test(`SAV-418 completes grounded scoreless practice at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const activity = await installBrowserActivityGuard(page, "harness");
    await page.goto(harness("feedback-coaching-review"));

    const start = page.getByRole("button", { name: "Start focused practice" });
    await start.focus();
    await expect(start).toBeFocused();
    await expectMinimumTarget(start);
    await start.click();

    await expect(
      page.getByRole("heading", { name: "Deepen the user insight" })
    ).toBeVisible();
    await expect(page.getByText("5 minutes", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        /Use only the grounded focus and exact interview evidence selected by Meelni/
      )
    ).toBeVisible();
    await expect(page.getByText("Overall score", { exact: true })).toHaveCount(
      0
    );
    await expectNoHorizontalScroll(page);

    await page
      .getByLabel("Your revised answer")
      .fill(
        "I would connect the changing schedule need directly to the coordination decision."
      );
    await page
      .getByLabel(
        "I practiced this answer out loud before saving the self-review."
      )
      .check();
    const save = page.getByRole("button", { name: "Save self-review" });
    await expectMinimumTarget(save);
    await save.click();

    await expect(page.getByText("Completed focused practice")).toBeVisible();
    const returnToInterview = page.getByRole("link", {
      name: "Practice this question in another mock interview",
    });
    await expect(returnToInterview).toHaveAttribute(
      "data-browser-qa-href",
      "/dashboard/new-interview?questionId=browser-qa-question"
    );
    await expectMinimumTarget(returnToInterview);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(
      /sourceFingerprint|sourceFinding|signalCode|actionCode|transcriptRef|facetCode|answerBlockRef|schemaVersion|modelVersion/
    );
    await expectNoHorizontalScroll(page);
    activity.assertClean();
  });
}

test("SAV-418 shows a stable unavailable fallback and reflows at 200%", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium");
  await page.setViewportSize({ width: 390, height: 844 });
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto(harness("feedback-focused-practice-unavailable"));
  await page.getByRole("button", { name: "Start focused practice" }).click();

  const unavailableAlert = page.getByRole("alert").filter({
    hasText: "Focused practice is not available for this review",
  });
  await expect(unavailableAlert).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start focused practice" })
  ).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // A 195 CSS-pixel layout viewport exercises the same reflow pressure as a
  // 390px viewport at 200% browser zoom without relying on browser chrome.
  await page.setViewportSize({ width: 195, height: 422 });
  await expect(unavailableAlert).toBeVisible();
  await expectNoHorizontalScroll(page);
  activity.assertClean();
});

async function expectMinimumTarget(
  locator: import("@playwright/test").Locator
) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

async function expectNoHorizontalScroll(page: import("@playwright/test").Page) {
  const overflows = await page.locator("body *").evaluateAll((elements) =>
    elements
      .filter(
        (element) =>
          !element.classList.contains("sr-only") &&
          element.scrollWidth > element.clientWidth + 1 &&
          getComputedStyle(element).overflowX !== "clip"
      )
      .map((element) => ({
        tagName: element.tagName,
        text: element.textContent?.trim().slice(0, 80),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }))
  );
  expect(overflows).toEqual([]);
}
