import { expect, test } from "@playwright/test";

import { installBrowserActivityGuard } from "../support/public-fixtures";

const harness = (scenario: "dashboard-statuses" | "history-statuses") =>
  `http://127.0.0.1:4173/?scenario=${scenario}`;

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "SAV-337 owns one cross-viewport Chromium pass."
  );
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1280, height: 900 },
]) {
  test(`SAV-337 keeps dashboard status states contained at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const activity = await installBrowserActivityGuard(page, "harness");

    await page.goto(harness("dashboard-statuses"), {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByText("Recent interviews")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Review latest feedback" })
    ).toHaveAttribute(
      "data-browser-qa-href",
      "/feedback/browser-qa-evidence-limited"
    );
    await expect(
      page.getByText("Feedback ready — no score", { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByText("No feedback result is available for this interview.")
    ).toBeVisible();
    await expect(
      page.getByText("Not scored", { exact: true }).first()
    ).toBeVisible();
    await expectNoHorizontalScrollRegions(page);

    await page.goto(harness("history-statuses"), {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => document.fonts.ready);
    const history = page.getByRole("main");
    await expect(
      history.getByText("Interview History", { exact: true })
    ).toBeVisible();
    await expect(
      history
        .getByText("Feedback ready — no score", { exact: true })
        .filter({ visible: true })
    ).toBeVisible();
    await expect(
      history
        .getByRole("link", { name: "Review" })
        .filter({ visible: true })
        .first()
    ).toHaveAttribute(
      "data-browser-qa-href",
      "/feedback/browser-qa-evidence-limited"
    );
    await expect(
      history
        .getByText("Feedback unavailable", { exact: true })
        .filter({ visible: true })
        .first()
    ).toBeVisible();
    await expect(
      history
        .getByText("Not scored", { exact: true })
        .filter({ visible: true })
        .first()
    ).toBeVisible();
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
          !element.classList.contains("sr-only") &&
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
