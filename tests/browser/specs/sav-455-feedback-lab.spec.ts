import { expect, test } from "@playwright/test";

import {
  assertCriticalAccessibility,
  assertNoHorizontalOverflow,
} from "../support/assertions";
import { installBrowserActivityGuard } from "../support/public-fixtures";

const lab = (scenario: string) =>
  `http://127.0.0.1:4173/?scenario=feedback-lab&lab=${scenario}`;

test("SAV-455 renders the generated complete Scorecard with verified evidence", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto(lab("normal-product-sense"));

  await expect(
    page.getByRole("heading", { name: "Scorecard", exact: true })
  ).toBeVisible();
  await expect(page.getByText("Overall score", { exact: true })).toBeVisible();
  await expect(page.getByText("8", { exact: true })).toBeVisible();
  await expect(page.getByText("Supported", { exact: true })).toHaveCount(5);
  for (const dimension of [
    "Structure",
    "Clarity",
    "Insight",
    "Communication",
    "Leadership",
  ]) {
    await expect(
      page.locator("dt").filter({
        hasText: new RegExp(`^${dimension}\\s*Supported$`),
      })
    ).toBeVisible();
  }
  await expectGeneratedIntegrity(page);
  await expectOutcomeMatch(page, "scorecard");
  await expectDistinctCitationControls(page, 10);

  await assertNoHorizontalOverflow(page);
  await assertCriticalAccessibility(
    page,
    testInfo,
    "sav-455-feedback-lab-scorecard"
  );
  await attachScreenshot(page, testInfo, "scorecard");
  activity.assertClean();
});

test("SAV-455 renders generated Coaching without leaking scores", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto(lab("excluded-unverified-tail"));

  await expect(
    page.getByRole("heading", { name: "Coaching review", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Why there are no scores" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Verified interview scope" })
  ).toBeVisible();
  await expect(page.getByText("Overall score", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^\d+(?:\.\d+)?\/10$/)).toHaveCount(0);
  await expectGeneratedIntegrity(page);
  await expectOutcomeMatch(page, "coaching_review");
  await expectDistinctCitationControls(page, 4);

  await assertNoHorizontalOverflow(page);
  await assertCriticalAccessibility(
    page,
    testInfo,
    "sav-455-feedback-lab-coaching"
  );
  await attachScreenshot(page, testInfo, "coaching");
  activity.assertClean();
});

test("SAV-455 renders both generated Unable outcomes without scores", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto(lab("no-answer"));

  await expect(
    page.getByRole("heading", { name: "Unable to review" })
  ).toBeVisible();
  await expect(
    page.getByText(/did not contain enough verified candidate-answer evidence/i)
  ).toBeVisible();
  await expect(page.getByText("Overall score", { exact: true })).toHaveCount(0);
  await expectGeneratedIntegrity(page);
  await expectOutcomeMatch(page, "unable_to_review");
  await attachScreenshot(page, testInfo, "unable-no-answer");

  await page.goto(lab("corrupt"));
  await expect(
    page.getByRole("heading", { name: "Unable to review" })
  ).toBeVisible();
  await expect(
    page.getByText(/could not verify the saved interview evidence/i)
  ).toBeVisible();
  await expect(page.getByText("Overall score", { exact: true })).toHaveCount(0);
  await expectGeneratedIntegrity(page);
  await expectOutcomeMatch(page, "unable_to_review");

  await assertNoHorizontalOverflow(page);
  await assertCriticalAccessibility(
    page,
    testInfo,
    "sav-455-feedback-lab-unable"
  );
  await attachScreenshot(page, testInfo, "unable-integrity");
  activity.assertClean();
});

