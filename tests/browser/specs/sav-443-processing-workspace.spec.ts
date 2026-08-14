import { expect, test } from "@playwright/test";

import {
  assertCriticalAccessibility,
  assertLayoutAndPrimaryAction,
  assertNoHorizontalOverflow,
} from "../support/assertions";
import { installBrowserActivityGuard } from "../support/public-fixtures";

const harness = (scenario: string) =>
  `http://127.0.0.1:4173/?scenario=${scenario}`;

test("SAV-443 keeps saved evidence useful while review is processing", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto(harness("feedback-processing-workspace"));

  const status = page.getByRole("status");
  await expect(status).toHaveAttribute("aria-busy", "true");
  await expect(
    page.getByRole("heading", {
      name: "How would you improve a synthetic planning product?",
    })
  ).toBeVisible();
  await expect(page.getByText("Interview saved").first()).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toContainText(
    "Feedback review"
  );
  await expect(
    page.getByText("Only finalized saved evidence is shown", { exact: false })
  ).toBeVisible();

  const expand = page.getByRole("button", {
    name: "Expand interview transcript",
  });
  await expand.click();
  await expect(
    page.getByText(/late-night support needs/).first()
  ).toBeVisible();

  await assertNoHorizontalOverflow(page);
  await assertCriticalAccessibility(
    page,
    testInfo,
    "sav-443-processing-workspace"
  );
  activity.assertClean();
});

test("SAV-443 paused polling is honest, accessible, and recoverable", async ({
  page,
}, testInfo) => {
  const activity = await installBrowserActivityGuard(page, "harness");
  await page.goto(harness("feedback-processing-workspace-paused"));

  const status = page.getByRole("status");
  await expect(status).toHaveAttribute("aria-busy", "false");
  await expect(
    page.getByRole("heading", { name: "Automatic checking paused" })
  ).toBeVisible();
  await expect(page.locator(".animate-spin")).toHaveCount(0);

  const checkAgain = page.getByRole("button", { name: "Check again" });
  await assertLayoutAndPrimaryAction({
    action: checkAgain,
    page,
    mobile: testInfo.project.name.startsWith("mobile"),
  });
  await assertCriticalAccessibility(
    page,
    testInfo,
    "sav-443-processing-workspace-paused"
  );
  activity.assertClean();
});
