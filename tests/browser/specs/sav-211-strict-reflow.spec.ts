import { expect, test } from "@playwright/test";

import {
  assertCriticalAccessibility,
  assertLayoutAndPrimaryAction,
  assertNoHorizontalOverflow,
  attachEvidence,
} from "../support/assertions";
import {
  SAV_211_BROWSER_SCENARIOS,
  sav211PrimaryAction,
  sav211ScenarioHref,
} from "../support/sav-211-matrix";
import { installBrowserActivityGuard } from "../support/public-fixtures";

for (const scenario of SAV_211_BROWSER_SCENARIOS) {
  test(`SAV-211 ${scenario.id} preserves 195x422 strict reflow`, async ({
    page,
  }, testInfo) => {
    const activity = await installBrowserActivityGuard(page, "harness");
    await page.goto(sav211ScenarioHref(scenario.id), {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByText(scenario.expectedText).first()).toBeVisible();

    const primaryAction = sav211PrimaryAction(page, scenario.id);
    const layout = primaryAction
      ? await assertLayoutAndPrimaryAction({
          action: primaryAction,
          page,
          mobile: true,
        })
      : await assertNoHorizontalOverflow(page);

    if (scenario.id === "consent-undecided") {
      const viewport = page.viewportSize();
      expect(viewport).toEqual({ width: 195, height: 422 });
      for (const action of [
        page.getByRole("link", { name: "Read the privacy draft" }),
        page.getByRole("button", { name: "Decline" }),
        page.getByRole("button", { name: "Allow analytics" }),
      ]) {
        const box = await action.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    }

    const accessibility = await assertCriticalAccessibility(
      page,
      testInfo,
      `${scenario.id}-strict-reflow`
    );
    await attachEvidence(testInfo, {
      accessibility,
      layout,
      project: testInfo.project.name,
      scenario: scenario.id,
      unexpectedActivity: activity.unexpected,
      viewport: page.viewportSize(),
    });
    activity.assertClean();
  });
}
