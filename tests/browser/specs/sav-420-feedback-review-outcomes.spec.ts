import { expect, test } from "@playwright/test";

import { installBrowserActivityGuard } from "../support/public-fixtures";

const harness = (scenario: string) =>
  `http://127.0.0.1:4173/?scenario=${scenario}`;

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "SAV-420 owns one cross-viewport Chromium pass."
  );
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`SAV-420 presents four honest outcomes at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const activity = await installBrowserActivityGuard(page, "harness");

    await page.goto(harness("feedback-full-scorecard"));
    await expect(
      page.getByRole("heading", { name: "Full scorecard" })
    ).toBeVisible();
    await expect(
      page.getByText("Overall score", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("8", { exact: true }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto(harness("feedback-partial-scorecard"));
    await expect(
      page.getByRole("heading", { name: "Partial scorecard" })
    ).toBeVisible();
    await expect(
      page.getByText("Not enough evidence", { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText("Overall score", { exact: true })).toHaveCount(
      0
    );
    await expect(
      page.getByRole("heading", { name: "Verified interview scope" })
    ).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await page.goto(harness("feedback-verified-prefix-partial-scorecard"));
    await expect(
      page.getByRole("heading", { name: "Verified interview scope" })
    ).toBeVisible();
    await expect(
      page.getByText(/only the 1 completed answer it could verify/i)
    ).toBeVisible();
    await expect(
      page.getByText(
        /was not treated as negative evidence; only verified completed answers could support the scores or coaching shown/i
      )
    ).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto(harness("feedback-coaching-review"));
    await expect(
      page.getByRole("heading", { name: "Coaching review" })
    ).toBeVisible();
    await expect(
      page.getByText("Evidence support", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Prioritized practice focus" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Verified interview scope" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "View Insight practice-focus citation in transcript",
      })
    ).toBeVisible();
    await expect(page.getByText("Overall score", { exact: true })).toHaveCount(
      0
    );
    await expectNoHorizontalScroll(page);

    await page.goto(harness("feedback-verified-prefix-coaching-review"));
    await expect(
      page.getByRole("heading", { name: "Verified interview scope" })
    ).toBeVisible();
    await expect(
      page.getByText(/only the 2 completed answers it could verify/i)
    ).toBeVisible();
    await expect(
      page.getByText(
        /was not treated as negative evidence; only verified completed answers could support the scores or coaching shown/i
      )
    ).toBeVisible();
    await expect(page.getByText("Overall score", { exact: true })).toHaveCount(
      0
    );
    await expectNoHorizontalScroll(page);

    await page.goto(harness("feedback-integrity"));
    await expect(
      page.getByRole("heading", { name: "Unable to review" })
    ).toBeVisible();
    await expect(
      page.getByText("Your interview credit was returned.")
    ).toBeVisible();
    await expect(
      page.getByText(/does not reflect your performance/i)
    ).toBeVisible();
    await expectNoHorizontalScroll(page);

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(
      /answer-block:|facetCode|modelVersion|schemaVersion/
    );
    activity.assertClean();
  });
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
