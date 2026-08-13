import { expect, test } from "@playwright/test";

import {
  assertCriticalAccessibility,
  assertNoHorizontalOverflow,
} from "../support/assertions";
import { installBrowserActivityGuard } from "../support/public-fixtures";

const harness = (scenario: string) =>
  `http://127.0.0.1:4173/?scenario=${scenario}`;

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "SAV-415 owns one explicit 320px, 390px, and desktop Chromium pass."
  );
});

for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  test(`SAV-415 offers an accessible post-review response at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const activity = await installBrowserActivityGuard(page, "harness");

    await page.goto(harness("feedback-full-scorecard"));
    const qualityHeading = page.getByRole("heading", {
      name: "Did this review help?",
    });
    await expect(qualityHeading).toBeVisible();
    await expect(
      page.getByText(
        "Your response helps improve review quality. No interview text is included."
      )
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);

    const helpful = page.getByRole("button", { name: "Helpful", exact: true });
    const notHelpful = page.getByRole("button", {
      name: "Not helpful",
      exact: true,
    });
    for (const control of [helpful, notHelpful]) {
      await expect(control).toHaveAttribute("aria-pressed", "false");
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const sourceHeading = page.getByRole("heading", {
      name: "Observed practice scores",
    });
    const transcriptHeading = page.getByRole("heading", {
      name: "Interview transcript",
    });
    const qualityElement = await qualityHeading.elementHandle();
    const transcriptElement = await transcriptHeading.elementHandle();
    if (!qualityElement || !transcriptElement) {
      throw new Error("feedback quality placement headings were not rendered");
    }
    expect(
      await sourceHeading.evaluate(
        (source, quality) =>
          Boolean(source.compareDocumentPosition(quality) & 4),
        qualityElement
      )
    ).toBe(true);
    expect(
      await qualityHeading.evaluate(
        (quality, transcript) =>
          Boolean(quality.compareDocumentPosition(transcript) & 4),
        transcriptElement
      )
    ).toBe(true);

    await notHelpful.click();
    const reasonGroup = page.getByRole("group", {
      name: "What could be better? Optional",
    });
    await expect(reasonGroup).toBeVisible();
    const reason = page.getByRole("radio", {
      name: "The next step was unclear",
    });
    await reason.focus();
    await page.keyboard.press("Space");
    await expect(reason).toBeChecked();
    const reasonBox = await reason.locator("xpath=..").boundingBox();
    expect(reasonBox?.height).toBeGreaterThanOrEqual(44);

    await page.getByRole("button", { name: "Save response" }).click();
    await expect(page.getByRole("status")).toContainText("Response saved.");
    await expect(notHelpful).toHaveAttribute("aria-pressed", "true");
    await assertNoHorizontalOverflow(page);
    await assertCriticalAccessibility(
      page,
      testInfo,
      `sav-415-feedback-quality-${viewport.width}`
    );
    activity.assertClean();
  });
}

test("SAV-415 keeps reasons outcome-bound and hides unavailable outcomes", async ({
  page,
}) => {
  const activity = await installBrowserActivityGuard(page, "harness");

  await page.goto(harness("feedback-coaching-review"));
  await page.getByRole("button", { name: "Not helpful", exact: true }).click();
  await expect(
    page.getByRole("radio", {
      name: "Why scores were withheld was unclear",
    })
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "The score explanation was unclear" })
  ).toHaveCount(0);

  await page.goto(harness("feedback-partial-scorecard"));
  await page.getByRole("button", { name: "Not helpful", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "The score explanation was unclear" })
  ).toBeVisible();
  await expect(
    page.getByRole("radio", {
      name: "Why scores were withheld was unclear",
    })
  ).toHaveCount(0);

  for (const scenario of ["feedback-insufficient", "feedback-integrity"]) {
    await page.goto(harness(scenario));
    await expect(
      page.getByRole("heading", { name: "Did this review help?" })
    ).toHaveCount(0);
  }
  activity.assertClean();
});