test("SAV-455 fails closed for generated unknown and lab-malformed artifacts", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto(lab("malformed-persisted-result"));

  await expect(
    page.getByRole("heading", { name: "Unable to review" })
  ).toBeVisible();
  await expect(
    page.getByText(/could not verify this saved review/i)
  ).toBeVisible();
  await expect(page.getByText("Overall score", { exact: true })).toHaveCount(0);
  await expectGeneratedIntegrity(page);
  await expectOutcomeMatch(page, "unavailable");
  await attachScreenshot(page, testInfo, "generated-unavailable");

  await page.goto(lab("malformed"));
  await expect(
    page.getByRole("heading", { name: "Feedback unavailable" })
  ).toBeVisible();
  await expect(
    page.getByText(/could not be verified, so no customer feedback is shown/i)
  ).toBeVisible();
  await expect(page.getByText("Lab-owned state", { exact: true })).toHaveCount(
    2
  );
  await expectOutcomeMatch(page, "unavailable");

  await assertNoHorizontalOverflow(page);
  await assertCriticalAccessibility(
    page,
    testInfo,
    "sav-455-feedback-lab-malformed"
  );
  await attachScreenshot(page, testInfo, "malformed");
  activity.assertClean();
});

test("SAV-455 keeps processing and loading announcements atomic", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto(lab("processing"));

  const firstScenarioButton = page
    .getByRole("navigation", { name: "Feedback Lab scenarios" })
    .getByRole("button")
    .first();
  await page.keyboard.press("Tab");
  await expect(firstScenarioButton).toBeFocused();
  const focusEvidence = await firstScenarioButton.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      boxShadow: style.boxShadow,
      height: rect.height,
      outlineStyle: style.outlineStyle,
    };
  });
  expect(focusEvidence.height).toBeGreaterThanOrEqual(44);
  expect(
    focusEvidence.boxShadow !== "none" || focusEvidence.outlineStyle !== "none",
    "focused scenario control must expose a visible focus indicator"
  ).toBe(true);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Unable to review" })
  ).toBeVisible();

  await page.goto(lab("processing"));
  const status = page.locator("[data-feedback-stage-status]");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(status).toHaveAttribute("aria-busy", "true");
  await expect(
    page.getByRole("heading", {
      name: /How would you prioritize a long list of competing synthetic customer needs/,
    })
  ).toBeVisible();
  await expectOutcomeMatch(page, "processing");
  await attachScreenshot(page, testInfo, "processing");

  await page.goto(lab("loading"));
  const loading = page.locator('[role="status"]').filter({
    has: page.getByText("Loading feedback", { exact: true }),
  });
  await expect(loading).toHaveAttribute("aria-live", "polite");
  await expect(loading).toHaveAttribute("aria-atomic", "true");
  await expect(loading).toHaveAttribute("aria-busy", "true");
  await expectOutcomeMatch(page, "loading");

  await assertNoHorizontalOverflow(page);
  await assertCriticalAccessibility(
    page,
    testInfo,
    "sav-455-feedback-lab-processing"
  );
  activity.assertClean();
});

async function expectGeneratedIntegrity(page: import("@playwright/test").Page) {
  await expect(
    page.getByText("SHA-256 verified", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("deterministic_provider_free", { exact: true })
  ).toBeVisible();
}

async function expectDistinctCitationControls(
  page: import("@playwright/test").Page,
  minimum: number
) {
  const citations = page.getByRole("button", {
    name: /^View .+ citation in transcript$/,
  });
  const count = await citations.count();
  expect(count).toBeGreaterThanOrEqual(minimum);
  const names = await citations.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label"))
  );
  expect(new Set(names).size).toBe(names.length);
  for (let index = 0; index < count; index += 1) {
    expect(
      (await citations.nth(index).boundingBox())?.height ?? 0
    ).toBeGreaterThanOrEqual(44);
  }
}

async function expectOutcomeMatch(
  page: import("@playwright/test").Page,
  expected: string
) {
  const labRoot = page.locator("[data-feedback-lab]");
  await expect(labRoot).toHaveAttribute(
    "data-feedback-lab-expected-outcome",
    expected
  );
  await expect(labRoot).toHaveAttribute(
    "data-feedback-lab-rendered-outcome",
    expected
  );
  await expect(
    page.locator("[data-feedback-lab-outcome-status]")
  ).toContainText("matches the rendered customer outcome");
}

async function attachScreenshot(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
  state: string
) {
  await testInfo.attach(`sav-455-${state}-${testInfo.project.name}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}
